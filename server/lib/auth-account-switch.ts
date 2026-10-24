export interface AuthenticatedAccountSession {
  userId?: string;
  oauthState?: string;
  linkedAccountIds?: string[];
  addAccountUserId?: string;
  addAccountFlow?: boolean;
  authFlow?: "add-account";
  addAccountTargetUserId?: string;
  addAccountLinkedIds?: string[];
}

export function rememberLinkedAuthAccount(session: AuthenticatedAccountSession, userId: string): void {
  if (!userId) return;
  const linkedAccountIds = Array.isArray(session.linkedAccountIds) ? session.linkedAccountIds : [];
  if (!linkedAccountIds.includes(userId)) {
    session.linkedAccountIds = [...linkedAccountIds, userId];
  }
}

export function prepareAuthAccountAddition(session: AuthenticatedAccountSession, authenticatedUserId: string): boolean {
  if (!authenticatedUserId) return false;
  session.addAccountUserId = authenticatedUserId;
  session.addAccountLinkedIds = [...(session.linkedAccountIds || [])];
  delete session.addAccountTargetUserId;
  return true;
}

export function canSwitchToLinkedAuthAccount(session: AuthenticatedAccountSession, userId: string): boolean {
  return !!userId && Array.isArray(session.linkedAccountIds) && session.linkedAccountIds.includes(userId);
}

export function createGoogleOAuthState(nonce: string, addingAccount: boolean): string {
  return addingAccount ? `g:add:${nonce}` : `g:${nonce}`;
}

export function isGoogleAddAccountState(state?: string): boolean {
  return typeof state === "string" && state.startsWith("g:add:");
}

export function matchesGoogleOAuthState(sessionState: string | undefined, callbackState: string): boolean {
  return !!sessionState && sessionState === callbackState;
}

export function isAddAccountAuthFlow(session: AuthenticatedAccountSession, requestAddAccount: boolean): boolean {
  return requestAddAccount || session.addAccountFlow === true || session.authFlow === "add-account" || isGoogleAddAccountState(session.oauthState);
}

export function canCreateGoogleAccount(isAddingAccount: boolean, matchingAccountExists: boolean): boolean {
  return !isAddingAccount || matchingAccountExists;
}

export function matchesRequestedAuthAccount(session: AuthenticatedAccountSession, authenticatedUserId: string): boolean {
  return !session.addAccountTargetUserId || session.addAccountTargetUserId === authenticatedUserId;
}

export function completeAuthAccountLink(session: AuthenticatedAccountSession, authenticatedUserId: string): void {
  const previousAccountIds = [
    ...(session.addAccountLinkedIds || []),
    session.addAccountUserId,
  ];
  delete session.addAccountLinkedIds;
  delete session.addAccountUserId;
  delete session.addAccountFlow;
  delete session.authFlow;
  delete session.addAccountTargetUserId;

  for (const userId of previousAccountIds) {
    if (typeof userId === "string") rememberLinkedAuthAccount(session, userId);
  }
  rememberLinkedAuthAccount(session, authenticatedUserId);
  session.userId = authenticatedUserId;
}
