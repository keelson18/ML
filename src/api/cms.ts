import { supabase } from '../lib/supabase';
import type { CMSContent, CMSContentType } from '../lib/types';

function mapRow(row: Record<string, unknown>): CMSContent {
  return {
    id: row.id as string,
    slug: row.slug as string,
    title: row.title as string,
    body: row.body as string,
    excerpt: (row.excerpt as string) ?? undefined,
    contentType: row.content_type as CMSContentType,
    authorId: (row.author_id as string) ?? undefined,
    tags: (row.tags as string[]) ?? [],
    published: row.published as boolean,
    publishedAt: (row.published_at as string) ?? undefined,
    featuredImage: (row.featured_image as string) ?? undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export const cmsApi = {
  async fetchPublished(type?: CMSContentType): Promise<{ items: CMSContent[] }> {
    let query = supabase.from('cms_content').select('*').eq('published', true).order('published_at', { ascending: false });
    if (type) query = query.eq('content_type', type);
    const { data, error } = await query;
    if (error || !data) return { items: [] };
    return { items: data.map(mapRow) };
  },

  async fetchBySlug(slug: string, allowUnpublished = false): Promise<{ item: CMSContent | null }> {
    let query = supabase.from('cms_content').select('*').eq('slug', slug);
    if (!allowUnpublished) query = query.eq('published', true);
    const { data, error } = await query.maybeSingle();
    if (error || !data) return { item: null };
    return { item: mapRow(data) };
  },

  async fetchAll(): Promise<{ items: CMSContent[] }> {
    const { data, error } = await supabase.from('cms_content').select('*').order('created_at', { ascending: false });
    if (error || !data) return { items: [] };
    return { items: data.map(mapRow) };
  },

  async upsert(payload: Record<string, unknown>): Promise<{ item: CMSContent | null }> {
    const { data, error } = await supabase.from('cms_content').upsert({
      slug: payload.slug,
      title: payload.title,
      body: payload.body,
      excerpt: payload.excerpt,
      content_type: payload.contentType ?? payload.content_type,
      tags: payload.tags ?? [],
      published: payload.published ?? false,
      featured_image: payload.featuredImage ?? payload.featured_image,
      metadata: payload.metadata ?? {},
    }).select('*').maybeSingle();
    if (error) return { item: null };
    return { item: data ? mapRow(data) : null };
  },

  async delete(id: string): Promise<{ success: boolean }> {
    const { error } = await supabase.from('cms_content').delete().eq('id', id);
    return { success: !error };
  },

  async togglePublish(id: string, published: boolean): Promise<{ success: boolean }> {
    const { error } = await supabase.from('cms_content').update({
      published,
      published_at: published ? new Date().toISOString() : null,
    }).eq('id', id);
    return { success: !error };
  },
};
