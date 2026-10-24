import { strict as assert } from "node:assert";
import { shouldApplyDemoIdentity } from "../demo-auth";
import { shouldApplyTabIdentity } from "../tab-auth";
import { getCurrentFreelancerJobs } from "../current-jobs";
import type { Job, JobFreelancer } from "@shared/schema";

assert.equal(shouldApplyDemoIdentity("development", true, "demo-customer-1"), true);
assert.equal(shouldApplyDemoIdentity("development", false, "demo-customer-1"), false);
assert.equal(shouldApplyDemoIdentity("development", undefined, "demo-customer-1"), false);
assert.equal(shouldApplyDemoIdentity("production", true, "demo-customer-1"), false);
assert.equal(shouldApplyDemoIdentity("development", true, undefined), false);
assert.equal(shouldApplyDemoIdentity("development", true, ""), false);

assert.equal(shouldApplyTabIdentity("development", "user-123"), true);
assert.equal(shouldApplyTabIdentity("production", "user-123"), false);
assert.equal(shouldApplyTabIdentity("development", ""), false);
assert.equal(shouldApplyTabIdentity("development", undefined), false);

const jobs = [
  { id: "mongo-job", freelancerId: null, collaborators: [], status: "claimed" },
  { id: "primary-job", freelancerId: "freelancer-1", collaborators: [], status: "claimed" },
  { id: "collaborator-job", freelancerId: "other", collaborators: ["freelancer-1"], status: "in_progress" },
  { id: "finished-job", freelancerId: null, collaborators: [], status: "completed" },
] as Job[];
const assignments = [
  { id: "assignment", jobId: "mongo-job", freelancerId: "freelancer-1", status: "accepted" },
  { id: "finished-assignment", jobId: "finished-job", freelancerId: "freelancer-1", status: "completed" },
] as JobFreelancer[];
const currentJobs = getCurrentFreelancerJobs("freelancer-1", jobs, assignments);
const currentJobIds = currentJobs.map(job => job.id);
assert.deepEqual(currentJobIds, ["mongo-job", "primary-job", "collaborator-job"]);
assert.equal(currentJobs.find(job => job.id === "mongo-job")?.freelancerId, null, "assignment lookup must not rewrite source job data");
assert.deepEqual(
  getCurrentFreelancerJobs("freelancer-1", jobs, [{ ...assignments[0], jobId: { toString: () => "mongo-job" } } as unknown as JobFreelancer]).map(job => job.id),
  ["mongo-job", "primary-job", "collaborator-job"],
);
assert.deepEqual(
  getCurrentFreelancerJobs("freelancer-1", jobs, [
    { ...assignments[0], status: "removed" },
    { ...assignments[1], status: "paid" },
  ]).map(job => job.id),
  ["primary-job", "collaborator-job"],
);

console.log("Demo identity and current-job regression checks passed");
