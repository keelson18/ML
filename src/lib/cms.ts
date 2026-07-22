import { supabase } from './supabase';
import type { CMSContent, CMSContentType } from './types';

// Fetch all published CMS content (public)
export async function fetchPublishedContent(type?: CMSContentType): Promise<CMSContent[]> {
  let query = supabase
    .from('cms_content')
    .select('*')
    .eq('published', true)
    .order('published_at', { ascending: false });

  if (type) {
    query = query.eq('content_type', type);
  }

  const { data } = await query;
  if (!data) return [];
  return data.map(mapCMSContent);
}

// Fetch a single content by slug
export async function fetchContentBySlug(slug: string): Promise<CMSContent | null> {
  const { data } = await supabase
    .from('cms_content')
    .select('*')
    .eq('slug', slug)
    .single();
  if (!data) return null;
  return mapCMSContent(data);
}

// Fetch all content (including unpublished) — admin only
export async function fetchAllContent(): Promise<CMSContent[]> {
  const { data } = await supabase
    .from('cms_content')
    .select('*')
    .order('created_at', { ascending: false });
  if (!data) return [];
  return data.map(mapCMSContent);
}

// Create or update CMS content
export async function upsertContent(content: Partial<CMSContent> & { slug: string; title: string; body: string }): Promise<CMSContent | null> {
  const { data } = await supabase
    .from('cms_content')
    .upsert({
      slug: content.slug,
      title: content.title,
      body: content.body,
      excerpt: content.excerpt ?? null,
      content_type: content.contentType ?? 'article',
      tags: content.tags ?? [],
      published: content.published ?? false,
      published_at: content.published ? new Date().toISOString() : null,
      featured_image: content.featuredImage ?? null,
      metadata: content.metadata ?? {},
    })
    .select()
    .single();
  if (!data) return null;
  return mapCMSContent(data);
}

// Delete CMS content
export async function deleteContent(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('cms_content')
    .delete()
    .eq('id', id);
  return !error;
}

// Toggle publish status
export async function togglePublish(id: string, currentPublished: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('cms_content')
    .update({
      published: !currentPublished,
      published_at: !currentPublished ? new Date().toISOString() : null,
    })
    .eq('id', id);
  return !error;
}

function mapCMSContent(data: Record<string, unknown>): CMSContent {
  return {
    id: data.id as string,
    slug: data.slug as string,
    title: data.title as string,
    body: data.body as string,
    excerpt: data.excerpt as string | undefined,
    contentType: data.content_type as CMSContentType,
    authorId: data.author_id as string | undefined,
    tags: (data.tags as string[]) ?? [],
    published: data.published as boolean,
    publishedAt: data.published_at as string | undefined,
    featuredImage: data.featured_image as string | undefined,
    metadata: (data.metadata as Record<string, unknown>) ?? {},
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

