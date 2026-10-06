import type { Response, NextFunction } from 'express';
import { mlService } from '../services/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { TIMEFRAMES, type Timeframe } from '../../../src/lib/types';

export async function getCachedPrediction(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.accessToken) { res.status(401).json({ error: 'Authentication required' }); return; }
    const symbol = (req.query.symbol as string) ?? 'BTCUSD';
    const timeframe = (req.query.timeframe as string) ?? '1h';
    const prediction = await mlService.fetchCachedPrediction(symbol, timeframe, req.accessToken);
    res.json({ prediction });
  } catch (e) { next(e); }
}

export async function predict(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.accessToken) { res.status(401).json({ error: 'Authentication required' }); return; }
    const body = req.body as { symbol?: string; timeframe?: string } | null;
    const symbol = body?.symbol ?? (req.query.symbol as string) ?? 'BTCUSD';
    const timeframe = body?.timeframe ?? (req.query.timeframe as string) ?? '1h';
    const validTimeframes = new Set(TIMEFRAMES.map((t) => t.value));
    if (!/^[A-Za-z0-9/:._-]{2,24}$/.test(symbol) || !validTimeframes.has(timeframe as Timeframe)) {
      res.status(400).json({ error: 'A valid symbol and timeframe are required.' });
      return;
    }
    const prediction = await mlService.predict(symbol, timeframe, req.accessToken);
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
