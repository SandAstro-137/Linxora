import type { Request } from "express";
import { storage } from "../storage";

/**
 * Resolve the user a request is signed in as.
 *
 * The session stores both the user id and the Discord identity. If the id no
 * longer resolves — the in-memory/demo dataset is reseeded with fresh ids after
 * a restart — fall back to the identity and re-point the session at it, so a
 * restart never presents as "you have been signed out".
 */
export async function resolveSessionUser(req: Request) {
  const session = req.session;
  const userId = typeof session?.userId === "string" ? session.userId : "";

  if (userId) {
    const user = await storage.getUser(userId);
    if (user) return user;
  }

  const discordId = typeof session?.discordId === "string" ? session.discordId : "";
  if (!discordId) return undefined;

  const user = await storage.getUserByDiscordId(discordId);
  if (!user) return undefined;

  session.userId = user.id;
  session.userRole = user.role;
  return user;
}
