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
