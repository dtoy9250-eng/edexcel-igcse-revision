# Science Ledger

An independent AI-assisted revision platform for Edexcel International GCSE Biology (4BI1), Chemistry (4CH1) and Physics (4PH1).

**Work in progress. Not a released or production-ready revision product.** This repository is being implemented in stages. No simulated AI results or invented learner scores are presented as real functionality. No Pearson affiliation or official marking claim is made.

## Delivery stages
1. Architecture, database migrations, assessment invariants and automated foundation tests.
2. Responsive Next.js frontend, Supabase authentication and core workflows.
3. Private document processing/OCR, original question generation, marking and timed mocks.
4. Integration/security/accessibility tests and explicitly authorized deployment.

See [architecture](docs/ARCHITECTURE.md), [status](docs/STATUS.md), [specification evidence](docs/SPECIFICATIONS.md) and [security](SECURITY.md).

## Development
Requires Node.js 22.18–24.x and Corepack.

```sh
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
```

Foundation database tests use PGlite with explicitly labelled Auth/Storage test shims. They are not a substitute for real Supabase Auth, Storage, private signed-URL or live-model testing.

Never commit API keys, filled environment files, copyrighted papers or students' answers. Live migrations, paid services, worker provisioning and Vercel deployment require separate approval.
