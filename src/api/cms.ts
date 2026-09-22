import { api } from './client';
import type { CMSContent, CMSContentType } from '../lib/types';

export const cmsApi = {
  fetchPublished: (type?: CMSContentType) =>
    api.get<{ items: CMSContent[] }>(`/cms/published${type ? `?type=${type}` : ''}`),

  fetchBySlug: (slug: string, allowUnpublished = false) =>
    api.get<{ item: CMSContent | null }>(`/cms/by-slug/${slug}${allowUnpublished ? '?draft=true' : ''}`),

  fetchAll: () =>
    api.get<{ items: CMSContent[] }>('/cms/all'),

  upsert: (payload: Record<string, unknown>) =>
    api.put<{ item: CMSContent | null }>('/cms/upsert', payload),

  delete: (id: string) =>
    api.del<{ success: boolean }>(`/cms/${id}`),

  togglePublish: (id: string, published: boolean) =>
    api.put<{ success: boolean }>(`/cms/${id}/publish`, { published }),
};
