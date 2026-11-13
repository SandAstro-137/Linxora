import type { IStorage } from "../storage";

// Jobs that are finished or never started keep their history untouched.
const TERMINAL_JOB_STATUSES = new Set([
  "completed",
  "cancelled",
  "expired",
  "rejected",
  "draft",
  "pending_approval",
  "pending",
]);

export function isBannedAccount(user: { accountStatus?: string | null } | null | undefined) {
  return user?.accountStatus === "banned";
}

async function assignedFreelancerIds(storage: IStorage, job: any): Promise<Set<string>> {
  const ids = new Set<string>();
  if (job.freelancerId) ids.add(job.freelancerId);
  for (const id of job.collaborators ?? []) ids.add(id);
  const records = await storage.getJobFreelancers(job.id);
  for (const record of records) ids.add(record.freelancerId);
  return ids;
}

/**
 * Penalties shared by suspensions and bans: the user loses the work they were
 * lined up for, because they cannot sign in to do it.
 *
 * - every pending request to take a job is cancelled
 * - they are removed from every active job (leadership is handed over, or the
 *   job is reopened when nobody is left)
 */
export async function applyWorkRestrictions(storage: IStorage, userId: string) {
  const pendingRequests = await storage.getPendingJobRequestsByFreelancer(userId);
  for (const request of pendingRequests) {
    await storage.updateJobRequest(request.id, { status: "cancelled" });
  }

  const jobs = await storage.getJobs();
  const removedFromJobs: string[] = [];

  for (const job of jobs) {
    if (TERMINAL_JOB_STATUSES.has(job.status)) continue;

    const assigned = await assignedFreelancerIds(storage, job);
    if (!assigned.has(userId)) continue;

    const remaining = Array.from(assigned).filter((id) => id !== userId);
    const collaborators = (job.collaborators ?? []).filter((id: string) => id !== userId);

    const records = await storage.getJobFreelancers(job.id);
    if (records.some((record) => record.freelancerId === userId)) {
      await storage.removeJobFreelancer(job.id, userId);
    }

    const updates: Record<string, unknown> = { collaborators };
    const currentLeader = (job as any).projectLeaderId || job.freelancerId;

    if (job.freelancerId === userId) {
      // The lead was removed: hand the job to the next member, or reopen it.
      const next = remaining[0] || null;
      updates.freelancerId = next;
      updates.projectLeaderId = null;
      if (!next) updates.status = "active";
    } else if (currentLeader === userId) {
      updates.projectLeaderId = null;
    }

    await storage.updateJob(job.id, updates as any);
    removedFromJobs.push(job.id);

    await storage.createNotification({
      userId: job.customerId,
      type: "system",
      title: "A freelancer was removed from your job",
      message: `A freelancer on "${job.title}" is no longer able to work on it and has been removed from the job.`,
      relatedId: job.id,
      sourceType: "job",
      sourceId: job.id,
    });
  }

  return {
    cancelledRequests: pendingRequests.length,
    removedFromJobs,
  };
}

/**
 * Extra penalties that only a ban carries: nobody can reach the account.
 * Pending friend requests in either direction are cancelled so nobody is left
 * waiting on an account that cannot respond.
 */
export async function applyContactRestrictions(storage: IStorage, userId: string) {
  const friendRequests = await storage.getFriendRequestsByUser(userId);
  let cancelledFriendRequests = 0;

  for (const request of friendRequests) {
    if (request.status !== "pending") continue;
    await storage.updateFriendRequest(request.id, { status: "cancelled" });
    cancelledFriendRequests += 1;
  }

  return { cancelledFriendRequests };
}

// Jobs already finished, cancelled or never funded keep their money history.
const CLOSED_CUSTOMER_JOB_STATUSES = new Set(["completed", "cancelled", "expired", "draft", "rejected"]);

/**
 * Ban only: a banned customer cannot run their jobs any more, so every open job
 * they own is cancelled and its escrow is refunded into their wallet.
 */
export async function cancelCustomerJobsAndRefund(storage: IStorage, userId: string) {
  const jobs = await storage.getJobs();
  const cancelledJobs: string[] = [];
  let refundedTotal = 0;

  for (const job of jobs) {
    if (job.customerId !== userId) continue;
    if (CLOSED_CUSTOMER_JOB_STATUSES.has(job.status)) continue;

    const escrow = await storage.getEscrowByJob(job.id);
    let refundAmount = 0;
    if (escrow && escrow.status === "held") {
      refundAmount = parseFloat(escrow.totalAmount || "0");
    } else if (!escrow || escrow.status === "refunded") {
      refundAmount =
        parseFloat(job.budget || "0") +
        (job.isPremium ? parseFloat(job.premiumAmount || "0") : 0);
    }

    if (escrow && escrow.status === "held") {
      await storage.updateEscrow(escrow.id, { status: "refunded" });
    }

    if (refundAmount > 0) {
      const wallet = await storage.getWallet(userId);
      if (wallet) {
        await storage.updateWallet(userId, {
          usdtBalance: (parseFloat(wallet.usdtBalance || "0") + refundAmount).toFixed(8),
        });
        await storage.createTransaction({
          walletId: wallet.id,
          type: "refund",
          currency: "USDT",
          amount: refundAmount.toFixed(8),
          usdAmount: refundAmount.toFixed(2),
          status: "completed",
          transactionHash: `ban-refund-${job.id}-${Date.now()}`,
        });
      }
      refundedTotal += refundAmount;
    }

    await storage.updateJob(job.id, { status: "cancelled" } as any);
    cancelledJobs.push(job.id);

    const assigned = await assignedFreelancerIds(storage, job);
    for (const freelancerId of Array.from(assigned)) {
      await storage.createNotification({
        userId: freelancerId,
        type: "system",
        title: "Job cancelled",
        message: `"${job.title}" has been cancelled by the customer's account and is no longer active.`,
        relatedId: job.id,
        sourceType: "job",
        sourceId: job.id,
      });
    }
  }

  return { cancelledJobs, refundedTotal };
}

/**
 * Ban only: the wallet balance is sent back out the way the account was paid.
 * The platform pays out to the saved wallet address; without one the balance
 * stays on the wallet for support to settle.
 */
export async function payoutWalletBalance(storage: IStorage, userId: string) {
  const wallet = await storage.getWallet(userId);
  const balance = parseFloat(wallet?.usdtBalance || "0");
  if (!wallet || !(balance > 0)) return { paidOut: 0, destination: null as string | null };

  const destination = wallet.walletAddress?.trim();
  if (!destination) {
    return { paidOut: 0, destination: null, remainingBalance: balance };
  }

  await storage.updateWallet(userId, { usdtBalance: "0.00000000" });
  await storage.createTransaction({
    walletId: wallet.id,
    type: "withdrawal",
    currency: "USDT",
    amount: balance.toFixed(8),
    usdAmount: balance.toFixed(2),
    status: "completed",
    transactionHash: `ban-payout-${Date.now()}`,
  });

  return { paidOut: balance, destination };
}

export async function applyAccountRestrictions(
  storage: IStorage,
  userId: string,
  action: "suspend" | "ban"
) {
  const work = await applyWorkRestrictions(storage, userId);

  if (action === "suspend") {
    return {
      ...work,
      cancelledFriendRequests: 0,
      cancelledJobs: [] as string[],
      refundedTotal: 0,
      paidOut: 0,
      remainingBalance: 0,
    };
  }

  const contact = await applyContactRestrictions(storage, userId);
  const finances = await cancelCustomerJobsAndRefund(storage, userId);
  const payout = await payoutWalletBalance(storage, userId);

  return {
    ...work,
    ...contact,
    ...finances,
    paidOut: payout.paidOut,
    remainingBalance: (payout as { remainingBalance?: number }).remainingBalance ?? 0,
  };
}
