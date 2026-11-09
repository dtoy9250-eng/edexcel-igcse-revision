# Architecture

## Stack and boundaries
- Next.js App Router, React, TypeScript and Tailwind; server components by default.
- Supabase Auth with SSR cookie sessions and server-side `auth.getUser()` validation. Never authorize from an unverified client session or a browser-supplied owner ID.
- PostgreSQL migrations; RLS on every application table. Assessment mutations are server-only. Browser roles cannot award marks or mark a question as validated.
- Private Supabase Storage bucket. Owner-prefixed object keys, size/MIME checks, file-magic inspection and short-lived signed URLs after ownership checks. Never a public paper library.
- Persistent job queue with atomic claims, expiring leases, attempt fencing, retry limits and idempotency keys. OCR never blocks an interactive request.
- Vercel hosts the web tier. A separately approved background-worker runtime or bounded scheduled steps are required for PDF/OCR/AI jobs; no worker is provisioned yet.
- Server-only model credentials. Generation, independent scientific verification and criterion marking are separate tasks. Missing configuration must produce an honest unavailable state, not a mock AI response.

## Application routes
Dashboard; subjects and topic objectives; private paper library; practice generator and answer workspace; mocks and timed runner; results; analytics; settings; sign-in, signup, callback and password recovery.

Each state-changing handler verifies identity, origin/CSRF, ownership, input schema, quota and allowed state transition. Browser request parameters never define an authoritative score, deadline, validation state or user ID. Stored solutions are isolated from question prompts and have no direct client SELECT grant. Active mock DTOs explicitly whitelist visible fields.

## Data model
- Catalog: subjects, specification versions, topic groups/objectives, verified paper blueprints.
- Private corpus: documents, pages/layout/OCR and extracted questions/subquestions.
- Original questions: visible question content, separate solutions and detailed mark criteria.
- Assessments: mocks and ordered items; attempts; immutable marking runs and per-criterion awards; one accepted result per attempt for analytics.
- Operations: jobs, atomic usage counters and redacted audit events.

## Assessment rules
Criterion allocations sum exactly to the question maximum. Every criterion is evaluated once. Positive marks require evidence in the submitted answer. ECF is allowed only where the scheme explicitly permits it and the feedback explains it. Award totals are derived from validated criterion awards, not invented model totals.

A second model's agreement is a check, not proof of scientific truth. Supported calculations also require deterministic recalculation; ambiguous or unsupported content is held for review. No official grade or grade boundary is invented. AI marks are advisory and are not official Pearson marks.

Mock readiness requires a verified subject-specific blueprint, validated original questions, correct scope and exact mark totals. Paper 1 must not include extension-only or mixed-scope objectives. No fixed official question count or topic weighting is invented. Server deadlines survive refresh. Submitted answers are immutable; mark schemes stay hidden until submission.

Analytics uses only accepted, validated results: earned/available marks, actual recorded time and repeated evidenced mistakes. No-data accuracy is null, not an invented percentage. Recommendations disclose their sample size; unassessed topics get diagnostic recommendations, not fabricated weaknesses.

## Documents and AI
Upload -> quarantine/magic/size/page/resource checks -> embedded-text/layout extraction -> raster/OCR where needed -> typed extraction -> confidence and structural validation -> owner review. Preserve originals and page/crop coordinates for diagrams, tables, graphs and notation. Low-confidence handwriting must be reviewed; an unreadable response is not automatically a zero.

Document text and typed answers are untrusted data, never worker or model instructions. Do not fetch arbitrary user-supplied URLs. Uploaded Pearson material must not enter a shared question bank, public CDN, repository, logs, analytics text or model training corpus. Provider retention and subprocessors must be disclosed before enabling uploads.

Generate from verified curriculum objectives and assessment structure, not by rewriting past-paper text. Screen against the owner's private corpus and previous questions. Similarity screening is a limited risk signal, not a guarantee of global originality.

Biology remains at safe GCSE conceptual level. Do not provide actionable pathogen engineering, harmful culture or dissemination workflows.

## Quality and release gates
WCAG 2.2 AA target; semantic keyboard-accessible forms; responsive desktop/tablet/mobile tests; readable scientific notation and alternatives; explicit loading/error/empty states. No dead or decorative buttons.

Before public launch: verified objective mapping, live auth/storage cross-owner tests, malicious-document tests, AI evaluation set, accessibility and responsive tests, a production build, spend limits, retention/export/erasure policy, age/jurisdiction and child-data review, backup/recovery and observability. Database cascades do not delete Storage objects; purge objects before deleting the Auth user.

No compliance, scientific perfection, production readiness or successful deployment is implied by this architecture document.
