import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(Boolean);
const supabaseSecretPrefix = ['sb', 'secret'].join('_') + '_';
const patterns = [
  { name: 'Supabase secret key', pattern: new RegExp(`${supabaseSecretPrefix}[A-Za-z0-9_-]{8,}`) },
  { name: 'JWT-shaped token', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: 'Massive API key assignment', pattern: /\bMASSIVE_API_KEY\s*=/ },
];
const violations = [];

// A local ignore rule only protects the current checkout. It cannot remove
// credentials already committed in Supabase CLI state, so keep that path out
// of every reachable commit as well. CI fetches full history for this check.
const historicalPaths = execFileSync('git', ['log', '--all', '--format=', '--name-only'], {
  cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
}).split(/\r?\n/).filter(Boolean);
if (historicalPaths.some((file) => file.replaceAll('\\', '/').startsWith('supabase/.temp/'))) {
  violations.push('Git history: Supabase local CLI state is present; remove it from all reachable commits');
}
if (historicalPaths.some((file) => file.replaceAll('\\', '/').startsWith('supabase/.temp/'))) {
  const commits = execFileSync('git', ['rev-list', '--all'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
  try {
    // Inspect historic CLI state without emitting any matching content. These
    // files can contain remote connection endpoints and credentials.
    execFileSync('git', [
      'grep', '-I', '-l', '-E',
      '(postgres|postgresql|mysql|redis)://[^/[:space:]@]+@[^/[:space:]?#]+',
      ...commits, '--', 'supabase/.temp/**',
    ], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    violations.push('Git history: Supabase local CLI state contains a remote database URL with user info; rotate associated credentials before history cleanup');
  } catch (error) {
    // git grep exits with status 1 when there are no matches. Other failures
    // are reported separately so this check cannot silently pass on errors.
    if (error?.status !== 1) violations.push('Git history: could not inspect Supabase local CLI state for database credentials');
  }
}
if (historicalPaths.some((file) => {
  const basename = file.split(/[\\/]/).at(-1);
  return basename === '.env' || (basename?.startsWith('.env.') && basename !== '.env.example');
})) violations.push('Git history: environment file is present; remove it from all reachable commits');

// Search every reachable commit's changed lines for secret-shaped values.
// Git prints only the commit/path metadata here; matching source content is
// captured by the process and never included in the diagnostic.
const historicalPatterns = [
  { name: 'Supabase secret key', pattern: 'sb_secret_[A-Za-z0-9_-]{8,}' },
  { name: 'JWT-shaped token', pattern: 'eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}' },
  { name: 'Massive API key assignment', pattern: 'MASSIVE_API_KEY[[:space:]]*=[[:space:]]*[^[:space:]#]+' },
  { name: 'remote database URL with user info', pattern: '(postgres|postgresql|mysql|redis)://[^/[:space:]@]+@[^/[:space:]?#]+' },
];
for (const { name, pattern } of historicalPatterns) {
  try {
    const matchedPaths = execFileSync('git', [
      'log', '--all', '--format=', '--name-only', '-G', pattern,
      '--', '.', ':(exclude)**/.env.example',
    ], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 })
      .split(/\r?\n/).filter(Boolean);
    if (matchedPaths.length) violations.push(`Git history: ${name}-shaped material found; rotate affected credentials before history cleanup`);
  } catch (error) {
    if (error?.status !== 1) violations.push(`Git history: could not inspect commits for ${name} patterns`);
  }
}

for (const file of files) {
  // `git ls-files --cached` includes tracked files deleted in the worktree;
  // deleted paths have no current contents to inspect (history is scanned above).
  if (!existsSync(resolve(root, file))) continue;
  const basename = file.split(/[\\/]/).at(-1);
  if (file === '.env.example') continue;
  if (basename === '.env' || (basename?.startsWith('.env.') && basename !== '.env.example')) {
    violations.push(`${file}: tracked environment file`);
    continue;
  }
  const source = await readFile(resolve(root, file));
  if (source.includes(0)) continue;
  const content = source.toString('utf8');
  for (const { name, pattern } of patterns) {
    if (pattern.test(content)) violations.push(`${file}: ${name}`);
  }
  // Catch remote DB URLs with embedded credentials while allowing documented
  // loopback-only examples used for local tests.
  const credentialUrls = content.match(/\b(?:postgres(?:ql)?|mysql|redis):\/\/[^/\s@]+@[^/\s?#]+/gi) ?? [];
  if (credentialUrls.some((value) => {
    try {
      const hostname = new URL(value).hostname.toLowerCase();
      return !['localhost', '127.0.0.1', '::1', 'postgres'].includes(hostname);
    } catch {
      return true;
    }
  })) violations.push(`${file}: remote database URL contains embedded credentials`);
}

if (violations.length) {
  console.error(`Tracked secret hygiene check failed:\n${violations.map((item) => `- ${item}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Tracked secret hygiene check passed (${files.length} files scanned; .env.example is the only environment-file exception).`);
}
