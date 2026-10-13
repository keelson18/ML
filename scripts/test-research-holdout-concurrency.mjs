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
  process.stdout.write('PASS: concurrent overlapping holdout claim rejected; adjacent half-open interval accepted.\n');
} finally {
  if (connectedClients.has(winner)) {
    try { await winner.query('ROLLBACK'); } catch { /* transaction may already be committed */ }
    if (overlapAttempt) await overlapAttempt;
    try {
      await winner.query('DELETE FROM public.research_holdout_claims WHERE experiment_id = ANY($1::uuid[])', [experimentIds]);
      await winner.query('DELETE FROM public.research_experiments WHERE id = ANY($1::uuid[])', [experimentIds]);
      await winner.query('DELETE FROM auth.users WHERE id = $1', [fixtureUserId]);
    } catch { /* Preserve the original failure; disposable local DB may have stopped. */ }
  }
  await Promise.all([...connectedClients].map((client) => client.end().catch(() => undefined)));
}
