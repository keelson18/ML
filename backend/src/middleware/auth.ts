import type { Request, Response, NextFunction } from 'express';
import { getSupabaseClientWithToken } from '../db.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  accessToken?: string;
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const token = auth.slice(7);
  try {
    const supabase = getSupabaseClientWithToken(token);
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    req.userId = data.user.id;
    req.userEmail = data.user.email ?? '';
    req.accessToken = token;
    next();
  } catch {
    res.status(401).json({ error: 'Authentication failed' });
  }
}

export async function adminMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.userId || !req.accessToken) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const supabase = getSupabaseClientWithToken(req.accessToken);
    const { data, error } = await supabase.from('profiles').select('role').eq('id', req.userId).maybeSingle();
    if (error || data?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  } catch {
    res.status(500).json({ error: 'Authorization check failed' });
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
}
