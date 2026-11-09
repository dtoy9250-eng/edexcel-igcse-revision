# Implementation status

## Confirmed
- Private GitHub repository created on 9 November 2026.
- Official linear specification PDFs inspected for paper structure; sources and checksums recorded in SPECIFICATIONS.md.
- No accessible Supabase project was returned by the connected account.

## Current stage
Architecture and database foundation are being implemented and tested. Test results must be recorded only after execution.

## Not yet complete
Full frontend and authentication flows; live Supabase database/storage integration; document parsing/OCR; live question generation and marking; timed mock runner; full objective mapping; privacy export/erasure; accessibility and end-to-end tests; background worker provisioning; Vercel deployment.

## Authorization/configuration needed
- Select or create a Supabase project and choose its region before any live migration.
- Configure server-only AI/OCR credentials and model IDs, retention policy and spend limits.
- Approve worker hosting and, after test review, Vercel deployment separately.

No finished application, passing test suite or live deployment is claimed at this checkpoint.
