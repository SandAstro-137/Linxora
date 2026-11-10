import { randomBytes } from "crypto";
import { storage } from "../storage";
import { DEMO_ACCOUNT_PROFILES } from "./demo-mode";

let lastEnsureAt = 0;
const ENSURE_INTERVAL_MS = 60_000;

/**
 * Guarantees the six demo accounts exist, with wallets and an account age that
 * passes the role-upgrade requirements. Safe to call repeatedly: existing
 * accounts are left untouched, and each account is prepared independently so
 * one conflict (for example a taken email) never blocks the others.
 */
export async function ensureDemoAccounts(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastEnsureAt < ENSURE_INTERVAL_MS) return;
  lastEnsureAt = now;

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  for (const profile of DEMO_ACCOUNT_PROFILES) {
    try {
      let user = await storage.getUserByDiscordId(profile.discordId);
      if (!user) {
        user = await storage.createUser(
          {
            discordId: profile.discordId,
            username: profile.username,
            email: profile.email,
            avatar: profile.avatar,
            role: profile.role,
          },
          profile.role === "founder",
        );
        // Backdate so age-gated flows (freelancer promotion) are testable.
        user = (await storage.updateUser(user.id, { createdAt: oneYearAgo })) || user;
      }
      const wallet = await storage.getWallet(user.id);
      if (!wallet) {
        await storage.createWallet({
          userId: user.id,
          walletAddress: `0x${randomBytes(16).toString("hex")}`,
          usdtBalance: profile.usdtBalance ?? "0",
        });
      }
    } catch (error) {
      console.warn(`[demo] Could not prepare ${profile.discordId}:`, (error as Error)?.message ?? error);
    }
  }
}
