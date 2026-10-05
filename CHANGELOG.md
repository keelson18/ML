# Changelog

## Phase 0 — security carry-over
- Added Fastify Helmet headers and production HSTS.
- Added configurable per-user request limits: 60 market requests and 5 analysis requests per one-minute window by default.
- Added migration `20261005000000_remove_authenticated_ml_rate_limit_read.sql`; apply it after the existing migrations to remove authenticated read access to ML rate-limit events.
- Existing potentially applied migrations were preserved; duplicate migration cleanup is deferred until the applied-ID map is available.
