import { storage } from "../storage";
import { JobStatus, EscrowStatus, ScheduledTaskStatus, getLevelPayout, getLevelFromEarnings } from "@shared/schema";

export async function runScheduledTasks() {
  const now = new Date();
  const pendingTasks = await storage.getPendingScheduledTasks(now);

  for (const task of pendingTasks) {
    try {
      console.log(`Running scheduled task: ${task.taskType} for job ${task.jobId}`);

      switch (task.taskType) {
        case "auto_complete":
          await handleAutoComplete(task.jobId!);
          break;
        case "job_expiration":
          await handleJobExpiration(task.jobId!);
          break;
        case "customer_reminder":
          await handleCustomerReminder(task.jobId!);
          break;
        case "cancellation_escalation":
          await handleCancellationEscalation(task.jobId!, task.metadata as any);
          break;
        default:
          console.warn(`Unknown task type: ${task.taskType}`);
      }

      await storage.updateScheduledTask(task.id, { status: ScheduledTaskStatus.COMPLETED });
    } catch (error) {
      console.error(`Error running scheduled task ${task.id}:`, error);
      await storage.updateScheduledTask(task.id, { status: "failed" as any });
    }
  }
}

async function handleAutoComplete(jobId: string) {
  const job = await storage.getJob(jobId);
  if (!job) return;

  if (job.status !== JobStatus.AWAITING_CUSTOMER) {
    return;
  }

  const submissions = await storage.getJobSubmissions(jobId);
  if (submissions.length === 0) return;

  const latestSubmission = submissions[0];

  await storage.createCustomerReview({
    jobId: job.id,
    submissionId: latestSubmission.id,
    customerId: job.customerId,
    accepted: true,
  });

  await storage.updateJobSubmission(latestSubmission.id, {
    status: "accepted",
  });

  const escrow = await storage.getEscrowByJob(job.id);
  if (escrow) {
    await storage.updateEscrow(escrow.id, { status: EscrowStatus.RELEASED });
  }

  // All freelancers on this job (lead + collaborators + job_freelancers), deduped.
  const freelancerIdSet = new Set<string>();
  if (job.freelancerId) freelancerIdSet.add(job.freelancerId);
  if (job.collaborators) {
    for (const id of job.collaborators) freelancerIdSet.add(id);
  }
  const jobFreelancers = await storage.getJobFreelancers(job.id);
  for (const jf of jobFreelancers) freelancerIdSet.add(jf.freelancerId);
  const allFreelancerIds = Array.from(freelancerIdSet);

  const budget = parseFloat(job.budget);
  const numFreelancers = allFreelancerIds.length;
  const sharePerFreelancer = numFreelancers > 0 ? budget / numFreelancers : 0;

  await storage.adjustPendingBalance(job.customerId, -budget);

  const customerWallet = await storage.getWallet(job.customerId);
  if (customerWallet) {
    const customerBalance = parseFloat(customerWallet.usdtBalance || "0");
    await storage.updateWallet(job.customerId, {
      usdtBalance: (customerBalance - budget).toFixed(8),
    });

    await storage.createTransaction({
      walletId: customerWallet.id,
      type: "escrow_release",
      currency: "USDT",
      amount: budget.toFixed(8),
      usdAmount: budget.toFixed(2),
      status: "completed",
      transactionHash: `auto-complete-${job.id}`,
    });
  }

  for (const freelancerId of allFreelancerIds) {
    const freelancer = await storage.getUser(freelancerId);
    if (!freelancer) continue;

    const level = freelancer.level || 1;
    const levelPayout = getLevelPayout(level);
    const payoutAmount = sharePerFreelancer * levelPayout;

    const freelancerWallet = await storage.getWallet(freelancerId);
    if (freelancerWallet) {
      const freelancerBalance = parseFloat(freelancerWallet.usdtBalance || "0");
      await storage.updateWallet(freelancerId, {
        usdtBalance: (freelancerBalance + payoutAmount).toFixed(8),
      });

      await storage.createTransaction({
        walletId: freelancerWallet.id,
        type: "deposit",
        currency: "USDT",
        amount: payoutAmount.toFixed(8),
        usdAmount: payoutAmount.toFixed(2),
        status: "completed",
        transactionHash: `auto-complete-payout-${job.id}-${freelancerId}`,
      });
    }

    await storage.createNotification({
      userId: freelancerId,
      type: "job_completed",
      title: "Job auto-completed!",
      message: `"${job.title}" was auto-completed after 4 days. You received $${payoutAmount.toFixed(2)}.`,
      relatedId: job.id,
      sourceType: "job",
      sourceId: job.id,
    });
  }

  // Mark job as completed FIRST (before updating stats)
  await storage.updateJob(job.id, {
    status: JobStatus.COMPLETED,
  });

  // NOW update freelancer stats after job is marked completed (increment completed count)
  for (const freelancerId of allFreelancerIds) {
    const fl = await storage.getUser(freelancerId);
    const earnedIncrement = sharePerFreelancer * getLevelPayout(fl?.level || 1);
    await updateFreelancerStats(freelancerId, true, earnedIncrement);
  }

  await storage.createNotification({
    userId: job.customerId,
    type: "job_completed",
    title: "Job auto-completed",
    message: `"${job.title}" was automatically completed after 4 days with no response.`,
    relatedId: job.id,
    sourceType: "job",
    sourceId: job.id,
  });
}

async function handleJobExpiration(jobId: string) {
  const job = await storage.getJob(jobId);
  if (!job) return;

  // Only expire jobs that are waiting for freelancer acceptance
  const expirableStatuses = [JobStatus.PENDING_ACCEPTANCE, "active", "pending_acceptance"];
  if (!expirableStatuses.includes(job.status)) {
    return;
  }

  const escrow = await storage.getEscrowByJob(job.id);
  if (escrow) {
    await storage.updateEscrow(escrow.id, { status: EscrowStatus.REFUNDED });
  }

  // Refund the customer's full locked amount (budget + premium), never just the budget,
  // and actually credit the wallet (previously it only recorded a transaction).
  const refundAmount = escrow && parseFloat(escrow.totalAmount)
    ? parseFloat(escrow.totalAmount)
    : (parseFloat(job.budget) + (parseFloat(job.premiumAmount || "0") || 0));
  await storage.adjustPendingBalance(job.customerId, -refundAmount);

  const customerWallet = await storage.getWallet(job.customerId);
  if (customerWallet) {
    const currentBalance = parseFloat(customerWallet.usdtBalance || "0");
    await storage.updateWallet(job.customerId, { usdtBalance: (currentBalance + refundAmount).toFixed(8) });
    await storage.createTransaction({
      walletId: customerWallet.id,
      type: "refund",
      currency: "USDT",
      amount: refundAmount.toFixed(8),
      usdAmount: refundAmount.toFixed(2),
      status: "completed",
      transactionHash: `job-expired-refund-${job.id}`,
    });
  }

  await storage.updateJob(job.id, {
    status: JobStatus.EXPIRED,
  });

  await storage.createNotification({
    userId: job.customerId,
    type: "job_expired",
    title: "Job expired",
    message: `"${job.title}" expired after 2 months with no acceptance. Funds refunded.`,
    relatedId: job.id,
    sourceType: "job",
    sourceId: job.id,
  });
}

// ── Project deadline reminders + deadline-arrival lifecycle ───────────────────
// Deadline reminder cadence escalates as the deadline approaches:
//   > 365 days out  -> no reminders yet
//   30–365 days     -> monthly (every 30 days)
//   7–30 days       -> weekly (every 7 days)
//   <= 7 days       -> daily (every 1 day)
// Reminders are gated by each freelancer's "Enable Notifications" preference.
const REMINDER_STATUSES: string[] = [
  JobStatus.IN_PROGRESS,
  JobStatus.CLAIMED,
  JobStatus.SUBMITTED,
  JobStatus.AWAITING_CUSTOMER,
];

function getJobFreelancerIds(job: any): string[] {
  const set = new Set<string>();
  if (job.freelancerId) set.add(job.freelancerId);
  if (job.collaborators) for (const id of job.collaborators) set.add(id);
  return Array.from(set);
}

export async function processDeadlines(): Promise<void> {
  const now = new Date();
  const allJobs = await storage.getJobs({});

  for (const job of allJobs) {
    if (!job.deadline) continue;

    const isWorking = REMINDER_STATUSES.includes(job.status);
    // A job is "taken" if any freelancer is assigned to it; otherwise it is still
    // a live market listing that nobody accepted before the deadline.
    const isLiveListing = job.status === JobStatus.ACTIVE;
    const hasFreelancer = !!(job.freelancerId || (job.collaborators && job.collaborators.length));
    if (!isWorking && !isLiveListing) continue;

    const deadl = new Date(job.deadline);
    const msUntil = deadl.getTime() - now.getTime();
    const daysUntil = msUntil / 86400000;

    // Timeline reminder for the freelancer(s) while the deadline is in the future.
    // Only relevant for jobs that have actually been taken (working statuses); a live
    // listing that nobody applied to has no freelancer worth reminding.
    if (isWorking && daysUntil > 0) {
      let intervalDays: number | null = null;
      if (daysUntil <= 7) intervalDays = 1;               // daily
      else if (daysUntil <= 30) intervalDays = 7;         // weekly
      else if (daysUntil <= 365) intervalDays = 30;       // monthly
      // daysUntil > 365 -> no reminder yet

      if (intervalDays !== null) {
        const last = job.lastDeadlineReminderAt ? new Date(job.lastDeadlineReminderAt).getTime() : 0;
        const due = !job.lastDeadlineReminderAt || (now.getTime() - last) >= intervalDays * 86400000;
        if (due) {
          const freelancerIds = getJobFreelancerIds(job);
          for (const freelancerId of freelancerIds) {
            const prefs = await storage.getUserPreferences(freelancerId);
            if (prefs && prefs.notificationsEnabled === false) continue;
            await storage.createNotification({
              userId: freelancerId,
              type: "reminder",
              title: "Project deadline approaching",
              message: `Quick reminder: your project deadline is approaching. Please share a progress update with the client and make sure everything stays on track.`,
              relatedId: job.id,
              sourceType: "job",
              sourceId: job.id,
              redirectUrl: `/jobs/${job.id}`,
            });
          }
          await storage.updateJob(job.id, { lastDeadlineReminderAt: new Date() });
        }
      }
    }

    // The deadline has arrived: flip the job into a "deadline reached" state and tell
    // the customer once (clicking the notification opens the job).
    if (msUntil <= 0) {
      if (job.status !== JobStatus.DEADLINE_REACHED) {
        await storage.updateJob(job.id, { status: JobStatus.DEADLINE_REACHED });
      }
      if (!job.deadlineArrivalNotified) {
        const prefs = await storage.getUserPreferences(job.customerId);
        if (!prefs || prefs.notificationsEnabled !== false) {
          // If nobody ever accepted the job, the customer's only sensible options are to
          // extend the deadline or delete the listing (there's no freelancer to pay/refund,
          // and no work to review). Otherwise they can extend / relist / end.
          const message = hasFreelancer
            ? `The deadline for "${job.title}" has arrived. Please review your options: extend the deadline, end the job, or put it back on the market.`
            : `The deadline for "${job.title}" has arrived and no freelancer accepted it. Please extend the deadline so more freelancers can apply, or delete the job.`;
          await storage.createNotification({
            userId: job.customerId,
            type: "reminder",
            title: "Your project's deadline has arrived!",
            message,
            relatedId: job.id,
            sourceType: "job",
            sourceId: job.id,
            redirectUrl: `/jobs/${job.id}`,
          });
        }
        await storage.updateJob(job.id, { deadlineArrivalNotified: true });
      }
    }
  }
}

async function handleCustomerReminder(jobId: string) {
  const job = await storage.getJob(jobId);
  if (!job) return;

  if (job.status !== JobStatus.AWAITING_CUSTOMER) {
    return;
  }

  await storage.createNotification({
    userId: job.customerId,
    type: "reminder",
    title: "Review pending work",
    message: `Work has been submitted for "${job.title}". Please review it soon or it will be auto-accepted.`,
    relatedId: job.id,
    sourceType: "system",
    sourceId: job.id,
  });
}

async function handleCancellationEscalation(jobId: string, metadata: { negotiationId: string }) {
  const job = await storage.getJob(jobId);
  if (!job) return;

  const negotiation = await storage.getCancellationNegotiation(metadata.negotiationId);
  if (!negotiation || negotiation.status !== "negotiating") {
    return;
  }

  await storage.updateCancellationNegotiation(negotiation.id, {
    status: "escalated",
  });

  await storage.createDispute({
    jobId: job.id,
    openedByUserId: "system",
    reason: "Cancellation negotiation failed to reach agreement within 7 days",
  });

  await storage.updateJob(job.id, {
    status: JobStatus.DISPUTE,
    isLocked: true,
  });

  const moderators = await storage.getUsers();
  const modRoles = ["staff", "moderator", "head_of_moderation", "founder"];
  for (const mod of moderators.filter(u => modRoles.includes(u.role))) {
    await storage.createNotification({
      userId: mod.id,
      type: "dispute_escalated",
      title: "Cancellation escalated to dispute",
      message: `Cancellation negotiation for "${job.title}" failed. Now in dispute.`,
      relatedId: job.id,
      sourceType: "dispute",
      sourceId: job.id,
    });
  }

  await storage.createNotification({
    userId: job.customerId,
    type: "dispute_escalated",
    title: "Cancellation escalated",
    message: `Negotiation timed out for "${job.title}". A moderator will now review.`,
    relatedId: job.id,
    sourceType: "dispute",
    sourceId: job.id,
  });

  if (job.freelancerId) {
    await storage.createNotification({
      userId: job.freelancerId,
      type: "dispute_escalated",
      title: "Cancellation escalated",
      message: `Negotiation timed out for "${job.title}". A moderator will now review.`,
      relatedId: job.id,
      sourceType: "dispute",
      sourceId: job.id,
    });
  }
}

async function updateFreelancerStats(freelancerId: string, incrementCompleted: boolean = false, earnedIncrement: number = 0) {
  const freelancer = await storage.getUser(freelancerId);
  if (!freelancer) return;

  // Counter-based completion rate: completedJobs / totalJobs (lifetime finished jobs).
  let completedJobs = freelancer.completedJobs || 0;
  let totalJobs = freelancer.totalJobs || 0;

  // If incrementing (job just completed), add 1 to both counters.
  if (incrementCompleted) {
    completedJobs = completedJobs + 1;
    totalJobs = totalJobs + 1;
  }

  const completionPercentage = totalJobs > 0
    ? ((completedJobs / totalJobs) * 100).toFixed(2)
    : "0.00";

  // Level is based on lifetime earnings, not completed jobs.
  const totalEarned = parseFloat(freelancer.totalEarned || "0") + earnedIncrement;
  const newLevel = getLevelFromEarnings(totalEarned);

  await storage.updateUser(freelancerId, {
    completedJobs,
    totalJobs,
    completionPercentage,
    totalEarned: totalEarned.toFixed(2),
    level: newLevel,
  });
}

// ── Weekly income payouts (every Sunday at 1:00 PM ET) ───────────────────────
let lastWeeklyPayoutSunday: string | null = null;

function getEasternDate(now: Date): Date {
  return new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
}

export async function checkWeeklyPayouts(): Promise<void> {
  const etDate = getEasternDate(new Date());
  // Sunday = 0, check for 1 PM (13:xx)
  if (etDate.getDay() !== 0 || etDate.getHours() !== 13) return;

  const sundayKey = etDate.toDateString();
  if (lastWeeklyPayoutSunday === sundayKey) return;
  lastWeeklyPayoutSunday = sundayKey;

  await runWeeklyPayouts();
}

async function runWeeklyPayouts(): Promise<void> {
  try {
    const incomes = await storage.getAllModeratorWeeklyIncomes();
    if (incomes.length === 0) return;

    const vault = await storage.getModerationVault();
    const vaultBalance = parseFloat(vault.balance || "0");
    const totalNeeded = incomes.reduce((sum, i) => sum + i.weeklyAmount, 0);

    if (totalNeeded <= 0) return;

    if (vaultBalance < totalNeeded) {
      console.warn(`[WeeklyPayouts] Insufficient vault balance ($${vaultBalance.toFixed(2)}) for total payouts ($${totalNeeded.toFixed(2)}). Skipping.`);
      return;
    }

    for (const income of incomes) {
      if (income.weeklyAmount <= 0) continue;
      const moderator = await storage.getUser(income.moderatorId);
      if (!moderator) continue;

      try {
        const transaction = await storage.distributeFromVault(
          income.weeklyAmount,
          income.moderatorId,
          "system",
          "Weekly income payout"
        );

        let wallet = await storage.getWallet(income.moderatorId);
        if (!wallet) {
          wallet = await storage.createWallet({
            userId: income.moderatorId,
            walletAddress: `0x${Math.random().toString(36).substring(2, 15)}`,
          });
        }
        const currentBalance = parseFloat(wallet.usdtBalance || "0");
        await storage.updateWallet(income.moderatorId, {
          usdtBalance: (currentBalance + income.weeklyAmount).toFixed(8),
        });

        await storage.createNotification({
          userId: income.moderatorId,
          type: "vault_distribution",
          title: "Weekly Income Received",
          message: `Your weekly income of $${income.weeklyAmount.toFixed(2)} has been deposited to your wallet.`,
          relatedId: transaction.id,
          sourceType: "system",
          sourceId: transaction.id,
        });
      } catch (err) {
        console.error(`[WeeklyPayouts] Failed payout for ${income.moderatorId}:`, err);
      }
    }

    console.log(`[WeeklyPayouts] Completed weekly payouts for ${incomes.length} moderator(s).`);
  } catch (error) {
    console.error("[WeeklyPayouts] Error running weekly payouts:", error);
  }
}


// ── Old job retention cleanup (daily) ───────────────────────────────────────
// Cancelled/completed jobs are deleted after a retention period so the store
// doesn't grow unbounded. Default 180 days; override with JOB_RETENTION_DAYS.
let lastRetentionRunDay: string | null = null;

export async function cleanupOldJobs(): Promise<void> {
  const todayKey = new Date().toDateString();
  if (lastRetentionRunDay === todayKey) return;
  lastRetentionRunDay = todayKey;

  const retentionDays = parseInt(process.env.JOB_RETENTION_DAYS || "180", 10);
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  try {
    const allJobs = await storage.getJobs({});
    const stale = allJobs.filter(j =>
      (j.status === JobStatus.CANCELLED || j.status === JobStatus.COMPLETED) &&
      j.updatedAt && new Date(j.updatedAt) < cutoff
    );

    for (const job of stale) {
      await storage.deleteJob(job.id);
      console.log(`[Retention] Deleted ${job.status} job "${job.title}" (id ${job.id})`);
    }
    if (stale.length > 0) {
      console.log(`[Retention] Cleaned up ${stale.length} old job(s)`);
    }
  } catch (error) {
    console.error("[Retention] Error during job cleanup:", error);
  }
}

let taskRunnerInterval: NodeJS.Timeout | null = null;

export function startScheduledTaskRunner(intervalMs: number = 60000) {
  if (taskRunnerInterval) {
    clearInterval(taskRunnerInterval);
  }

  console.log(`Starting scheduled task runner (interval: ${intervalMs}ms)`);

  runScheduledTasks();
  checkWeeklyPayouts();
  cleanupOldJobs();
  processDeadlines();

  taskRunnerInterval = setInterval(() => {
    runScheduledTasks();
    checkWeeklyPayouts();
    cleanupOldJobs();
    processDeadlines();
  }, intervalMs);
}

export function stopScheduledTaskRunner() {
  if (taskRunnerInterval) {
    clearInterval(taskRunnerInterval);
    taskRunnerInterval = null;
    console.log("Stopped scheduled task runner");
  }
}
