# Implementation status

## Verified core and qualification scope — 9 November 2026
- Private source repository is durable and versioned.
- Linear International GCSE Double Award (4SD0) and separate/triple sciences (4BI1, 4CH1, 4PH1) are represented as distinct programmes.
- New practice defaults to Higher demand, with Standard exam demand and Challenge also available. No new Foundation practice option is accepted.
- International GCSE exams remain correctly labelled untiered; UK GCSE Higher specifications are not silently substituted.
- Versioned schema, privacy rules, assessment invariants, queue/quota operations and course-aware validators are implemented.
- The expanded baseline and qualification suite passed 149 tests with no failures or skips; TypeScript checking passed. See SCOPE-TEST-RESULTS.md and QUALIFICATION-ROUTES.md.

## Not yet implemented or released
The complete Next.js frontend, authentication flows, live Supabase integration, PDF/OCR pipeline, live AI generation/marking, timed mock UI, full objective mapping, privacy export/erasure and end-to-end/accessibility evaluation remain to be completed. These core helpers are not a live AI service.

## Configuration and authorization required
1. Choose or create a Supabase project and region, then approve migrations to that exact target. The last account inspection returned no accessible projects.
2. Configure server-only AI/OCR credentials, model IDs, retention policy and usage/spend limits through secret management, not chat or version control.
3. Approve worker hosting and, only after full implementation and test review, Vercel deployment separately.

No live database change or deployment has been performed. This is not a finished or production-ready revision website.
