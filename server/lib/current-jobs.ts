import type { Job, JobFreelancer } from "@shared/schema";

export function getCurrentFreelancerJobs(
  userId: string,
  jobs: Job[],
  assignments: JobFreelancer[],
): Job[] {
  const assignmentJobIds = new Set(
    assignments
      .filter(assignment => !["removed", "completed", "paid"].includes(assignment.status))
      .map(assignment => String(assignment.jobId))
  );

  const matchingJobs = jobs.filter(job =>
    (job.freelancerId != null && String(job.freelancerId) === userId) ||
    job.collaborators?.some(collaboratorId => String(collaboratorId) === userId) ||
    assignmentJobIds.has(String(job.id))
  );

  return matchingJobs;
}
