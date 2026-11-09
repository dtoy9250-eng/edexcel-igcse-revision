# Database contract

Apply the ordered migrations once, via a migration ledger, to a NEW explicitly approved Supabase project. No live migration has been run. Migration files are transactional, not reset scripts.

## Permissions
Catalog metadata is publicly readable. Authenticated learners can read only their own private rows and update only profile preferences. The browser cannot create questions, grant validation status, award marks, alter quotas, execute worker RPCs or read stored solutions/criteria. Marking results are withheld during an active mock. A separate server result DTO must authorize solution disclosure after submission.

A Supabase service-role credential bypasses RLS: every handler must validate `auth.getUser()` and explicitly scope records to that user. Client-supplied owner IDs, validation states, scores, deadlines and quota limits are not trusted.

## Transactions and invariants
Construct pending questions, insert solutions and criteria, then validate in the same transaction. Deferred constraints enforce verified objective ownership/scope, independent verification metadata and allocation totals. Validated question/solution content is immutable.

Construct a draft marking run, insert all criterion awards, then validate and accept the run atomically. Positive marks require submitted-answer evidence; ECF requires an eligible criterion; totals and maxima are checked. Accepted analytics reads the attempt's accepted validated run only, not every historical run.

Build mocks in the building state, insert ordered questions, then publish as ready. Totals, contiguous positions, subject, specification and core scope are checked. Start/save/submit functions use server time, lock state consistently and enqueue marking idempotently. Time-spent recording is a capped server-observed activity estimate, not proof of uninterrupted study time.

Worker claims use SKIP LOCKED, expiring leases and an attempt token. Stale workers cannot finish a reclaimed job. Usage increments are atomic, bounded and server-only. Real concurrent worker/load tests are still required before release.

## Storage and deletion
The bucket is private with a 25 MiB limit and PDF/PNG/JPEG allowlist. A browser may insert only a registered owner-specific original path. It may not overwrite/delete objects through a broad policy. Declared MIME is not trusted; application-level magic, malware and parser-resource checks remain necessary.

PGlite tests use explicit test-only Auth and Storage table shims. They do not test the real Supabase upload service, token validation, signed URLs, backup behaviour or MIME enforcement.

Auth-user deletion cascades private database records, but it does not purge Storage. A production erasure workflow must cancel jobs, remove private objects and handle retention/backups before deleting the Auth identity. Do not log paper/answer content in audit metadata.
