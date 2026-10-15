import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
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
const historicalSupabaseState = execFileSync('git', ['log', '--all', '--format=', '--name-only', '--', 'supabase/.temp'], {
  cwd: root, encoding: 'utf8',
}).split(/\r?\n/).filter(Boolean);
if (historicalSupabaseState.length) {
  violations.push('Git history: Supabase local CLI state is present; remove it from all reachable commits');
}

for (const file of files) {
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
