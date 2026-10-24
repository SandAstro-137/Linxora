export interface SavedAccount {
  id: string;
  email: string | null;
  username: string;
  role: string;
  avatar: string | null;
}

export interface AccountProfile {
  id: string;
  email?: string | null;
  username: string;
  role: string;
  avatar?: string | null;
  discordId?: string;
}

const STORAGE_KEY = "linxova:saved-accounts:v1";

type AccountStorage = Pick<Storage, "getItem" | "setItem">;

function deduplicateAccounts(accounts: SavedAccount[]): SavedAccount[] {
  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();
  return accounts.filter(account => {
    const normalizedEmail = account.email?.trim().toLowerCase();
    if (seenIds.has(account.id) || (normalizedEmail && seenEmails.has(normalizedEmail))) return false;
    seenIds.add(account.id);
    if (normalizedEmail) seenEmails.add(normalizedEmail);
    return true;
  });
}

export function getSavedAccounts(storage?: AccountStorage): SavedAccount[] {
  if (!storage && typeof window === "undefined") return [];
  try {
    const accountStorage = storage ?? window.localStorage;
    const value: unknown = JSON.parse(accountStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    const accounts = value.filter((account): account is SavedAccount =>
      !!account &&
      typeof account.id === "string" &&
      typeof account.username === "string" &&
      typeof account.role === "string" &&
      (account.email === undefined || account.email === null || typeof account.email === "string") &&
      (account.avatar === undefined || account.avatar === null || typeof account.avatar === "string")
    );
    const uniqueAccounts = deduplicateAccounts(accounts);
    if (uniqueAccounts.length !== accounts.length) {
      accountStorage.setItem(STORAGE_KEY, JSON.stringify(uniqueAccounts));
    }
    return uniqueAccounts;
  } catch {
    return [];
  }
}

export function clearSavedAccounts(storage?: AccountStorage): void {
  if (!storage && typeof window === "undefined") return;
  try {
    (storage ?? window.localStorage).setItem(STORAGE_KEY, "[]");
  } catch {
    // Account switching remains optional if browser storage is unavailable.
  }
}

export function getSwitchableAccounts(accounts: SavedAccount[], currentUserId?: string): SavedAccount[] {
  return deduplicateAccounts(accounts).filter(account => account.id !== currentUserId);
}

export function getGoogleLoginUrl(account?: SavedAccount): string {
  const email = account?.email?.trim();
  const query = email ? `?login_hint=${encodeURIComponent(email)}` : "";
  return `/api/auth/google${query}`;
}

export function saveAccountProfileIfRequested(
  account: AccountProfile,
  addAccountRequested: boolean,
  storage?: AccountStorage,
): SavedAccount[] {
  return addAccountRequested ? saveAccountProfile(account, storage) : getSavedAccounts(storage);
}

export function saveAccountProfile(
  account: AccountProfile,
  storage?: AccountStorage,
): SavedAccount[] {
  if (!account.id || !account.username || account.discordId?.startsWith("demo-")) {
    return getSavedAccounts(storage);
  }
  if (!storage && typeof window === "undefined") return [];

  let current: SavedAccount[];
  let accountStorage: AccountStorage;
  try {
    accountStorage = storage ?? window.localStorage;
    current = getSavedAccounts(accountStorage);
  } catch {
    return [];
  }
  const saved: SavedAccount = {
    id: account.id,
    email: account.email || null,
    username: account.username,
    role: account.role,
    avatar: account.avatar || null,
  };
  const updated = deduplicateAccounts([saved, ...current.filter(existing => existing.id !== saved.id)]);
  try {
    accountStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Account switching remains optional if browser storage is unavailable.
  }
  return updated;
}
