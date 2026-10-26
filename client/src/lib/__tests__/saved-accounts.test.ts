import { strict as assert } from "node:assert";
import { clearSavedAccounts, getAccountsAllowedForCurrentUser, getGoogleLoginUrl, getSavedAccounts, getSavedAccountsForUser, getSwitchableAccounts, isDemoAccount, linkSavedAccounts, saveAccountProfile, saveAccountProfileIfRequested } from "../saved-accounts";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const storage = new MemoryStorage();
assert.deepEqual(getSavedAccounts(storage), [], "a new browser has no saved accounts");
storage.setItem("linxova:saved-accounts:v1", JSON.stringify([
  { id: "rylan-original", email: "rylanstrassburgeryt@gmail.com", username: "Rylan", role: "customer", avatar: null },
  { id: "rylan-copy", email: " RylanStrassburgerYT@gmail.com ", username: "Rylan copy", role: "customer", avatar: null },
  { id: "student-original", email: "rylan.strassburger28@student.tjca.org", username: "Student", role: "freelancer", avatar: null },
  { id: "student-copy", email: "RYLAN.STRASSBURGER28@STUDENT.TJCA.ORG", username: "Student copy", role: "freelancer", avatar: null },
]));
assert.deepEqual(
  getSavedAccounts(storage).map(account => account.id),
  ["rylan-original", "student-original"],
  "legacy saved-account lists collapse case/whitespace variants of duplicate email entries",
);
assert.deepEqual(
  JSON.parse(storage.getItem("linxova:saved-accounts:v1")!).map((account: { id: string }) => account.id),
  ["rylan-original", "student-original"],
  "cleaned saved-account list is persisted so duplicates stay removed",
);
clearSavedAccounts(storage);
assert.deepEqual(
  getSavedAccounts(storage),
  [],
  "deleting an account clears all previously saved swap accounts from the device",
);
assert.deepEqual(
  saveAccountProfileIfRequested({
    id: "existing-current-account",
    username: "Current",
    role: "customer",
  }, false, storage),
  [],
  "ordinary auth checks do not add accounts to Swap Accounts",
);
const returningEmailAccount = {
  id: "brand-new-google-account",
  discordId: "new-google-subject",
  username: "Rylan",
  role: "customer",
  email: "rylanstrassburgeryt@gmail.com",
};
assert.deepEqual(
  saveAccountProfileIfRequested(returningEmailAccount, false, storage),
  [],
  "a fresh Google account after deletion does not restore the former account to Swap Accounts automatically",
);
assert.deepEqual(getSavedAccounts(storage), [], "the former account stays absent until explicitly re-added");
assert.deepEqual(
  saveAccountProfileIfRequested(returningEmailAccount, true, storage).map(account => account.email),
  ["rylanstrassburgeryt@gmail.com"],
  "an account is saved again only when the user explicitly chooses Add Another Account",
);
clearSavedAccounts(storage);
const emptyStorage = new MemoryStorage();
assert.deepEqual(saveAccountProfile({
  id: "demo-founder",
  discordId: "demo-founder-1",
  username: "Founder",
  role: "founder",
}, emptyStorage).map(account => account.id), ["demo-founder"], "demo users can be cached locally for the dev-only demo switch list");

const firstAccount = {
  id: "google-user-1",
  discordId: "google-subject-1",
  username: "Account One",
  role: "customer",
  email: "one@example.com",
};
const secondAccount = {
  id: "google-user-2",
  discordId: "google-subject-2",
  username: "Account Two",
  role: "customer",
  email: "two@example.com",
};
const unrelatedAccount = {
  id: "google-user-3",
  discordId: "google-subject-3",
  username: "Account Three",
  role: "customer",
  email: "three@example.com",
};
const demoAccount = {
  id: "demo-user-1",
  discordId: "demo-customer-1",
  username: "Demo Customer",
  role: "customer",
  email: "demo-customer-1@demo.com",
  isDemo: true,
};
saveAccountProfile(firstAccount, storage);
saveAccountProfile(secondAccount, storage);
saveAccountProfile(unrelatedAccount, storage);
saveAccountProfile(demoAccount, storage);
linkSavedAccounts(firstAccount.id, secondAccount.id, storage);
assert.deepEqual(
  getSavedAccountsForUser(firstAccount.id, storage).map(account => account.id),
  [secondAccount.id, firstAccount.id],
  "accounts explicitly added together are available in each other's switch list",
);
assert.deepEqual(
  getSavedAccountsForUser(unrelatedAccount.id, storage).map(account => account.id),
  [unrelatedAccount.id],
  "a separate sign-in does not inherit another account group's switch options",
);
assert.deepEqual(
  getAccountsAllowedForCurrentUser(
    [...getSavedAccountsForUser(unrelatedAccount.id, storage), demoAccount],
    false,
    unrelatedAccount.id,
  ).map(account => account.id),
  [],
  "real accounts cannot see demo accounts in their swap list",
);
assert.equal(isDemoAccount(demoAccount), true, "demo identities are recognizable in the local swap list");
const secondDemoAccount = { ...demoAccount, id: "demo-user-2", username: "Demo Freelancer", email: "demo-freelancer-1@demo.com" };
assert.deepEqual(
  getAccountsAllowedForCurrentUser([firstAccount, demoAccount, secondDemoAccount], true, demoAccount.id).map(account => account.id),
  [secondDemoAccount.id],
  "demo accounts see other demos while excluding themselves and real accounts",
);
assert.deepEqual(
  getSavedAccountsForUser(undefined, storage),
  [],
  "no saved switch options are exposed until the current identity is known",
);
const duplicateStorage = new MemoryStorage();
saveAccountProfile(firstAccount, duplicateStorage);
const duplicateProfile = saveAccountProfile({
  ...firstAccount,
  id: "google-user-1-copy",
  email: " ONE@example.com ",
  username: "Duplicate One",
}, duplicateStorage);
assert.equal(
  duplicateProfile.filter(account => account.email?.trim().toLowerCase() === "one@example.com").length,
  1,
  "saving a new account record for an existing email does not add a duplicate swap entry",
);
assert.deepEqual(
  getSwitchableAccounts(getSavedAccountsForUser(secondAccount.id, storage), secondAccount.id).map(account => account.email?.trim().toLowerCase()),
  ["one@example.com"],
  "each unique email appears only once in the linked switch list, excluding the active account",
);
assert.deepEqual(
  getSwitchableAccounts(getSavedAccountsForUser(unrelatedAccount.id, storage), unrelatedAccount.id).map(account => account.id),
  [],
  "an account with no linked sign-ins has nothing to switch to",
);
assert.deepEqual(
  getSwitchableAccounts(getSavedAccounts(new MemoryStorage())).map(account => account.id),
  [],
  "a new browser has no saved accounts to switch to",
);
assert.equal(
  getGoogleLoginUrl(getSavedAccountsForUser(secondAccount.id, storage).find(account => account.email?.trim().toLowerCase() === "one@example.com")),
  "/api/auth/google?login_hint=one%40example.com",
  "switching starts Google auth with the selected account email as a sign-in hint",
);
assert.equal(getGoogleLoginUrl(), "/api/auth/google", "adding a new account starts Google account selection without a hint");
assert.equal(
  getGoogleLoginUrl(getSavedAccountsForUser(secondAccount.id, storage).find(account => account.email?.trim().toLowerCase() === "two@example.com")),
  "/api/auth/google?login_hint=two%40example.com",
  "switch fallback targets the selected account email rather than the currently active account",
);

console.log("Saved account switch regression checks passed");
