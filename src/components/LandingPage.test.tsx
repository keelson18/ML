import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import LandingPage from './LandingPage';

describe('LandingPage', () => {
  it('explains the supported research scope and paper-only workflow', () => {
    const markup = renderToStaticMarkup(<LandingPage onSignIn={vi.fn()} onSignUp={vi.fn()} />);

    expect(markup).toContain('CRYPTO &amp; COMMODITY MARKET RESEARCH');
    expect(markup).toContain('no live orders or real-money execution');
    expect(markup).toContain('Paper trading only');
    expect(markup).toContain('Illustrative preview of the market intelligence workspace');
  });
});
