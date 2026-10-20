import { strict as assert } from "node:assert";
import { MemStorage } from "../../storage";
import { JobFreelancerStatus, JobStatus } from "@shared/schema";
import { getRemainingWalletBalance, getWalletBalanceBlockReason, hasSufficientWalletBalance, isFullWalletWithdrawal, subtractWalletBalance } from "../wallet-amounts";

async function createUser(storage: MemStorage, discordId: string, role: string) {
  return storage.createUser({ discordId, username: discordId, role });
}

async function createJob(storage: MemStorage, customerId: string, overrides: Record<string, unknown> = {}) {
  return storage.createJob({
    customerId,
    title: "Deletion guard test job",
    description: "Job for account deletion guard regression testing.",
    category: "Testing",
    budget: "100",
    deadline: new Date(Date.now() + 60_000),
    status: JobStatus.CLAIMED,
    ...overrides,
  } as any);
}

const storage = new MemStorage();
const customer = await createUser(storage, "guard-customer", "customer");
const primary = await createUser(storage, "guard-primary", "freelancer");
const collaborator = await createUser(storage, "guard-collaborator", "freelancer");
const otherPrimary = await createUser(storage, "guard-other-primary", "freelancer");
const assignedFreelancer = await createUser(storage, "guard-assignment", "freelancer");
const walletUser = await createUser(storage, "guard-wallet", "customer");
const pendingApplicationUser = await createUser(storage, "guard-pending-application", "freelancer");
const pendingTransactionUser = await createUser(storage, "guard-pending-transaction", "customer");
const eligibleUser = await createUser(storage, "guard-eligible", "customer");
const otherCustomer = await createUser(storage, "guard-other-customer", "customer");

// A cents-rounded withdrawal can leave a fraction-of-a-cent balance. The
// full-precision Max withdrawal must clear it so eligibility updates.
const withdrawnWallet = await storage.createWallet({ userId: walletUser.id, usdtBalance: "10.00456789" });
const centsAmount = Number(withdrawnWallet.usdtBalance).toFixed(2);
assert.equal(centsAmount, "10.00");
assert.ok(hasSufficientWalletBalance(withdrawnWallet.usdtBalance!, Number(centsAmount)));
let remainingBalance = subtractWalletBalance(withdrawnWallet.usdtBalance!, Number(centsAmount));
assert.equal(remainingBalance, "0.00456789");
await storage.updateWallet(walletUser.id, { usdtBalance: remainingBalance });
assert.match((await storage.getAccountDeletionBlockReason(walletUser.id)) ?? "", /Wallet funds remain/i);

const preciseMax = Number(remainingBalance).toFixed(8);
assert.equal(preciseMax, "0.00456789");
assert.ok(hasSufficientWalletBalance(remainingBalance, Number(preciseMax)));
assert.ok(isFullWalletWithdrawal(Number(remainingBalance), Number(preciseMax)));
remainingBalance = getRemainingWalletBalance(remainingBalance, Number(preciseMax));
await storage.updateWallet(walletUser.id, { usdtBalance: remainingBalance });
assert.equal((await storage.getWallet(walletUser.id))?.usdtBalance, "0");
assert.equal(await storage.getAccountDeletionBlockReason(walletUser.id), null);

await storage.updateWallet(walletUser.id, { usdtBalance: "0", pendingUsdtBalance: "0.01" });
assert.match((await storage.getAccountDeletionBlockReason(walletUser.id)) ?? "", /Pending funds — wait for them to settle/i);
assert.match((await storage.getAccountDeletionBlockReasons(walletUser.id))[0], /Pending funds — wait for them to settle/i);
await assert.rejects(storage.deleteAccount(walletUser.id), /Pending funds — wait for them to settle/i);
assert.ok(await storage.getUser(walletUser.id), "funds must block deletion without removing the account");
await storage.updateWallet(walletUser.id, { pendingUsdtBalance: "0" });
await storage.updateWallet(walletUser.id, { usdtBalance: "0.00000001" });
assert.match((await storage.getAccountDeletionBlockReason(walletUser.id)) ?? "", /Wallet funds remain.*withdraw or spend/i);
assert.match((await storage.getAccountDeletionBlockReasons(walletUser.id))[0], /Wallet funds remain.*withdraw or spend/i);
await storage.updateWallet(walletUser.id, { usdtBalance: "0" });
assert.equal(await storage.getAccountDeletionBlockReason(walletUser.id), null, "zero USDT balance is eligible when no other blockers exist");
await storage.updateWallet(walletUser.id, { btcBalance: "0.00000001", solBalance: "12.5", ltcBalance: "8.2" } as any);
assert.equal(await storage.getAccountDeletionBlockReason(walletUser.id), null, "legacy altcoin fields are ignored by USDT-only eligibility");
assert.equal(getWalletBalanceBlockReason([
  { currency: "USDT", balance: "0" },
]) ?? null, null);
assert.match(getWalletBalanceBlockReason([
  { currency: "USDT", balance: "0.00000001" },
]) ?? "", /USDT 0\.00000001/);
const pendingFundsAndWalletFunds = await storage.updateWallet(walletUser.id, { usdtBalance: "0.25", pendingUsdtBalance: "0.5" });
assert.equal(pendingFundsAndWalletFunds?.usdtBalance, "0.25");
assert.equal(pendingFundsAndWalletFunds?.pendingUsdtBalance, "0.5");
const walletIssues = await storage.getAccountDeletionBlockReasons(walletUser.id);
assert.ok(walletIssues.some(issue => /Wallet funds remain/i.test(issue)));
assert.ok(walletIssues.some(issue => /Pending funds/i.test(issue)));
await storage.updateWallet(walletUser.id, { usdtBalance: "0", pendingUsdtBalance: "0" });

const pendingWallet = await storage.createWallet({ userId: pendingTransactionUser.id });
await storage.createTransaction({
  walletId: pendingWallet.id,
  type: "withdrawal",
  currency: "USDT",
  amount: "1",
  status: "processing",
});
assert.match((await storage.getAccountDeletionBlockReason(pendingTransactionUser.id)) ?? "", /Pending wallet transaction — wait for it to complete/i);
assert.match((await storage.getAccountDeletionBlockReasons(pendingTransactionUser.id))[0], /Pending wallet transaction — wait for it to complete/i);

await storage.createJob({
  customerId: otherCustomer.id,
  title: "Pending application test job",
  description: "Open job for pending application guard testing.",
  category: "Testing",
  budget: "100",
  deadline: new Date(Date.now() + 60_000),
  status: JobStatus.ACTIVE,
} as any).then(job => storage.createJobRequest({ jobId: job.id, freelancerId: pendingApplicationUser.id, status: "pending" }));
assert.match((await storage.getAccountDeletionBlockReason(pendingApplicationUser.id)) ?? "", /Pending job application — withdraw or resolve/i);
assert.match((await storage.getAccountDeletionBlockReasons(pendingApplicationUser.id))[0], /Pending job application — withdraw or resolve/i);
await assert.rejects(storage.deleteAccount(pendingApplicationUser.id), /Pending job application — withdraw or resolve/i);
assert.ok(await storage.getUser(pendingApplicationUser.id), "pending applications must block deletion");

const draftJob = await createJob(storage, eligibleUser.id, { status: JobStatus.DRAFT });
assert.match((await storage.getAccountDeletionBlockReason(eligibleUser.id)) ?? "", /Job posted or pending — cancel or complete/i);
await storage.updateJob(draftJob.id, { status: JobStatus.CANCELLED });
assert.equal(await storage.getAccountDeletionBlockReason(eligibleUser.id), null);

const completedJob = await createJob(storage, eligibleUser.id, { status: JobStatus.COMPLETED });

const zeroBalanceDeleteUser = await createUser(storage, "guard-zero-balance-delete", "customer");
const zeroBalanceDeleteWallet = await storage.createWallet({
  userId: zeroBalanceDeleteUser.id,
  usdtBalance: "0",
  pendingUsdtBalance: "0",
});
assert.equal(zeroBalanceDeleteWallet.usdtBalance, "0");
assert.equal(zeroBalanceDeleteWallet.pendingUsdtBalance, "0");
assert.deepEqual(await storage.getAccountDeletionBlockReasons(zeroBalanceDeleteUser.id), []);
await storage.deleteAccount(zeroBalanceDeleteUser.id);
assert.equal(await storage.getUser(zeroBalanceDeleteUser.id), undefined, "zero-balance account with no jobs or escrow can be deleted");

const primaryJob = await createJob(storage, customer.id, { freelancerId: primary.id });
assert.match((await storage.getAccountDeletionBlockReason(customer.id)) ?? "", /Job posted or pending — cancel or complete/i);
assert.match((await storage.getAccountDeletionBlockReason(primary.id)) ?? "", /In a job — exit or complete/i);
await assert.rejects(storage.deleteAccount(primary.id), /In a job — exit or complete/i);
assert.ok(await storage.getUser(primary.id), "blocked deletion must leave the account intact");

const collaboratorJob = await createJob(storage, customer.id, {
  freelancerId: otherPrimary.id,
  collaborators: [collaborator.id],
});
assert.match((await storage.getAccountDeletionBlockReason(collaborator.id)) ?? "", /In a job — exit or complete/i);

const assignmentJob = await createJob(storage, customer.id, { freelancerId: null });
await storage.createJobFreelancer({
  jobId: assignmentJob.id,
  freelancerId: assignedFreelancer.id,
  shareAmount: "100",
  levelAtTime: 1,
  status: JobFreelancerStatus.ACCEPTED,
});
assert.match((await storage.getAccountDeletionBlockReason(assignedFreelancer.id)) ?? "", /In a job — exit or complete/i);

await storage.updateJob(primaryJob.id, { status: JobStatus.COMPLETED });
assert.equal(await storage.getAccountDeletionBlockReason(primary.id), null);

await storage.updateJob(collaboratorJob.id, { status: JobStatus.CANCELLED });
assert.equal(await storage.getAccountDeletionBlockReason(collaborator.id), null);

await storage.updateJob(assignmentJob.id, { status: JobStatus.CANCELLED });
assert.equal(await storage.getAccountDeletionBlockReason(assignedFreelancer.id), null);

await storage.updateJobFreelancer(
  (await storage.getJobFreelancers(assignmentJob.id))[0].id,
  { status: JobFreelancerStatus.REMOVED },
);
assert.equal(await storage.getAccountDeletionBlockReason(assignedFreelancer.id), null);

await storage.deleteAccount(eligibleUser.id);
assert.equal(await storage.getUser(eligibleUser.id), undefined, "successful deletion must remove the user record");
assert.notEqual((await storage.getJob(completedJob.id))?.customerId, eligibleUser.id, "historic jobs must not retain the deleted user ID");
assert.equal((await storage.getJob(completedJob.id))?.title, "[deleted]", "historic job content authored by the deleted customer must be redacted");
assert.equal(await storage.getUserByDiscordId("guard-eligible"), undefined, "deleted users must not be recoverable by provider login ID");
assert.equal(await storage.getWallet(eligibleUser.id), undefined, "successful deletion must remove the user's wallet");
assert.equal(await storage.getUser(walletUser.id), walletUser, "accounts blocked by wallet funds remain unchanged");

console.log("Account deletion eligibility and erasure regression checks passed");
