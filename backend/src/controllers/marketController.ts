import type { Response, NextFunction } from 'express';
import { marketService } from '../services/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export async function getKlines(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const symbol = (req.query.symbol as string) ?? 'BTCUSDT';
    const interval = (req.query.interval as string) ?? '1h';
    const limit = parseInt((req.query.limit as string) ?? '1000', 10);
    const candles = await marketService.fetchKlines(symbol, interval, limit);
    res.json({ candles });
  } catch (e) { next(e); }
}
