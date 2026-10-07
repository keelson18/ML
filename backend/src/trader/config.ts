// Parses all trader-domain limits and timeframes before trader services are constructed.
import { z } from 'zod';
import { TIMEFRAMES } from '../../../src/lib/types';
import { SETUP_TYPES } from './constants';

const timeframeValues = TIMEFRAMES.map(({ value }) => value) as [string, ...string[]];
const csv = (fallback: string, allowedValues: readonly string[]) => z.string().default(fallback)
  .transform((value) => value.split(',').map((entry) => entry.trim()).filter(Boolean))
  .pipe(z.array(z.enum(allowedValues as [string, ...string[]])).min(1));

const traderConfigSchema = z.object({
  TRADER_STARTING_EQUITY: z.coerce.number().finite().positive().default(100_000),
  RISK_PER_TRADE_PCT: z.coerce.number().finite().positive().max(100).default(0.5),
  MAX_PORTFOLIO_HEAT_PCT: z.coerce.number().finite().positive().max(100).default(2),
  MAX_GROSS_EXPOSURE_PCT: z.coerce.number().finite().positive().max(100).default(50),
  MAX_SYMBOL_EXPOSURE_PCT: z.coerce.number().finite().positive().max(100).default(25),
  MAX_CONCURRENT_POSITIONS: z.coerce.number().int().positive().default(3),
  MAX_CORRELATED_POSITIONS: z.coerce.number().int().min(1).max(2).default(1),
  DAILY_LOSS_STOP_PCT: z.coerce.number().finite().positive().max(100).default(2),
  WEEKLY_LOSS_STOP_PCT: z.coerce.number().finite().positive().max(100).default(5),
  MAX_DRAWDOWN_PCT: z.coerce.number().finite().positive().max(100).default(20),
  LOSS_STREAK_LIMIT: z.coerce.number().int().positive().default(3),
  LOSS_STREAK_COOLDOWN_BARS: z.coerce.number().int().positive().default(24),
  MIN_RR: z.coerce.number().finite().positive().default(2),
  FEE_RATE: z.coerce.number().finite().min(0).max(1).default(0.001),
  SLIPPAGE_RATE: z.coerce.number().finite().min(0).max(1).default(0.0005),
  HTF_TIMEFRAMES: csv('4h,1d', timeframeValues),
  TRIGGER_TIMEFRAMES: csv('15m,1h', timeframeValues),
  MGMT_TIMEFRAME: z.enum(timeframeValues as [string, ...string[]]).default('5m'),
  PLAN_EXPIRY_BARS: z.coerce.number().int().positive().default(24),
  CLOSE_GRACE_MS: z.coerce.number().int().nonnegative().default(7_000),
  MAX_ENTRY_AGE_BARS: z.coerce.number().int().positive().default(2),
  SCHEDULER_MAX_CATCH_UP_BARS: z.coerce.number().int().positive().max(1000).default(100),
  SCHEDULER_SYMBOL_DELAY_MS: z.coerce.number().int().nonnegative().default(250),
  SCHEDULER_JITTER_MS: z.coerce.number().int().nonnegative().default(1_000),
  MAX_CONSECUTIVE_PROVIDER_FAILURES: z.coerce.number().int().positive().default(3),
  MIN_TRADES_FOR_STATS: z.coerce.number().int().positive().default(30),
  BOOTSTRAP_ITERATIONS: z.coerce.number().int().positive().max(20_000).default(1_000),
  BOOTSTRAP_CONFIDENCE_LEVEL: z.coerce.number().finite().gt(0.5).lt(1).default(0.95),
  CALIBRATION_RELIABILITY_BINS: z.coerce.number().int().min(2).max(100).default(10),
  RESEARCH_RANDOM_SEED: z.coerce.number().int().default(42),
  MIN_FORWARD_TRADES: z.coerce.number().int().positive().default(100),
  MIN_FORWARD_DAYS: z.coerce.number().int().positive().default(90),
  MIN_RANDOM_BASELINE_RUNS: z.coerce.number().int().positive().default(1_000),
  SHADOW_MODE_ENABLED: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  BREAK_EVEN_R: z.coerce.number().finite().positive().default(1),
  TRAIL_START_R: z.coerce.number().finite().positive().default(2),
  TRAILING_ATR_MULTIPLE: z.coerce.number().finite().positive().default(2),
  TIME_STOP_BARS: z.coerce.number().int().positive().default(96),
  TIME_STOP_MIN_PROGRESS_R: z.coerce.number().finite().nonnegative().default(0.25),
  ALLOWED_GRADES: csv('A,B', ['A', 'B', 'C']),
  ALLOWED_SETUP_TYPES: csv(SETUP_TYPES.join(','), SETUP_TYPES),
  WATCHLIST_MAX_SIZE: z.coerce.number().int().positive().default(12),
  STALE_DATA_BLOCKS_ENTRIES: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
});

export type TraderConfig = z.infer<typeof traderConfigSchema>;

export function parseTraderConfig(source: NodeJS.ProcessEnv = process.env): TraderConfig {
  const result = traderConfigSchema.safeParse(source);
  if (!result.success) {
    const variable = result.error.issues[0]?.path[0] ?? 'trader configuration';
    throw new Error(`${String(variable)} has an invalid trader configuration value.`);
  }
  return result.data;
}

export const traderConfig = parseTraderConfig();
