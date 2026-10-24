export function shouldRestoreGoogleCustomerRole(
  role: string,
  completedJobs: number | null | undefined,
  totalJobs: number | null | undefined,
  hasAssignedJobs: boolean,
  isSameGoogleAccount: boolean,
): boolean {
  return isSameGoogleAccount && role === "freelancer" && !hasAssignedJobs && !(Number(completedJobs ?? 0) > 0 || Number(totalJobs ?? 0) > 0);
}
