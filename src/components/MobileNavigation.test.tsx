import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import MobileNavigation from './MobileNavigation';

const renderNavigation = (isAdmin: boolean) => renderToStaticMarkup(
  <MobileNavigation activeTab="dashboard" isAdmin={isAdmin} onNavigate={vi.fn()} onSignOut={vi.fn()} />,
);

describe('MobileNavigation', () => {
  it('renders exactly the five primary destinations and More entry', () => {
    const markup = renderNavigation(false);
    expect(markup.match(/class="mobile-tab(?: is-active)?"/g)).toHaveLength(5);
    for (const label of ['Chart', 'Trader', 'Portfolio', 'Research', 'More']) expect(markup).toContain(`>${label}<`);
    expect(markup).not.toContain('sidebar-backdrop');
  });

  it('keeps the More entry available as a dialog trigger', () => {
    expect(renderNavigation(true)).toContain('aria-haspopup="dialog"');
  });
});
