import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import onHeaders from "on-headers";

/**
 * Cookie-backed sessions.
 *
 * Express's default MemoryStore drops every session whenever the process
 * restarts — which happens on every deploy and whenever a free instance spins
 * down — and that signed everybody out. The session payload is instead
 * encrypted and authenticated into the cookie itself, so a restart cannot
 * invalidate it. Nothing is stored server-side.
 *
 * The API mirrors the parts of express-session this app uses: plain property
 * access, `save(cb)` and `destroy(cb)`.
 */

export interface AppSession {
  userId?: string;
  userRole?: string;
  oauthState?: string;
  accountDeletionUserId?: string;
  accountDeletionConfirmUntil?: number;
  accountDeletionIssues?: string[];
  isDemoSession?: boolean;
  discordId?: string;
  linkedAccountIds?: string[];
  addAccountUserId?: string;
  addAccountFlow?: boolean;
  authFlow?: "add-account";
  addAccountTargetUserId?: string;
  addAccountLinkedIds?: string[];
  [key: string]: unknown;
  save: (callback?: (error?: unknown) => void) => void;
  destroy: (callback?: (error?: unknown) => void) => void;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session: AppSession;
    }
  }
}

interface SessionOptions {
  secret: string;
  cookieName?: string;
  maxAgeMs?: number;
  secure?: boolean;
}

function encryptionKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(payload: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

function decrypt(token: string, key: Buffer): string | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 29) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

export function statelessSession(options: SessionOptions) {
  const key = encryptionKey(options.secret);
  const cookieName = options.cookieName ?? "linxova.sid";
  const maxAge = options.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000;
  const secure = options.secure ?? false;

  return function sessionMiddleware(req: Request, res: Response, next: NextFunction) {
    let data: Record<string, unknown> = {};
    const token = readCookie(req.headers.cookie, cookieName);
    if (token) {
      const json = decrypt(token, key);
      if (json) {
        try {
          const parsed = JSON.parse(json);
          if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
        } catch {
          // A corrupt cookie is treated as no session; the user signs in again.
        }
      }
    }

    let destroyed = false;
    let dirty = false;

    const session = data as AppSession;
    Object.defineProperty(session, "save", {
      enumerable: false,
      value: (callback?: (error?: unknown) => void) => callback?.(),
    });
    Object.defineProperty(session, "destroy", {
      enumerable: false,
      value: (callback?: (error?: unknown) => void) => {
        destroyed = true;
        for (const field of Object.keys(session)) delete session[field];
        callback?.();
      },
    });

    // Track writes so read-only requests (and static assets) do not send a
    // needless Set-Cookie header, which would break asset caching.
    const tracked = new Proxy(session, {
      set(target, property, value) {
        dirty = true;
        return Reflect.set(target, property, value);
      },
      deleteProperty(target, property) {
        dirty = true;
        return Reflect.deleteProperty(target, property);
      },
    });

    req.session = tracked;

    onHeaders(res, () => {
      const base = { path: "/", httpOnly: true, sameSite: "lax" as const, secure };
      if (destroyed) {
        res.clearCookie(cookieName, base);
        return;
      }
      if (!dirty) return;
      const payload = JSON.stringify(session);
      res.cookie(cookieName, encrypt(payload, key), { ...base, maxAge });
    });

    next();
  };
}
