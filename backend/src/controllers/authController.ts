import type { Response, NextFunction } from 'express';
import { authService } from '../services/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export async function signIn(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) { res.status(400).json({ error: 'Email and password required' }); return; }
    const result = await authService.signIn(email, password);
    res.json(result);
  } catch (e) { next(e); }
}

export async function signUp(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, metadata } = req.body as { email: string; password: string; metadata?: Record<string, unknown> };
    if (!email || !password) { res.status(400).json({ error: 'Email and password required' }); return; }
    const result = await authService.signUp(email, password, metadata ?? {});
    res.json(result);
  } catch (e) { next(e); }
}

export async function getProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId || !req.accessToken) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const profile = await authService.getProfile(req.accessToken, req.userId);
    res.json({ profile });
  } catch (e) { next(e); }
}

export async function getAllProfiles(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.accessToken) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const profiles = await authService.getAllProfiles(req.accessToken);
    res.json({ profiles });
  } catch (e) { next(e); }
}

export async function updateProfileRole(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId, role } = req.body as { userId: string; role: string };
    if (!req.accessToken) { res.status(401).json({ error: 'Unauthorized' }); return; }
    await authService.updateProfileRole(req.accessToken, userId, role);
    res.json({ success: true });
  } catch (e) { next(e); }
}
