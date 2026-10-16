import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Sidebar from './Sidebar';

const renderSidebar = (isAdmin: boolean) => renderToStaticMarkup(
  <Sidebar activeTab="dashboard" onTabChange={vi.fn()} onSignOut={vi.fn()} isAdmin={isAdmin} />,
);

describe('Sidebar', () => {
  it('renders expanded desktop navigation without a collapse control', () => {
    const markup = renderSidebar(false);
    expect(markup).toContain('class="app-sidebar"');
    expect(markup).toContain('aria-label="Main navigation"');
    expect(markup).not.toMatch(/collapse navigation|expand navigation|is-collapsed|sidebar-toggle/i);
    expect(markup).toContain('Sign out');
    expect(markup).toContain('sidebar-sign-out');
    expect(markup).not.toContain('Admin Panel');
  });

  it('renders Admin only for admins and keeps the active page announced', () => {
    const markup = renderSidebar(true);
    expect(markup).toContain('Admin Panel');
    expect(markup).toContain('aria-current="page"');
  });
});
