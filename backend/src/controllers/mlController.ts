import type { Response, NextFunction } from 'express';
import { mlService } from '../services/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export async function getCachedPrediction(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const symbol = (req.query.symbol as string) ?? 'BTCUSDT';
    const timeframe = (req.query.timeframe as string) ?? '1h';
    const prediction = await mlService.fetchCachedPrediction(symbol, timeframe);
    res.json({ prediction });
  } catch (e) { next(e); }
}

export async function predict(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as { symbol?: string; timeframe?: string } | null;
    const symbol = body?.symbol ?? (req.query.symbol as string) ?? 'BTCUSDT';
    const timeframe = body?.timeframe ?? (req.query.timeframe as string) ?? '1h';
    const prediction = await mlService.predict(symbol, timeframe);
    res.json({ prediction });
  } catch (e) { next(e); }
}

export async function getModelVersions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.accessToken) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const versions = await mlService.fetchModelVersions(req.accessToken);
    res.json({ versions });
  } catch (e) { next(e); }
}
