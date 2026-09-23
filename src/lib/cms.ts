import { cmsApi } from '../api';
import type { CMSContent, CMSContentType } from './types';

export async function fetchPublishedContent(type?: CMSContentType): Promise<CMSContent[]> {
  try {
    const { items } = await cmsApi.fetchPublished(type);
    return items;
  } catch {
    return [];
  }
}

export async function fetchContentBySlug(slug: string, allowUnpublished?: boolean): Promise<CMSContent | null> {
  try {
    const { item } = await cmsApi.fetchBySlug(slug, allowUnpublished);
    return item;
  } catch {
    return null;
  }
}

export async function fetchAllContent(): Promise<CMSContent[]> {
  try {
    const { items } = await cmsApi.fetchAll();
    return items;
  } catch {
    return [];
  }
}

export async function upsertContent(content: Partial<CMSContent> & { slug: string; title: string; body: string }): Promise<CMSContent | null> {
  const { item } = await cmsApi.upsert(content as Record<string, unknown>);
  return item;
}

export async function deleteContent(id: string): Promise<boolean> {
  const { success } = await cmsApi.delete(id);
  return success;
}

export async function togglePublish(id: string, currentPublished: boolean): Promise<boolean> {
  const { success } = await cmsApi.togglePublish(id, !currentPublished);
  return success;
}
