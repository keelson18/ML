import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('decision news isolation', () => {
  it('does not include news or sentiment inputs in BUY/SELL decision analysis', () => {
    const source = readFileSync(resolve(process.cwd(), 'backend/src/engines/decision-engine.ts'), 'utf8');
    expect(source).not.toMatch(/news|sentiment/i);
  });
});
