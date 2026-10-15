import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Streamed prices must never reach decision code, directly or through shared modules.
const here = path.dirname(fileURLToPath(import.meta.url));
const backendSrc = path.resolve(here, '..');
const liveDir = path.join(backendSrc, 'live');
const decisionRoots = ['trader', 'engines'].map((name) => path.join(backendSrc, name));
const importPattern = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g;

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) return listSourceFiles(fullPath);
    return /\.tsx?$/.test(entry) ? [fullPath] : [];
  });
}

function resolveRelativeImport(fromFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(importPattern)].map((match) => match[1] ?? match[2] ?? match[3]).filter((value): value is string => Boolean(value));
}

describe('decision code import boundary', () => {
  it('keeps trader and engines free of live/** modules in their transitive import graph', () => {
    const decisionFiles = decisionRoots.flatMap(listSourceFiles);
    expect(decisionFiles.length).toBeGreaterThan(0);

    const seen = new Set<string>();
    const queue = [...decisionFiles];
    const violations: string[] = [];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const specifier of importsOf(file)) {
        const resolved = resolveRelativeImport(file, specifier);
        if (!resolved) continue;
        if (resolved.startsWith(liveDir + path.sep)) {
          violations.push(`${path.relative(backendSrc, file)} -> ${path.relative(backendSrc, resolved)}`);
        } else if (!seen.has(resolved)) {
          queue.push(resolved);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
