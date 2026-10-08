import type { SupabaseClient } from '@supabase/supabase-js';

async function rows(client: SupabaseClient, table: string, ownerColumn: string, ownerId: string) {
  const { data, error } = await client.from(table).select('*').eq(ownerColumn, ownerId);
  if (error) throw new Error(`Personal data export failed while reading ${table}.`);
  return data ?? [];
}

export async function collectPersonalData(client: SupabaseClient, userId: string) {
  const [profile, preferences, watchlists, alerts, decisions, paperAccounts, traderAccount, plans, planEvents, journal, reviews] = await Promise.all([
    rows(client, 'profiles', 'id', userId),
    rows(client, 'user_preferences', 'user_id', userId),
    rows(client, 'user_watchlists', 'user_id', userId),
    rows(client, 'price_alerts', 'user_id', userId),
    rows(client, 'trade_decisions', 'user_id', userId),
    rows(client, 'paper_accounts', 'user_id', userId),
    rows(client, 'paper_sim_accounts', 'account_id', userId),
    rows(client, 'trade_plans', 'account_id', userId),
    rows(client, 'plan_events', 'account_id', userId),
    rows(client, 'trade_journal', 'account_id', userId),
    rows(client, 'daily_reviews', 'account_id', userId),
  ]);
  const accountIds = paperAccounts.map((account) => String(account.id));
  const decisionIds = decisions.map((decision) => String(decision.id));
  const [orders, positions, trades, evidence, riskProfiles] = await Promise.all([
    relatedRows(client, 'paper_orders', 'account_id', accountIds),
    relatedRows(client, 'paper_positions', 'account_id', accountIds),
    relatedRows(client, 'paper_trades', 'account_id', accountIds),
    relatedRows(client, 'decision_evidence', 'decision_id', decisionIds),
    rows(client, 'risk_profiles', 'user_id', userId),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile, preferences, watchlists, alerts, decisions, evidence,
    paperAccounts, paperOrders: orders, paperPositions: positions, paperTrades: trades, riskProfiles,
    traderDesk: { paperAccountState: traderAccount, plans, planEvents, journal, dailyReviews: reviews },
  };
}

async function relatedRows(client: SupabaseClient, table: string, column: string, ids: string[]) {
  if (!ids.length) return [];
  const { data, error } = await client.from(table).select('*').in(column, ids);
  if (error) throw new Error(`Personal data export failed while reading ${table}.`);
  return data ?? [];
}
