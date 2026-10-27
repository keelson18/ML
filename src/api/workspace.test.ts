import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, maybeSingle, select } = vi.hoisted(() => ({
  from: vi.fn(),
  maybeSingle: vi.fn(),
  select: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ supabase: { from } }));

import { workspaceApi } from './workspace';

describe('workspace preferences', () => {
  beforeEach(() => {
    from.mockReturnValue({ select });
    select.mockReturnValue({ maybeSingle });
    maybeSingle.mockResolvedValue({
      data: {
        theme: 'light',
        notifications: { marketAlerts: false, news: true },
        chart_layers: { structure: false, zones: true, signals: true, tradeLevels: true, trades: true },
      },
      error: null,
    });
  });

  it('loads regular preferences while safely ignoring legacy chart layers', async () => {
    await expect(workspaceApi.getPreferences()).resolves.toEqual({
      theme: 'light',
      notifications: { marketAlerts: false, news: true },
    });
    expect(select).toHaveBeenCalledWith('theme,notifications');
  });
});
