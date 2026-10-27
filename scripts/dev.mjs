import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

const root = fileURLToPath(new URL('..', import.meta.url));
const fileEnv = (() => {
  try { return parse(readFileSync(resolve(root, '.env'))); }
  catch { return {}; }
})();
const envValue = (name) => [process.env[name], fileEnv[name]].find((value) => Boolean(value?.trim()))?.trim();
// Match Vite's proxy precedence while keeping server-only .env values out of the launcher environment.
const proxyTarget = envValue('AUTONOMY_PROXY_TARGET')
  ?? envValue('VITE_BACKEND_URL')
  ?? `http://127.0.0.1:${envValue('AUTONOMY_PORT') ?? '8787'}`;
const targetUrl = new URL(proxyTarget);
const healthUrl = new URL('/health', targetUrl.origin).toString();
const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
const localApi = localHosts.has(targetUrl.hostname);
const autonomyPort = targetUrl.port || (targetUrl.protocol === 'https:' ? '443' : '80');
const children = [];
let stopping = false;

function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

function launchService(name, args, overrides = {}) {
  const child = spawn(process.execPath, args, {
    stdio: 'inherit',
    cwd: root,
    env: { ...process.env, ...overrides },
  });
  children.push(child);
  child.on('error', (error) => {
    console.error(`[${name}] ${error.message}`);
    process.exitCode = 1;
    stop();
  });
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`[${name}] exited unexpectedly (code ${code ?? 'unknown'}).`);
      process.exitCode = code && code !== 0 ? code : 1;
      stop();
    }
  });
  return child;
}

async function waitUntilReady(name, url, child) {
  const deadline = Date.now() + 30_000;
  let lastFailure = 'no response';
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      const health = response.ok ? await response.json().catch(() => null) : null;
      if (health?.service === 'quantum-api') return;
      lastFailure = response.ok ? 'response was not the Quantum API health check' : `HTTP ${response.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`${name} exited with code ${child.exitCode} before becoming healthy at ${url}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${name} failed to become healthy at ${url}: ${lastFailure}`);
}

async function isHealthyApi(url) {
  // A Vite process should never start against an empty local proxy target.
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(750) });
    const health = response.ok ? await response.json().catch(() => null) : null;
    return health?.service === 'quantum-api';
  } catch {
    return false;
  }
}

async function start() {
  if (localApi) {
    if (await isHealthyApi(healthUrl)) {
      console.log(`[dev] Reusing the API already healthy at ${healthUrl}.`);
    } else {
      const api = launchService('Autonomy API', [resolve(root, 'node_modules/tsx/dist/cli.mjs'), 'watch', 'backend/src/server.ts'], { AUTONOMY_PORT: autonomyPort });
      await waitUntilReady('Autonomy API', healthUrl, api);
    }
  } else {
    await waitUntilReady('Configured backend', healthUrl);
    console.log(`[dev] Using configured backend at ${healthUrl}.`);
  }
  if (!stopping) launchService('Web', [resolve(root, 'node_modules/vite/bin/vite.js')], { AUTONOMY_PROXY_TARGET: targetUrl.origin });
}

start().catch((error) => {
  console.error(`[dev] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
  stop();
});

process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
