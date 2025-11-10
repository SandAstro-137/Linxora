import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
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
