import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { collectPersonalData } from './personalDataExport';

describe('personal data export isolation', () => {
  it('filters every direct owner dataset and related rows to the authenticated owner', async () => {
    const filters: Array<{ table: string; column: string; ids: string[] }> = [];
    const datasets: Record<string, Array<Record<string, unknown>>> = {
      profiles: [{ id: 'user-a' }, { id: 'user-b' }],
      user_preferences: [{ user_id: 'user-a' }, { user_id: 'user-b' }],
      user_watchlists: [{ user_id: 'user-a' }, { user_id: 'user-b' }],
      price_alerts: [{ user_id: 'user-a' }, { user_id: 'user-b' }],
      paper_accounts: [{ id: 'paper-account-a', user_id: 'user-a' }, { id: 'paper-account-b', user_id: 'user-b' }],
      trade_decisions: [{ id: 'decision-a', user_id: 'user-a' }, { id: 'decision-b', user_id: 'user-b' }],
      paper_sim_accounts: [{ account_id: 'user-a', state: { cash: 100 } }, { account_id: 'user-b', state: { cash: 900 } }],
      trade_plans: [{ account_id: 'user-a', id: 'plan-a' }, { account_id: 'user-b', id: 'plan-b' }],
      plan_events: [{ account_id: 'user-a', id: 'event-a' }, { account_id: 'user-b', id: 'event-b' }],
      trade_journal: [{ account_id: 'user-a', id: 'journal-a' }, { account_id: 'user-b', id: 'journal-b' }],
      daily_reviews: [{ account_id: 'user-a', id: 'review-a' }, { account_id: 'user-b', id: 'review-b' }],
      risk_profiles: [{ user_id: 'user-a' }, { user_id: 'user-b' }],
      paper_orders: [{ account_id: 'paper-account-a', id: 'order-a' }, { account_id: 'paper-account-b', id: 'order-b' }],
      paper_positions: [{ account_id: 'paper-account-a', id: 'position-a' }, { account_id: 'paper-account-b', id: 'position-b' }],
      paper_trades: [{ account_id: 'paper-account-a', id: 'trade-a' }, { account_id: 'paper-account-b', id: 'trade-b' }],
      decision_evidence: [{ decision_id: 'decision-a', id: 'evidence-a' }, { decision_id: 'decision-b', id: 'evidence-b' }],
    };
    const client = {
      from: (table: string) => ({
        select: () => ({
          eq: async (column: string, value: string) => {
            filters.push({ table, column, ids: [value] });
            return { data: (datasets[table] ?? []).filter((row) => row[column] === value), error: null };
          },
          in: async (column: string, ids: string[]) => {
            filters.push({ table, column, ids });
            return { data: (datasets[table] ?? []).filter((row) => ids.includes(String(row[column]))), error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;

    const result = await collectPersonalData(client, 'user-a');

    const directOwnerTables = new Set(['profiles', 'user_preferences', 'user_watchlists', 'price_alerts', 'trade_decisions', 'paper_accounts', 'paper_sim_accounts', 'trade_plans', 'plan_events', 'trade_journal', 'daily_reviews', 'risk_profiles']);
    expect(filters.filter((filter) => directOwnerTables.has(filter.table)).every((filter) => filter.ids[0] === 'user-a')).toBe(true);
    expect(filters.find((filter) => filter.table === 'paper_orders')?.ids).toEqual(['paper-account-a']);
    expect(filters.find((filter) => filter.table === 'decision_evidence')?.ids).toEqual(['decision-a']);
    expect(result.profile).toEqual([{ id: 'user-a' }]);
    expect(result.traderDesk.paperAccountState).toEqual([{ account_id: 'user-a', state: { cash: 100 } }]);
    expect(result.traderDesk.plans).toEqual([{ account_id: 'user-a', id: 'plan-a' }]);
    expect(result.paperTrades).toEqual([{ account_id: 'paper-account-a', id: 'trade-a' }]);
    expect(result.paperOrders).toEqual([{ account_id: 'paper-account-a', id: 'order-a' }]);
    expect(result.evidence).toEqual([{ decision_id: 'decision-a', id: 'evidence-a' }]);
  });
});
