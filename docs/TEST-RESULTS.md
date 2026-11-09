# Executed foundation checks — 9 November 2026

Source baseline: `6b308d26a49a4c78958c12123601631622f71f36`.
All 23 files were fetched through the connected GitHub tools and checked against their Git blob SHA-1 identifiers before local verification.

| Check | Result |
|---|---|
| Node.js runtime | 24.22.1 |
| pnpm | 12.18.0 |
| TypeScript `tsc --noEmit` | PASS |
| Repository regression suite | 108 passed; 0 failed; 0 skipped |
| Database engine | PGlite 0.5.16, PostgreSQL WASM |
| Live Supabase Auth/Storage or signed uploads | NOT RUN |
| Live AI/OCR or scientific-quality evaluation | NOT RUN |
| Complete frontend build and browser tests for this repository | NOT IMPLEMENTED / NOT RUN |
| Vercel deployment | NOT AUTHORIZED / NOT RUN |

Tests cover structured question validation, criterion totals/evidence, ECF eligibility, independent-marking disagreement, numerical recalculation, private-storage ownership, RLS, immutable answers/results, mock-paper totals and scope, queue leases/idempotency and usage ceilings.

Auth and Storage schemas in the database tests are explicit test shims. Passing these tests does not demonstrate that live Supabase Auth/Storage integrations work, that generated scientific answers are universally correct, or that an official Pearson mark or grade can be issued.

The test command uses single-task baseline WebAssembly compilation and a bounded heap so that the database suite runs in the development sandbox. This affects the test runtime, not production application behavior.

Run locally:
```sh
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm test
```
