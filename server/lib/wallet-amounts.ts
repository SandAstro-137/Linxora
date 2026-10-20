const WALLET_BALANCE_SCALE = 100_000_000;

export function walletBalanceUnits(balance: string | number): number {
  return Math.round(Number(balance) * WALLET_BALANCE_SCALE);
}

export function hasSufficientWalletBalance(balance: string | number, amount: number): boolean {
  return walletBalanceUnits(balance) >= walletBalanceUnits(amount);
}

export function subtractWalletBalance(balance: string | number, amount: number): string {
  const remainingUnits = walletBalanceUnits(balance) - walletBalanceUnits(amount);
  return (remainingUnits / WALLET_BALANCE_SCALE).toFixed(8);
}

export function isFullWalletWithdrawal(balance: number, amount: number): boolean {
  return walletBalanceUnits(balance) === walletBalanceUnits(amount);
}

export function getRemainingWalletBalance(balance: string | number, amount: number): string {
  return isFullWalletWithdrawal(Number(balance), amount)
    ? "0"
    : subtractWalletBalance(balance, amount);
}

export function getWalletBalanceBlockReason(
  balances: Array<{ currency: string; balance: unknown }>,
): string | null {
  const remaining = balances.flatMap(({ currency, balance }) => {
    const amount = Number(balance ?? 0);
    if (Number.isFinite(amount) && amount === 0) return [];
    const displayAmount = Number.isFinite(amount) ? amount.toFixed(8) : "invalid balance";
    return [`${currency} ${displayAmount}`];
  });
  return remaining.length
    ? `Wallet funds remain (${remaining.join(", ")}) — withdraw or spend these balances to continue.`
    : null;
}
