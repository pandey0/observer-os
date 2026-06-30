import type { Request, Response, NextFunction } from 'express';
import { getSession } from '../cache.js';

export interface AuthenticatedRequest extends Request {
  user?: { id: string; name: string; email: string; avatar_color?: string };
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'Unauthorized — provide Authorization: Bearer <token>' });
    return;
  }
  const user = await getSession(token);
  if (!user) {
    res.status(401).json({ error: 'Session expired or invalid token' });
    return;
  }
  req.user = user;
  next();
}
