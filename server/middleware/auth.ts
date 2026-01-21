import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

// Track last activity update timestamps to avoid excessive database writes
const lastActivityUpdates = new Map<string, number>();
const ACTIVITY_UPDATE_INTERVAL = 60000; // Only update every 60 seconds

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Update lastActive timestamp (throttled to avoid excessive writes)
  const userId = req.session.userId;
  const now = Date.now();
  const lastUpdate = lastActivityUpdates.get(userId) || 0;
  
  if (now - lastUpdate > ACTIVITY_UPDATE_INTERVAL) {
    lastActivityUpdates.set(userId, now);
    storage.updateUser(userId, { lastActive: new Date() }).catch(() => {
      // Silently fail - this is non-critical
    });
  }
  
  next();
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
