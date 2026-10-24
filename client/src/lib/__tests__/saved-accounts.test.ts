import { strict as assert } from "node:assert";
import { clearSavedAccounts, getGoogleLoginUrl, getSavedAccounts, getSwitchableAccounts, saveAccountProfile, saveAccountProfileIfRequested } from "../saved-accounts";

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
}, emptyStorage), [], "demo users are never stored as switchable accounts");

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
saveAccountProfile(firstAccount, storage);
saveAccountProfile(secondAccount, storage);
const duplicateProfile = saveAccountProfile({
  ...firstAccount,
  id: "google-user-1-copy",
  email: " ONE@example.com ",
  username: "Duplicate One",
}, storage);
assert.equal(
  duplicateProfile.filter(account => account.email?.trim().toLowerCase() === "one@example.com").length,
  1,
  "saving a new account record for an existing email does not add a duplicate swap entry",
);
assert.deepEqual(
  getSwitchableAccounts(getSavedAccounts(storage), secondAccount.id).map(account => account.email?.trim().toLowerCase()),
  ["one@example.com"],
  "each unique email appears only once in the switch list, excluding the active account",
);
assert.deepEqual(
  getSwitchableAccounts(getSavedAccounts(new MemoryStorage())).map(account => account.id),
  [],
  "a new account with no other saved sign-ins has nothing to switch to",
);
assert.equal(
  getGoogleLoginUrl(getSavedAccounts(storage).find(account => account.email?.trim().toLowerCase() === "one@example.com")),
  "/api/auth/google?login_hint=ONE%40example.com",
  "switching starts Google auth with the selected account email as a sign-in hint",
);
assert.equal(getGoogleLoginUrl(), "/api/auth/google", "adding a new account starts Google account selection without a hint");
assert.equal(
  getGoogleLoginUrl(getSavedAccounts(storage).find(account => account.email?.trim().toLowerCase() === "two@example.com")),
  "/api/auth/google?login_hint=two%40example.com",
  "switch fallback targets the selected account email rather than the currently active account",
);

console.log("Saved account switch regression checks passed");
