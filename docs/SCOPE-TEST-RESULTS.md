# Qualification-route verification — 9 November 2026

Baseline: `af37775de203d38c02eccd780dce2284c61b0369`, restored from a private GitHub source export and verified against its Git tree.

Changes tested: Double Award/separate-science programme metadata; qualification-paper mappings; higher-demand defaults; profile preference RLS; preservation of historical records; rejection of new Foundation practice requests; qualification-aware question/mock validation.

- TypeScript `tsc --noEmit`: PASS.
- Full baseline and expanded regression suite: 149 passed, 0 failed, 0 skipped.
- Database tests use PGlite and explicit test-only Auth/Storage shims.
- Official Double Award source: checked directly; checksum and page references are in QUALIFICATION-ROUTES.md.
- No live database migration, Supabase Auth/Storage test, AI/OCR call or deployment was performed.

The new validators and schema are implemented. The website UI, authentication workflows, full objective mapping and live AI/document pipelines remain unfinished. These results are not a production-readiness or scientific-perfection claim.
