import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { resolveSessionUser } from '../lib/session-identity';

// Track last activity update timestamps to avoid excessive database writes
const lastActivityUpdates = new Map<string, number>();
const ACTIVITY_UPDATE_INTERVAL = 60000; // Only update every 60 seconds

// A banned account is signed out of the app, but may reopen a stripped-down
// view of its own wallet and settings. These paths are the only ones it can use.
const BANNED_ALWAYS_ALLOWED = ["/api/auth/logout", "/api/auth/banned-view"];
const BANNED_VIEW_ALLOWED_PREFIXES = [
  "/api/auth/",
  "/api/wallet",
  "/api/settings",
  "/api/profile",
  "/api/blacklist",
];

function isAllowedForBannedView(pathname: string, bannedView: boolean) {
  if (BANNED_ALWAYS_ALLOWED.includes(pathname)) return true;
  return bannedView && BANNED_VIEW_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const userId = req.session.userId;
  const now = Date.now();
  const lastUpdate = lastActivityUpdates.get(userId) || 0;
  
  if (now - lastUpdate > ACTIVITY_UPDATE_INTERVAL) {
    lastActivityUpdates.set(userId, now);
    storage.getUser(userId).then(user => {
      if (user) {
        if (user.accountStatus === 'banned') {
          return;
        }
        if (user.accountStatus === 'suspended' && user.suspendedUntil) {
          if (new Date(user.suspendedUntil) <= new Date()) {
            storage.updateUser(userId, { 
              accountStatus: 'active', 
              suspendedUntil: null, 
              suspendedReason: null,
              lastActive: new Date() 
            }).catch(() => {});
          }
        } else {
          storage.updateUser(userId, { lastActive: new Date() }).catch(() => {});
        }
      }
    }).catch(() => {});
  }

  resolveSessionUser(req).then(user => {
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'User not found' });
    }
    if (user.accountStatus === 'banned') {
      if (isAllowedForBannedView(req.path, req.session.bannedView === true)) {
        return next();
      }
      return res.status(403).json({
        error: 'Your account has been banned',
        accountStatus: 'banned',
        reason: user.suspendedReason ?? null,
        canViewWallet: true,
      });
    }
    if (req.session.bannedView) {
      delete req.session.bannedView;
    }
    if (user.accountStatus === 'suspended' && user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
      return res.status(403).json({ 
        error: `Your account is suspended until ${new Date(user.suspendedUntil).toLocaleDateString()}`,
        accountStatus: 'suspended',
        suspendedUntil: user.suspendedUntil,
        reason: user.suspendedReason
      });
    }
    next();
  }).catch(() => {
    next();
  });
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!req.session.userRole || !roles.includes(req.session.userRole)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    next();
  };
}
