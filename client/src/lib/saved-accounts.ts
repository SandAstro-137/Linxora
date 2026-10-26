export interface SavedAccount {
  id: string;
  email: string | null;
  username: string;
  role: string;
  avatar: string | null;
  isDemo?: boolean;
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
const ACCOUNT_GROUPS_STORAGE_KEY = "linxova:saved-account-groups:v1";

type AccountStorage = Pick<Storage, "getItem" | "setItem">;

function getSavedAccountGroups(storage: AccountStorage): string[][] {
  try {
    const value: unknown = JSON.parse(storage.getItem(ACCOUNT_GROUPS_STORAGE_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter((group): group is string[] => Array.isArray(group) && group.every(id => typeof id === "string" && id.length > 0))
      .map(group => Array.from(new Set(group)));
  } catch {
    return [];
  }
}

export function linkSavedAccounts(sourceUserId: string, destinationUserId: string, storage?: AccountStorage): void {
  if (!sourceUserId || !destinationUserId || (!storage && typeof window === "undefined")) return;
  try {
    const accountStorage = storage ?? window.localStorage;
    const groups = getSavedAccountGroups(accountStorage);
    const linkedIds = new Set([sourceUserId, destinationUserId]);
    let merged;
    do {
      merged = false;
      for (let index = groups.length - 1; index >= 0; index--) {
        const group = groups[index];
        if (group.some(id => linkedIds.has(id))) {
          group.forEach(id => linkedIds.add(id));
          groups.splice(index, 1);
          merged = true;
        }
      }
    } while (merged);
    groups.push(Array.from(linkedIds));
    accountStorage.setItem(ACCOUNT_GROUPS_STORAGE_KEY, JSON.stringify(groups));
  } catch {
    // Account switching remains optional if browser storage is unavailable.
  }
}

export function getSavedAccountsForUser(userId: string | undefined, storage?: AccountStorage): SavedAccount[] {
  if (!userId || (!storage && typeof window === "undefined")) return [];
  try {
    const accountStorage = storage ?? window.localStorage;
    const linkedIds = new Set(
      getSavedAccountGroups(accountStorage)
        .filter(group => group.includes(userId))
        .flat(),
    );
    linkedIds.add(userId);
    return getSavedAccounts(accountStorage).filter(account => linkedIds.has(account.id));
  } catch {
    return [];
  }
}

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
      (account.avatar === undefined || account.avatar === null || typeof account.avatar === "string") &&
      (account.isDemo === undefined || typeof account.isDemo === "boolean")
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
    const accountStorage = storage ?? window.localStorage;
    accountStorage.setItem(STORAGE_KEY, "[]");
    accountStorage.setItem(ACCOUNT_GROUPS_STORAGE_KEY, "[]");
  } catch {
    // Account switching remains optional if browser storage is unavailable.
  }
}

export function getSwitchableAccounts(accounts: SavedAccount[], currentUserId?: string): SavedAccount[] {
  return deduplicateAccounts(accounts).filter(account => account.id !== currentUserId);
}

export function isDemoAccount(account: Pick<SavedAccount, "id"> & Partial<Pick<SavedAccount, "isDemo">>): boolean {
  return account.isDemo === true || account.id.startsWith("demo-");
}

export function getAccountsAllowedForCurrentUser(
  accounts: SavedAccount[],
  currentAccountIsDemo: boolean,
  currentUserId?: string,
): SavedAccount[] {
  return getSwitchableAccounts(accounts, currentUserId)
    .filter(account => isDemoAccount(account) === currentAccountIsDemo);
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
  if (!account.id || !account.username) {
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
    isDemo: account.discordId?.startsWith("demo-") === true,
  };
  const updated = deduplicateAccounts([saved, ...current.filter(existing => existing.id !== saved.id)]);
  try {
    accountStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Account switching remains optional if browser storage is unavailable.
  }
  return updated;
}
