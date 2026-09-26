import type { Response, NextFunction } from 'express';
import { coachService } from '../services/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export async function ask(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { messages } = req.body as { messages: Array<{ role: string; content: string }> };
    if (!messages || !Array.isArray(messages)) { res.status(400).json({ error: 'Messages array required' }); return; }
    const reply = await coachService.ask(messages as never);
    res.json({ reply });
  } catch (e) { next(e); }
}
