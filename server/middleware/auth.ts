import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { resolveSessionUser } from '../lib/session-identity';

// Track last activity update timestamps to avoid excessive database writes
const lastActivityUpdates = new Map<string, number>();
const ACTIVITY_UPDATE_INTERVAL = 60000; // Only update every 60 seconds

// A banned or suspended account is signed out of the app, but may reopen a
// stripped-down view of its own wallet and settings. These paths are the only
// ones it can use.
const LIMITED_ALWAYS_ALLOWED = ["/api/auth/logout", "/api/auth/limited-view"];
const LIMITED_VIEW_ALLOWED_PREFIXES = [
  "/api/auth/",
  "/api/wallet",
  "/api/settings",
  "/api/profile",
  "/api/blacklist",
];

function isAllowedForLimitedView(pathname: string, limitedView: boolean) {
  if (LIMITED_ALWAYS_ALLOWED.includes(pathname)) return true;
  return limitedView && LIMITED_VIEW_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
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
    const limitedView = req.session.limitedView === true;

    if (user.accountStatus === 'banned') {
      if (isAllowedForLimitedView(req.path, limitedView)) {
        return next();
      }
      return res.status(403).json({
        error: 'Your account has been banned',
        accountStatus: 'banned',
        reason: user.suspendedReason ?? null,
        canViewWallet: true,
      });
    }

    if (user.accountStatus === 'suspended' && user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
      if (isAllowedForLimitedView(req.path, limitedView)) {
        return next();
      }
      return res.status(403).json({ 
        error: `Your account is suspended until ${new Date(user.suspendedUntil).toLocaleDateString()}`,
        accountStatus: 'suspended',
        suspendedUntil: user.suspendedUntil,
        reason: user.suspendedReason,
        canViewWallet: true,
      });
    }

    if (req.session.limitedView) {
      delete req.session.limitedView;
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
