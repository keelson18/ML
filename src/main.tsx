import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const root = createRoot(document.getElementById('root')!);

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  root.render(
    <main className="min-h-screen flex items-center justify-center bg-bg text-text px-4">
      <section className="max-w-lg space-y-3 rounded-xl border border-border bg-surface p-6">
        <h1 className="text-lg font-semibold">Supabase configuration required</h1>
      </section>
    </main>,
  );
} else {
  void import('./App').then(({ default: App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}
