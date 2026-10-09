import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourceDirectories = ['src', 'backend/src', 'scripts', 'supabase/functions'];
const rootFiles = ['vite.config.ts'];
const reads = new Map();

async function scan(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const fullPath = resolve(path, entry.name);
    if (entry.isDirectory()) await scan(fullPath);
    else if (/\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name)) {
      const source = await readFile(fullPath, 'utf8');
      const patterns = [
        /process\.env\.([A-Z][A-Z0-9_]*)/g,
        /process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g,
        /Deno\.env\.get\(['"]([A-Z][A-Z0-9_]*)['"]\)/g,
        /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g,
      ];
      for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) reads.set(match[1], fullPath.slice(root.length + 1));
      }
    }
  }
}

for (const directory of sourceDirectories) await scan(resolve(root, directory));
for (const file of rootFiles) {
  const path = resolve(root, file);
  const source = await readFile(path, 'utf8');
  for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) reads.set(match[1], file);
  for (const match of source.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g)) reads.set(match[1], file);
}

const example = await readFile(resolve(root, '.env.example'), 'utf8');
const lines = example.split(/\r?\n/);
const documented = new Set(lines.map((line) => line.match(/^\s*([A-Z][A-Z0-9_]*)=/)?.[1]).filter(Boolean));
const missing = [...reads].filter(([name]) => !documented.has(name));
const uncommented = lines.flatMap((line, index) => {
  const name = line.match(/^\s*([A-Z][A-Z0-9_]*)=/)?.[1];
  return name && !lines[index - 1]?.trim().startsWith('#') ? [name] : [];
});
if (missing.length || uncommented.length) {
  if (missing.length) console.error(`Environment variables missing from .env.example:\n${missing.map(([name, file]) => `- ${name} (${file})`).join('\n')}`);
  if (uncommented.length) console.error(`Environment variables missing a comment:\n${uncommented.map((name) => `- ${name}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`All ${reads.size} environment variables read by application code are documented and commented in .env.example.`);
}
