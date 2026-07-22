import { useEffect, useState } from 'react';
import { BookOpen, ChevronLeft } from 'lucide-react';
import type { CMSContent } from '../../lib/types';
import { fetchContentBySlug } from '../../lib/cms';

interface Props {
  slug: string;
  onBack?: () => void;
}

export default function CMSViewer({ slug, onBack }: Props) {
  const [content, setContent] = useState<CMSContent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchContentBySlug(slug);
      if (!cancelled) {
        setContent(data);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted">
        Loading content…
      </div>
    );
  }

  if (!content) {
    return (
      <div className="text-sm text-muted text-center py-12">
        Content not found.
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-4">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-muted hover:text-text transition-colors"
        >
          <ChevronLeft className="w-3 h-3" /> Back
        </button>
      )}
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-primary" />
        <span className="text-xs text-muted capitalize">{content.contentType}</span>
        {content.tags.length > 0 && (
          <div className="flex gap-1">
            {content.tags.map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <h2 className="text-lg font-semibold">{content.title}</h2>
      {content.excerpt && (
        <p className="text-sm text-muted italic">{content.excerpt}</p>
      )}
      <div className="prose prose-sm max-w-none text-text">
        {content.body.split('\n').map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
      {content.publishedAt && (
        <div className="text-xs text-muted">
          Published: {new Date(content.publishedAt).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}

