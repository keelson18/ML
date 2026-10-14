import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const connectionString = process.env.LOCAL_SUPABASE_DB_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres';
const dbUrl = new URL(connectionString);
if (!['localhost', '127.0.0.1', '::1'].includes(dbUrl.hostname) || dbUrl.port !== '54322') {
  throw new Error('Refusing to run holdout concurrency test outside the disposable local Supabase database on port 54322.');
}

const { Client } = pg;
const fixtureUserId = randomUUID();
const experimentIds = [randomUUID(), randomUUID(), randomUUID()];
const testStartTime = Math.ceil(Date.now() / 1000) + 3600;
const claimStartTime = testStartTime + 86400;
const clients = Array.from({ length: 3 }, () => new Client({ connectionString }));
const connectedClients = new Set();
const [winner, contender, adjacent] = clients;
let overlapAttempt;
let collectionAttempt;

try {
  for (const client of clients) {
    await client.connect();
    connectedClients.add(client);
  }
  await winner.query(`
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES ($1, 'authenticated', 'authenticated', $2, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
  `, [fixtureUserId, `holdout-${fixtureUserId}@example.invalid`]);
  for (const experimentId of experimentIds) {
    await winner.query(`
      INSERT INTO public.research_experiments (id, user_id, name, hypothesis, dataset_id, parameters, status)
      VALUES ($1, $2, $3, 'Disposable overlap concurrency test', 'local-fixture', $4, 'draft')
    `, [experimentId, fixtureUserId, `holdout-${experimentId}`, JSON.stringify({ setupType: 'trend-pullback', testStartTime })]);
  }

  await winner.query('BEGIN');
  await winner.query(`
    INSERT INTO public.research_holdout_claims (experiment_id, symbol, timeframe, dataset_id, test_start_time, test_end_time)
    VALUES ($1, 'BTCUSD', '1d', 'local-fixture', $2, $3)
  `, [experimentIds[0], claimStartTime, claimStartTime + 100000]);

  const contenderPid = (await contender.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  let overlapSettled = false;
  overlapAttempt = contender.query(`
    INSERT INTO public.research_holdout_claims (experiment_id, symbol, timeframe, dataset_id, test_start_time, test_end_time)
    VALUES ($1, 'BTCUSD', '1d', 'local-fixture', $2, $3)
  `, [experimentIds[1], claimStartTime + 50000, claimStartTime + 150000]).then((result) => {
    overlapSettled = true;
    return result;
  }, (error) => {
    overlapSettled = true;
    return error;
  });
  let observedLockWait = false;
  const waitDeadline = Date.now() + 5_000;
  while (Date.now() < waitDeadline) {
    const { rows } = await adjacent.query(`
      SELECT wait_event_type, wait_event
      FROM pg_stat_activity
      WHERE pid = $1
    `, [contenderPid]);
    if (rows[0]?.wait_event_type === 'Lock' && rows[0]?.wait_event === 'advisory') {
      observedLockWait = true;
      break;
    }
    if (overlapSettled) break;
    await delay(25);
  }
  assert.equal(observedLockWait, true, 'second PostgreSQL session must block on the advisory lock before the first commits');
  await winner.query('COMMIT');
  const overlapError = await overlapAttempt;
  assert.equal(overlapError?.code, '23P01', 'concurrent overlapping claim must fail with exclusion-style SQLSTATE 23P01');

  await adjacent.query(`
    INSERT INTO public.research_holdout_claims (experiment_id, symbol, timeframe, dataset_id, test_start_time, test_end_time)
    VALUES ($1, 'BTCUSD', '1d', 'local-fixture', $2, $3)
  `, [experimentIds[2], claimStartTime + 100000, claimStartTime + 200000]);

  const collectionSeries = [
    ['15m', 900, 200], ['1h', 3600, 50], ['4h', 14_400, 50], ['1d', 86_400, 50],
  ].map(([timeframe, step, count]) => {
    const lastClosedOpen = Math.floor(Date.now() / 1000 / step) * step - step * 2;
    const candles = Array.from({ length: count }, (_, index) => {
      const close = 100 + index * 0.01;
      return { time: lastClosedOpen - (count - index) * step, open: close - 0.01, high: close + 0.1, low: close - 0.1, close, volume: 100 };
    });
    return { timeframe, provider: 'local-concurrency-fixture', dataVersion: `${timeframe}-v1`, fetchedAt: Date.now(), candles };
  });
  await winner.query("SELECT set_config('request.jwt.claim.role', 'service_role', false)");
  await contender.query("SELECT set_config('request.jwt.claim.role', 'service_role', false)");
  await winner.query('BEGIN');
  const firstCollection = await winner.query(`
    SELECT public.append_research_collection_batch($1, $2, 'BTCUSD', true, $3::jsonb) AS result
  `, [experimentIds[2], fixtureUserId, JSON.stringify(collectionSeries)]);
  const collectionPid = (await contender.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  let collectionSettled = false;
  collectionAttempt = contender.query(`
    SELECT public.append_research_collection_batch($1, $2, 'BTCUSD', true, $3::jsonb) AS result
  `, [experimentIds[2], fixtureUserId, JSON.stringify(collectionSeries)]).then((result) => {
    collectionSettled = true;
    return result;
  }, (error) => {
    collectionSettled = true;
    return error;
  });
  let observedCollectionLock = false;
  const collectionWaitDeadline = Date.now() + 5_000;
  while (Date.now() < collectionWaitDeadline) {
    const { rows } = await adjacent.query('SELECT wait_event_type, wait_event FROM pg_stat_activity WHERE pid = $1', [collectionPid]);
    if (rows[0]?.wait_event_type === 'Lock' && rows[0]?.wait_event === 'advisory') { observedCollectionLock = true; break; }
    if (collectionSettled) break;
    await delay(25);
  }
  assert.equal(observedCollectionLock, true, 'concurrent collection retries must wait for the per-experiment advisory lock');
  await winner.query('COMMIT');
  const retryResult = await collectionAttempt;
  assert.equal(firstCollection.rows[0].result.newCandles, 350, 'the first request stores the four-timeframe baseline');
  assert.equal(retryResult?.rows?.[0]?.result?.newCandles, 0, 'a concurrent identical retry adds no duplicate candles');
  process.stdout.write('PASS: overlapping holdout claims reject races; adjacent intervals pass; concurrent research collection retry is idempotent.\n');
} finally {
  if (connectedClients.has(winner)) {
    try { await winner.query('ROLLBACK'); } catch { /* transaction may already be committed */ }
    if (overlapAttempt) await overlapAttempt;
    if (collectionAttempt) await collectionAttempt;
    try {
      await winner.query('ALTER TABLE public.research_collection_candles DISABLE TRIGGER research_collection_candles_immutable');
      await winner.query('DELETE FROM public.research_collection_candles WHERE experiment_id = ANY($1::uuid[])', [experimentIds]);
      await winner.query('ALTER TABLE public.research_collection_candles ENABLE TRIGGER research_collection_candles_immutable');
      await winner.query('DELETE FROM public.research_collection_state WHERE experiment_id = ANY($1::uuid[])', [experimentIds]);
      await winner.query('DELETE FROM public.research_holdout_claims WHERE experiment_id = ANY($1::uuid[])', [experimentIds]);
      await winner.query('DELETE FROM public.research_experiments WHERE id = ANY($1::uuid[])', [experimentIds]);
      await winner.query('DELETE FROM auth.users WHERE id = $1', [fixtureUserId]);
    } catch { /* Preserve the original failure; disposable local DB may have stopped. */ }
  }
  await Promise.all([...connectedClients].map((client) => client.end().catch(() => undefined)));
}
