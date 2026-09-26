# GreenHill Backend Services

**Status:** Phase 0 — Baseline & Stabilization  
**Purpose:** API layer, domain services, and intelligence engines  
**Architecture:** Modular, TypeScript-based service layer

## Structure

```
backend/
├─ src/
│  ├─ domain/          # Entity definitions & value objects
│  ├─ application/     # Use cases & orchestration
│  ├─ infrastructure/  # Data access, external APIs, cache
│  ├─ api/             # REST endpoints & contracts
│  ├─ middleware/      # Auth, logging, error handling
│  ├─ config/          # Configuration & secrets
│  ├─ logger/          # Structured logging
│  └─ utils/           # Shared utilities
├─ __tests__/          # Test suites
├─ package.json
├─ tsconfig.json
└─ .env.example
```

## Key Principles

- **Domain-Driven Design** — Clear domain entities
- **Separation of Concerns** — API/Application/Infrastructure isolation
- **Type Safety** — Strong TypeScript typing
- **Testability** — Unit and integration testing
- **Auditability** — Comprehensive logging with correlation IDs
- **No Mutation of Production** — Strict separation of concerns

## Phase 0 Goals

- [x] Create backend structure
- [x] Define domain entities
- [x] Establish API contracts
- [x] Set up logging infrastructure
- [x] Configure environment management
- [ ] Wire frontend to backend (Phase 1)
- [ ] Implement intelligence engines (Phases 4+)

---

See main documentation:
- [GreenHill Architecture Bible](../GreenHill_Architecture_Bible_v1.0.md)
- [GreenHill Database Bible](../GreenHill_Database_Bible_v1.0.md)
- [Implementation Roadmap](../GreenHill_Implementation_Roadmap_v1.0.md)







Refactor the project architecture to ensure a clean separation of concerns with the following strict requirements:

## Architecture Requirements

### Folder Structure
Organize the project by technical layer:
```
/
├── backend/
│   ├── controllers/       # Route handlers, request/response logic
│   ├── services/          # Business logic layer
│   ├── models/            # Data models and types
│   ├── repositories/      # Data access layer (Supabase queries)
│   ├── routes/            # API route definitions
│   ├── middleware/        # Auth, error handling, validation middleware
│   └── index.ts           # Entry point, Express app setup
├── src/                   # React frontend (Vite + TypeScript)
│   ├── api/               # Centralized API client (ONLY place that calls backend)
│   ├── components/
│   ├── hooks/
│   ├── pages/
│   ├── types/
│   └── main.tsx
```

### Critical Rules

1. **No direct frontend-to-backend communication**: The React frontend must NEVER call Supabase directly. All Supabase interactions must live exclusively inside `backend/repositories/`.

2. **Single unified API endpoint**: The frontend communicates only through a single base API URL (e.g., `/api`). Create a centralized API client in `src/api/` (e.g., `src/api/client.ts`) that all frontend components and hooks use — no fetch/axios calls scattered across components.

3. **All backend code lives in `/backend`**: Every piece of server-side logic, including controllers, services, models, repositories, and route definitions, must reside inside the `backend/` folder. Nothing backend-related should exist outside of it.

4. **Layered backend architecture**:
   - `controllers/` — handle HTTP requests/responses only, delegate to services
   - `services/` — contain all business logic, call repositories
   - `repositories/` — contain all Supabase (`@supabase/supabase-js`) queries, no business logic
   - `models/` — shared TypeScript interfaces and types for data shapes

5. **Frontend API layer**: All API calls from the frontend must go through `src/api/`. Components and hooks must import from this API layer, never calling `fetch` or any HTTP client directly.

### Tech Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + `lightweight-charts` + `lucide-react`
- **Backend**: Node.js + Express (REST API) with a separate service layer
- **Database**: Supabase (via `@supabase/supabase-js`) — backend only
- **API Style**: RESTful with all routes prefixed under `/api`

### Deliverables
- Refactor all existing code to match this structure
- Ensure no Supabase imports exist anywhere in `src/`
- Ensure no direct `fetch`/HTTP calls exist outside of `src/api/`
- Export a typed API client from `src/api/client.ts` used consistently across the frontend
- Confirm all backend files are inside `backend/` with no exceptions