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

export async function applyAccountRestrictions(
  storage: IStorage,
  userId: string,
  action: "suspend" | "ban"
) {
  const work = await applyWorkRestrictions(storage, userId);
  const contact = action === "ban" ? await applyContactRestrictions(storage, userId) : { cancelledFriendRequests: 0 };
  return { ...work, ...contact };
}
