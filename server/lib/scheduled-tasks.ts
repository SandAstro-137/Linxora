import { storage } from "../storage";
import { JobStatus, EscrowStatus, ScheduledTaskStatus, getLevelPayout } from "@shared/schema";

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

  const jobFreelancers = await storage.getJobFreelancers(job.id);
  const allFreelancerIds = jobFreelancers.length > 0
    ? jobFreelancers.map(jf => jf.freelancerId)
    : job.freelancerId ? [job.freelancerId] : [];

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

    await updateFreelancerStats(freelancerId);
  }

  await storage.updateJob(job.id, {
    status: JobStatus.COMPLETED,
  });

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

  const budget = parseFloat(job.budget);
  await storage.adjustPendingBalance(job.customerId, -budget);

  const customerWallet = await storage.getWallet(job.customerId);
  if (customerWallet) {
    await storage.createTransaction({
      walletId: customerWallet.id,
      type: "refund",
      currency: "USDT",
      amount: budget.toFixed(8),
      usdAmount: budget.toFixed(2),
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

async function updateFreelancerStats(freelancerId: string) {
  const freelancer = await storage.getUser(freelancerId);
  if (!freelancer) return;

  const allJobs = await storage.getJobs();
  const assignedJobsMap = new Map();

  for (const j of allJobs) {
    if (j.freelancerId === freelancerId || j.collaborators?.includes(freelancerId)) {
      if (["claimed", "in_progress", "completed"].includes(j.status)) {
        assignedJobsMap.set(j.id, j);
      }
    }
  }

  const assignedJobs = Array.from(assignedJobsMap.values());
  const completedJobs = assignedJobs.filter(j => j.status === "completed").length;
  const totalJobs = assignedJobs.length;
  const completionPercentage = totalJobs > 0 ? ((completedJobs / totalJobs) * 100).toFixed(2) : "0.00";

  let newLevel = 1;
  if (completedJobs >= 50) newLevel = 5;
  else if (completedJobs >= 30) newLevel = 4;
  else if (completedJobs >= 15) newLevel = 3;
  else if (completedJobs >= 5) newLevel = 2;

  await storage.updateUser(freelancerId, {
    completedJobs,
    completionPercentage,
    level: newLevel,
  });
}

let taskRunnerInterval: NodeJS.Timeout | null = null;

export function startScheduledTaskRunner(intervalMs: number = 60000) {
  if (taskRunnerInterval) {
    clearInterval(taskRunnerInterval);
  }

  console.log(`Starting scheduled task runner (interval: ${intervalMs}ms)`);

  runScheduledTasks();

  taskRunnerInterval = setInterval(() => {
    runScheduledTasks();
  }, intervalMs);
}

export function stopScheduledTaskRunner() {
  if (taskRunnerInterval) {
    clearInterval(taskRunnerInterval);
    taskRunnerInterval = null;
    console.log("Stopped scheduled task runner");
  }
}
