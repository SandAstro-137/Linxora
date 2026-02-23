import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

// Track last activity update timestamps to avoid excessive database writes
const lastActivityUpdates = new Map<string, number>();
const ACTIVITY_UPDATE_INTERVAL = 60000; // Only update every 60 seconds

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
          req.session.destroy(() => {});
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

  storage.getUser(userId).then(user => {
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (user.accountStatus === 'banned') {
      req.session.destroy(() => {});
      return res.status(403).json({ error: 'Your account has been banned', accountStatus: 'banned' });
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
