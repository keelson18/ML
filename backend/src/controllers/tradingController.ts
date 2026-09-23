import type { Response, NextFunction } from 'express';
import { tradingService, metricsService } from '../services/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export async function getPositions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.accessToken || !req.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const positions = await tradingService.fetchPositions(req.accessToken, req.userId);
    res.json({ positions });
  } catch (e) { next(e); }
}

export async function createPosition(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.accessToken || !req.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const position = await tradingService.createPosition(req.accessToken, req.body);
    res.json({ position });
  } catch (e) { next(e); }
}

export async function closePosition(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.accessToken) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const id = String(req.params.id);
    await tradingService.closePosition(req.accessToken, id);
    res.json({ success: true });
  } catch (e) { next(e); }
}

export async function getTrades(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.accessToken || !req.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const trades = await tradingService.fetchTrades(req.accessToken, req.userId);
    res.json({ trades });
  } catch (e) { next(e); }
}

export async function getMetrics(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.accessToken) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const metrics = await metricsService.fetchMetrics(req.accessToken);
    res.json({ metrics });
  } catch (e) { next(e); }
}
