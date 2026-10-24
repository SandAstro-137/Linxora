import { strict as assert } from "node:assert";
import { canCreateGoogleAccount, canSwitchToLinkedAuthAccount, completeAuthAccountLink, createGoogleOAuthState, isAddAccountAuthFlow, isGoogleAddAccountState, matchesGoogleOAuthState, matchesRequestedAuthAccount, prepareAuthAccountAddition, rememberLinkedAuthAccount } from "../auth-account-switch";

const session: { linkedAccountIds?: string[] } = {};
assert.equal(canSwitchToLinkedAuthAccount(session, "account-a"), false, "unlinked accounts cannot be switched into");
rememberLinkedAuthAccount(session, "account-a");
rememberLinkedAuthAccount(session, "account-b");
rememberLinkedAuthAccount(session, "account-a");
assert.deepEqual(session.linkedAccountIds, ["account-a", "account-b"], "linked accounts are recorded once");
assert.equal(canSwitchToLinkedAuthAccount(session, "account-a"), true);
assert.equal(canSwitchToLinkedAuthAccount(session, "account-b"), true);
assert.equal(canSwitchToLinkedAuthAccount(session, "account-c"), false, "other users cannot switch into unlinked identities");
assert.equal(canCreateGoogleAccount(true, false), false, "adding an account cannot create a new Google account");
assert.equal(canCreateGoogleAccount(true, true), true, "adding an account can link a Google identity with an existing user");
assert.equal(canCreateGoogleAccount(false, false), true, "ordinary Google login may create a new user");
const addAccountState = createGoogleOAuthState("nonce-123", true);
const normalLoginState = createGoogleOAuthState("nonce-456", false);
assert.equal(addAccountState, "g:add:nonce-123");
assert.equal(normalLoginState, "g:nonce-456");
assert.equal(isGoogleAddAccountState(addAccountState), true);
assert.equal(isGoogleAddAccountState(normalLoginState), false);
assert.equal(matchesGoogleOAuthState(addAccountState, addAccountState), true, "marked OAuth state matches the callback value");
assert.equal(matchesGoogleOAuthState(addAccountState, normalLoginState), false, "OAuth state rejects a different callback value");
assert.equal(matchesGoogleOAuthState(normalLoginState, normalLoginState), true, "normal login state validation is preserved");
assert.equal(isAddAccountAuthFlow({ oauthState: addAccountState }, false), true, "callback can recover add-account mode from signed session state");

const addAccountSession: {
  userId?: string;
  linkedAccountIds?: string[];
  addAccountUserId?: string;
  addAccountTargetUserId?: string;
  addAccountLinkedIds?: string[];
} = {
  userId: "current-account",
  linkedAccountIds: ["current-account"],
};
assert.equal(prepareAuthAccountAddition(addAccountSession, "current-account"), true, "a signed-in session captures its active account before starting OAuth");
assert.equal(addAccountSession.addAccountUserId, "current-account");
assert.deepEqual(addAccountSession.addAccountLinkedIds, ["current-account"]);
addAccountSession.addAccountTargetUserId = "selected-account";
assert.equal(matchesRequestedAuthAccount(addAccountSession, "selected-account"), true, "OAuth verifies that the selected identity matches the target");
assert.equal(matchesRequestedAuthAccount(addAccountSession, "current-account"), false, "OAuth rejects signing back into the previously active identity");
completeAuthAccountLink(addAccountSession, "selected-account");
assert.equal(addAccountSession.userId, "selected-account", "OAuth callback makes the selected identity active");
assert.deepEqual(addAccountSession.linkedAccountIds, ["current-account", "selected-account"], "OAuth callback links both identities");
assert.equal(addAccountSession.addAccountUserId, undefined, "pending link target is cleared after OAuth");
assert.equal(addAccountSession.addAccountTargetUserId, undefined, "expected OAuth identity is cleared after linking");
assert.equal(addAccountSession.addAccountLinkedIds, undefined, "pending linked IDs are cleared after OAuth");

console.log("Authenticated account switching checks passed");
