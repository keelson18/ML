import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { CMSContent, CMSContentType } from '../lib/types';
import { fetchPublishedContent } from '../lib/cms';

interface CMSContextType {
  articles: CMSContent[];
  guides: CMSContent[];
  announcements: CMSContent[];
  faqs: CMSContent[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<CMSContextType>({
  articles: [],
  guides: [],
  announcements: [],
  faqs: [],
  loading: true,
  refresh: async () => {},
});

export function CMSProvider({ children }: { children: ReactNode }) {
  const [articles, setArticles] = useState<CMSContent[]>([]);
  const [guides, setGuides] = useState<CMSContent[]>([]);
  const [announcements, setAnnouncements] = useState<CMSContent[]>([]);
  const [faqs, setFaqs] = useState<CMSContent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const all = await fetchPublishedContent();
    setArticles(all.filter((c) => c.contentType === 'article'));
    setGuides(all.filter((c) => c.contentType === 'guide'));
    setAnnouncements(all.filter((c) => c.contentType === 'announcement'));
    setFaqs(all.filter((c) => c.contentType === 'faq'));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <Ctx.Provider value={{ articles, guides, announcements, faqs, loading, refresh: load }}>
      {children}
    </Ctx.Provider>
  );
}

export const useCMS = () => useContext(Ctx);

