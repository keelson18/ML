# Quantuam Trade — Implementation Batch 1

Add the spec-mandated **Confidence Engine** (§22) and **Contradiction Engine** (§23), integrate them into the Master Decision Engine, enrich the `TradeDecision` output, and add tests — all without removing existing working functionality.

## Steps

- [ ] 1. Create `src/lib/intelligence/confidence-engine.ts` (multi-factor confidence per §22)
- [ ] 2. Create `src/lib/intelligence/contradiction-engine.ts` (active contradiction search per §23)
- [ ] 3. Enrich `TradeDecision` in `decision-engine.ts` (entryZone, invalidation, targets, engineVersions, timestamp)
- [ ] 4. Wire confidence + contradiction engines into `masterDecisionEngine.analyze`
- [ ] 5. Export new modules from `src/lib/intelligence/index.ts`
- [ ] 6. Add tests for confidence engine, contradiction engine, and enriched decision engine
- [ ] 7. Run type check, lint, and tests; fix any issues
