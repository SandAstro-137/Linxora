export interface EmailOwner {
  id: string;
  email?: string | null;
  pendingEmail?: string | null;
}

export class EmailAlreadyInUseError extends Error {
  constructor() {
    super("This email address is already in use.");
    this.name = "EmailAlreadyInUseError";
  }
}

export function normalizeEmailAddress(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

export function findEmailAccount<T extends EmailOwner>(
  users: Iterable<T>,
  email: string | null | undefined,
): T | undefined {
  const normalizedEmail = normalizeEmailAddress(email);
  if (!normalizedEmail) return undefined;
  // Callers pass the storage's stable oldest-first account list so legacy
  // duplicates resolve to the original account rather than a recent copy.
  return Array.from(users).find(user => normalizeEmailAddress(user.email) === normalizedEmail);
}

export function resolveGoogleEmailAccount<T extends EmailOwner>(
  googleSubjectAccount: T | undefined,
  emailAccount: T | undefined,
  googleEmail: string | null | undefined,
): T | undefined {
  if (!emailAccount) return googleSubjectAccount;
  if (!googleSubjectAccount || googleSubjectAccount.id === emailAccount.id) return emailAccount;

  // Historical duplicate accounts may each be tied to a different Google
  // subject while claiming the same email. Route those sign-ins to the stable
  // email owner, not whichever duplicate happens to match the subject first.
  return normalizeEmailAddress(googleSubjectAccount.email) === normalizeEmailAddress(googleEmail)
    ? emailAccount
    : googleSubjectAccount;
}

export function findEmailConflict<T extends EmailOwner>(
  users: Iterable<T>,
  emailAddresses: Array<string | null | undefined>,
  excludeUserId?: string,
): T | undefined {
  const normalizedAddresses = emailAddresses.map(normalizeEmailAddress).filter((email): email is string => !!email);
  if (new Set(normalizedAddresses).size !== normalizedAddresses.length) return undefined;
  const claimedEmails = new Set(normalizedAddresses);
  if (claimedEmails.size === 0) return undefined;

  for (const user of Array.from(users)) {
    if (user.id === excludeUserId) continue;
    if (claimedEmails.has(normalizeEmailAddress(user.email) || "") ||
      claimedEmails.has(normalizeEmailAddress(user.pendingEmail) || "")) {
      return user;
    }
  }
  return undefined;
}
