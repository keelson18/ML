import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required.');
}

const databaseUrl = new URL(connectionString);

if (
  process.env.NODE_ENV === 'production' &&
  ['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname)
) {
  throw new Error('Production must not use the local development database.');
}

export const postgresPool = new Pool({
  connectionString,
  max: 5,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});

postgresPool.on('error', () => {
  // Do not log credentials or connection strings.
  console.error('Unexpected idle PostgreSQL connection error.');
});
