import type { Response, NextFunction } from 'express';
import { cmsService } from '../services/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export async function fetchPublished(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const contentType = req.query.type as string | undefined;
    const items = await cmsService.fetchPublished(contentType);
    res.json({ items });
  } catch (e) { next(e); }
}

export async function fetchBySlug(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { slug } = req.params;
    const allowUnpublished = Boolean(req.query.draft);
    const item = await cmsService.fetchBySlug(slug, allowUnpublished);
    if (!item) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ item });
  } catch (e) { next(e); }
}

export async function fetchAll(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.accessToken) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const items = await cmsService.fetchAll(req.accessToken);
    res.json({ items });
  } catch (e) { next(e); }
}

export async function upsert(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.accessToken || !req.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const payload = req.body as Record<string, unknown>;
    const item = await cmsService.upsert(req.accessToken, req.userId, payload);
    res.json({ item });
  } catch (e) { next(e); }
}

export async function remove(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.accessToken) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { id } = req.params;
    await cmsService.delete(req.accessToken, id);
    res.json({ success: true });
  } catch (e) { next(e); }
}

export async function togglePublish(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.accessToken) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { id } = req.params;
    const { published } = req.body as { published: boolean };
    await cmsService.togglePublish(req.accessToken, id, published);
    res.json({ success: true });
  } catch (e) { next(e); }
}
