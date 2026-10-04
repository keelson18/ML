import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
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
  const child = spawn(npm, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
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
}

async function waitUntilReady(name, url) {
  const deadline = Date.now() + 30_000;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${name} failed to become healthy at ${url}`);
}

async function start() {
  launchService('Autonomy API', ['run', 'backend:dev'], { AUTONOMY_PORT: autonomyPort });
  await waitUntilReady('Autonomy API', `http://127.0.0.1:${autonomyPort}/health`);
  if (!stopping) launchService('Web', ['run', 'dev:web']);
}

start().catch((error) => {
  console.error(`[dev] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
  stop();
});

process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
