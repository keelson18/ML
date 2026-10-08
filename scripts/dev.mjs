import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const autonomyPort = process.env.AUTONOMY_PORT ?? '8787';
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
    if (!stopping && code !== 0) {
      process.exitCode = code ?? 1;
      stop();
    }
  });
  return child;
}

async function waitUntilReady(name, url, child) {
  const deadline = Date.now() + 30_000;
  let lastFailure = 'no response';
  while (!stopping && Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${name} exited with code ${child.exitCode} before becoming healthy at ${url}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
      lastFailure = `HTTP ${response.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${name} failed to become healthy at ${url}: ${lastFailure}`);
}

async function start() {
  const api = launchService('Autonomy API', [resolve(root, 'node_modules/tsx/dist/cli.mjs'), 'watch', 'backend/src/server.ts'], { AUTONOMY_PORT: autonomyPort });
  await waitUntilReady('Autonomy API', `http://127.0.0.1:${autonomyPort}/health`, api);
  if (!stopping) launchService('Web', [resolve(root, 'node_modules/vite/bin/vite.js')]);
}

start().catch((error) => {
  console.error(`[dev] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
  stop();
});

process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
