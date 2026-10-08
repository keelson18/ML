# Fastify backend

The API is implemented with Fastify and TypeScript in `backend/src/`. The server entry point is `backend/src/server.ts`; there is no `api:dev` script or Express server in the current package scripts.

## Run locally

The repository root owns dependency installation and `.env.example`:

```bash
npm ci
npm run backend:dev
```

The backend listens on `AUTONOMY_PORT` (default `8787`), falling back to `PORT`. For the combined API + Vite workflow, use `npm run dev` from the repository root instead of starting a second backend on the same port.

Configure Supabase server credentials, CORS, market provider keys, and validated rate/trader settings in the root `.env`; see the root README and `.env.example`. Do not put provider keys or the service-role key in `VITE_` variables.

## Checks

```bash
npm run backend:typecheck
npm test
```

Fastify routes live in `backend/src/routes/`, business logic in `backend/src/services/`, market and trading policies in `backend/src/trader/` and `backend/src/autonomy/`, and provider access in `backend/src/services/`. Supabase Edge Functions and versioned SQL/RLS migrations live under the repository's `supabase/` directory.
