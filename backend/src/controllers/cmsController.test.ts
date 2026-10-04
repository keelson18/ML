import type { NextFunction, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { cmsService } from '../services/index.js';
import { fetchBySlug } from './cmsController.js';

vi.mock('../services/index.js', () => ({
  cmsService: { fetchBySlug: vi.fn() },
}));

afterEach(() => vi.clearAllMocks());

describe('legacy CMS by-slug route', () => {
  it('never enables unpublished reads from a query parameter', async () => {
    vi.mocked(cmsService.fetchBySlug).mockResolvedValue({ published: true } as never);
    const request = { params: { slug: 'draft-item' }, query: { draft: 'true' } } as unknown as AuthenticatedRequest;
    const response = { json: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    await fetchBySlug(request, response, next);

    expect(cmsService.fetchBySlug).toHaveBeenCalledWith('draft-item', false);
    expect(response.json).toHaveBeenCalledWith({ item: { published: true } });
  });
});
