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

function reachableFrom(start: string): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of importsOf(file)) {
      const resolved = resolveRelativeImport(file, specifier);
      if (resolved) queue.push(resolved);
    }
  }
  return seen;
}

describe('decision code import boundary', () => {
  it('keeps trader and engines free of live/** modules in their transitive import graph', () => {
    const decisionFiles = decisionRoots.flatMap(listSourceFiles);
    expect(decisionFiles.length).toBeGreaterThan(0);

    const violations = decisionFiles.flatMap((file) => {
      const reached = reachableFrom(file);
      return [...reached].filter((reachedFile) => reachedFile.startsWith(liveDir + path.sep)).map((liveFile) => `${path.relative(backendSrc, file)} -> ${path.relative(backendSrc, liveFile)}`);
    });
    expect(violations).toEqual([]);
  });
});
