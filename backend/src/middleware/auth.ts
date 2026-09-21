import type { Request, Response, NextFunction } from 'express';

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
  const { getSupabaseClientWithToken } = await import('./db.js');
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
}

export function adminMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  import('./db.js').then(({ getSupabaseClientWithToken }) => {
    const supabase = getSupabaseClientWithToken(req.accessToken!);
    return supabase.from('profiles').select('role').eq('id', req.userId).single();
  }).then(({ data, error }) => {
    if (error || data?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  }).catch(() => {
    res.status(500).json({ error: 'Authorization check failed' });
  });
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
}
