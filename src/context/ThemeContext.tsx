import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { useAuth } from './AuthContext';
import { workspaceApi } from '../api/workspace';

type Theme = 'light' | 'dark';
interface ThemeCtx {
  theme: Theme;
  syncError: string | null;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({ theme: 'dark', syncError: null, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('qi-theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [syncError, setSyncError] = useState<string | null>(null);
  const loadedUserId = useRef<string | null>(null);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      loadedUserId.current = null;
      return;
    }
    let cancelled = false;
    workspaceApi.getPreferences().then((preferences) => {
      if (!cancelled && preferences) setTheme(preferences.theme);
    }).catch((error) => {
      if (!cancelled) setSyncError(error instanceof Error ? error.message : 'Theme could not be loaded from your account.');
    }).finally(() => {
      if (!cancelled) loadedUserId.current = userId;
    });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('qi-theme', theme);
    } catch {
      return;
    }
  }, [theme]);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setSyncError(null);
    if (userId && loadedUserId.current === userId) {
      workspaceApi.savePreferences({ theme: next }).catch((error) => setSyncError(error instanceof Error ? error.message : 'Theme could not be saved to your account.'));
    }
  };

  return (
    <Ctx.Provider value={{ theme, syncError, toggle }}>
      {children}
    </Ctx.Provider>
  );
}

export const useTheme = () => useContext(Ctx);
