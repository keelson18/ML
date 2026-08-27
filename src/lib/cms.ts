import { supabase } from './supabase';
import type { CMSContent, CMSContentType } from './types';

// Fetch all published CMS content (public). Falls back to order by created_at
// if published_at is null (e.g. for records published before the migration).
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

// Fetch a single content by slug. Uses maybeSingle (not single) so it returns
// null gracefully instead of throwing on missing rows.
// When allowUnpublished is true, bypasses the published filter (for admin preview).
export async function fetchContentBySlug(slug: string, allowUnpublished?: boolean): Promise<CMSContent | null> {
  let query = supabase
    .from('cms_content')
    .select('*')
    .eq('slug', slug);

  if (!allowUnpublished) {
    query = query.eq('published', true);
  }

  const { data } = await query.maybeSingle();
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

// Create or update CMS content. When inserting new content, author_id is
// inferred from the current session. Published state is tracked via the
// separate published/published_at fields.
export async function upsertContent(content: Partial<CMSContent> & { slug: string; title: string; body: string }): Promise<CMSContent | null> {
  // Get current user for author attribution on insert
  const { data: { user } } = await supabase.auth.getUser();
  const payload: Record<string, unknown> = {
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
  };
  // Only set author_id on insert (id not provided); on update the existing
  // value is preserved by the upsert conflict target.
  if (!content.id) {
    payload.author_id = user?.id ?? null;
  }
  const { data } = await supabase
    .from('cms_content')
    .upsert(payload, { onConflict: 'slug' })
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

