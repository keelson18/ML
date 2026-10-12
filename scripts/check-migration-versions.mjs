import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const files = (await readdir(root)).filter((name) => name.endsWith('.sql'));
const seen = new Map();
const duplicates = [];
for (const file of files) {
  const version = /^([0-9]+)_/.exec(file)?.[1];
  if (!version) continue;
  const previous = seen.get(version);
  if (previous) duplicates.push(`${version}: ${previous}, ${file}`);
  else seen.set(version, file);
}
if (duplicates.length) {
  console.error(`Duplicate Supabase migration version(s):\n${duplicates.join('\n')}`);
  process.exitCode = 1;
} else console.log(`Checked ${files.length} migration files; versions are unique.`);
