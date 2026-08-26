# Birvo AI Handoff

This historical handoff was superseded on August 24, 2026 because it contained outdated “100% complete” claims and no longer matched the product.

Use [BIRVO_STATUS.md](./BIRVO_STATUS.md) as the authoritative engineering handoff and [README.md](./README.md) for setup and verified product boundaries.

Before making changes:

1. Read `AGENTS.md` and `BIRVO_STATUS.md`.
2. Preserve unrelated working-tree changes.
3. Do not treat the local preview database as production data.
4. Do not claim Stripe, live weather, official WHS/GHIN, or production readiness unless the corresponding integration has been implemented and verified.
5. Run `npm test`, `npm run lint`, and `npm run build` before handoff.
