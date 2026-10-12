import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { assertSafeViteEnvironment } from './scripts/vite-env-safety';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  assertSafeViteEnvironment(env);
  const autonomyTarget = [env.AUTONOMY_PROXY_TARGET, env.VITE_BACKEND_URL]
    .map((target) => target?.trim())
    .find((target) => Boolean(target)) ?? `http://127.0.0.1:${env.AUTONOMY_PORT ?? '8787'}`;

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      proxy: {
        '/api/v1': { target: autonomyTarget, changeOrigin: true, ws: true },
        '/health': { target: autonomyTarget, changeOrigin: true },
      },
    },
    preview: {
      host: '0.0.0.0',
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});
