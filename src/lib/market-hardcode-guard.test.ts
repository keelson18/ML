// Prevents default or legacy crypto symbols from leaking outside the registry/config.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOTS = ['src', 'backend/src', 'supabase/functions'];
const FORBIDDEN_SYMBOL_LITERAL = /(?<=['"`])(?:BTCUSD|ETHUSD|[A-Z0-9._-]*USDT)(?=['"`])/;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    const relative = path.relative(process.cwd(), filePath).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      if (/(^|\/)(migrations|__tests__|constants)(\/|$)/.test(relative)) return [];
      return sourceFiles(filePath);
    }
    if (!/\.(?:ts|tsx|js|jsx)$/.test(entry.name)
      || /\.(?:test|spec)\./.test(entry.name)
      || entry.name === 'markets.ts') return [];
    return [filePath];
  });
}

describe('market symbol hardcode guard', () => {
  it('keeps legacy and default symbols inside the market registry/configuration', () => {
    const matches = SOURCE_ROOTS.flatMap((root) => sourceFiles(path.resolve(process.cwd(), root)))
      .flatMap((filePath) => {
        const source = readFileSync(filePath, 'utf8');
        return source.split(/\r?\n/).flatMap((line, index) => FORBIDDEN_SYMBOL_LITERAL.test(line)
          ? [`${path.relative(process.cwd(), filePath)}:${index + 1}`]
          : []);
      });

    expect(matches).toEqual([]);
  });
});
