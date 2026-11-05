import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Candle } from '../lib/types';
import PriceChart from './PriceChart';
import { resolveThemeColors } from './price-chart-colors';

const cssVariables: Record<string, string> = {};

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of Object.keys(cssVariables)) delete cssVariables[key];
});

function stubCssVariables(values: Record<string, string>) {
  Object.assign(cssVariables, values);
  vi.stubGlobal('document', { documentElement: {} });
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: (name: string) => cssVariables[name] ?? '',
  }));
}

describe('PriceChart', () => {
  it('converts CSS RGB channels into comma-separated colors', () => {
    stubCssVariables({
      '--bg': '150 150 165',
      '--text': '52 211 153',
      '--primary': '#3b82f6',
    });

    expect(resolveThemeColors('dark')).toMatchObject({
      bg: 'rgb(150, 150, 165)',
      text: 'rgb(52, 211, 153)',
      primary: '#3b82f6',
    });
  });

  it('uses theme fallbacks for missing and invalid CSS values', () => {
    stubCssVariables({
      '--bg': '1 2',
      '--text': '256 0 0',
      '--muted': 'not-a-color',
      '--border': '1 two 3',
    });

    expect(resolveThemeColors('light')).toMatchObject({
      bg: '#ffffff',
      text: '#111827',
      muted: '#787887',
      border: '#f0f0f4',
    });
    expect(resolveThemeColors('dark')).toMatchObject({
      bg: '#14141a',
      text: '#f3f4f6',
      muted: '#9696a5',
      border: '#1e1e26',
    });
  });

  it('renders candle values without layer controls or chart-only drawings', () => {
    const candle: Candle = {
      time: 1_767_225_600,
      open: 99,
      high: 102,
      low: 98,
      close: 101,
      volume: 12,
    };
    const markup = renderToStaticMarkup(<PriceChart candles={[candle]} theme="dark" />);

    expect(markup).toContain('role="img"');
    expect(markup).toContain('Price chart with 1 bar. Latest close: 101.');
    expect(markup).toContain('Latest chart values');
    expect(markup).toContain('<td>99</td><td>102</td><td>98</td><td>101</td>');
    expect(markup).not.toContain('Chart layers');
    expect(markup).not.toContain('Structure');
    expect(markup).not.toContain('Zones');
    expect(markup).not.toContain('Signals');
    expect(markup).not.toContain('Trade levels');
    expect(markup).not.toContain('Trades');
    expect(markup).not.toContain('<svg');
  });
});
