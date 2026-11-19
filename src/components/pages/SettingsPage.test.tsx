import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SettingsPage from './SettingsPage';

describe('SettingsPage', () => {
  it('attributes password attempt limits to the authentication provider instead of a local lock', () => {
    const markup = renderToStaticMarkup(<SettingsPage />);

    expect(markup).toContain('Attempts are limited by the authentication provider.');
    expect(markup).not.toContain('locked for 15 minutes');
  });
});
