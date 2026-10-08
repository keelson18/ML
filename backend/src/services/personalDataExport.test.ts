import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { collectPersonalData } from './personalDataExport';

describe('personal data export isolation', () => {
  it('filters every direct owner dataset and related rows to the authenticated owner', async () => {
    const filters: Array<{ table: string; column: string; ids: string[] }> = [];
    const datasets: Record<string, Array<Record<string, unknown>>> = {
      paper_accounts: [{ id: 'paper-account-a', user_id: 'user-a' }],
      trade_decisions: [{ id: 'decision-a', user_id: 'user-a' }],
      paper_sim_accounts: [{ account_id: 'user-a', state: { cash: 100 } }],
    };
    const client = {
      from: (table: string) => ({
        select: () => ({
          eq: async (column: string, value: string) => {
            filters.push({ table, column, ids: [value] });
            return { data: datasets[table] ?? [], error: null };
          },
          in: async (column: string, ids: string[]) => {
            filters.push({ table, column, ids });
            return { data: [], error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;

    const result = await collectPersonalData(client, 'user-a');

    const directOwnerTables = new Set(['profiles', 'user_preferences', 'user_watchlists', 'price_alerts', 'trade_decisions', 'paper_accounts', 'paper_sim_accounts', 'trade_plans', 'plan_events', 'trade_journal', 'daily_reviews', 'risk_profiles']);
    expect(filters.filter((filter) => directOwnerTables.has(filter.table)).every((filter) => filter.ids[0] === 'user-a')).toBe(true);
    expect(filters.find((filter) => filter.table === 'paper_orders')?.ids).toEqual(['paper-account-a']);
    expect(filters.find((filter) => filter.table === 'decision_evidence')?.ids).toEqual(['decision-a']);
    expect(result.traderDesk.paperAccountState).toEqual([{ account_id: 'user-a', state: { cash: 100 } }]);
  });
});
