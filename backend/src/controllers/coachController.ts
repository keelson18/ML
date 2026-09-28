import type { Response, NextFunction } from 'express';
import { coachService } from '../services/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const requestsByUser = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4_000;

export async function ask(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.userId) { res.status(401).json({ error: 'Authentication required' }); return; }
    const messages = (req.body as { messages?: unknown } | undefined)?.messages;
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES
      || !messages.every((message) => message && typeof message === 'object'
        && ['user', 'assistant'].includes((message as { role?: unknown }).role as string)
        && typeof (message as { content?: unknown }).content === 'string'
        && ((message as { content: string }).content.length <= MAX_MESSAGE_LENGTH))) {
      res.status(400).json({ error: 'Messages must contain 1 to 20 user or assistant entries of at most 4000 characters.' });
      return;
    }
    const now = Date.now();
    const recent = (requestsByUser.get(req.userId) ?? []).filter((time) => time > now - WINDOW_MS);
    if (recent.length >= MAX_REQUESTS) {
      requestsByUser.set(req.userId, recent);
      res.status(429).json({ error: 'Coach request limit reached. Try again in a minute.' });
      return;
    }
    recent.push(now);
    requestsByUser.set(req.userId, recent);
    const reply = await coachService.ask(messages as Array<{ role: 'user' | 'assistant'; content: string }>);
    res.json({ reply });
  } catch (e) { next(e); }
}
