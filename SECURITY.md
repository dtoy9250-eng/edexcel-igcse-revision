# Security and privacy

Do not place keys, papers or student responses in issues, commits or logs. Report vulnerabilities privately to the repository owner. Do not use real student data in test fixtures.

Server-only service credentials must never use NEXT_PUBLIC_ prefixes. Application tables use RLS; privileged server operations still require explicit ownership checks. Uploaded documents remain private. Signed URLs must be short-lived and never logged.

Document parsers require file-magic, size/page/pixel/CPU limits and isolated execution. Treat PDF and answer content as data, not instructions. No arbitrary URL fetches or executable model output. Uncertain scientific content, OCR or marking must fail closed into review.

The application is not ready for public launch until live authorization tests, privacy/retention/erasure controls, provider disclosures, spend limits and age/jurisdiction requirements have been reviewed. No legal-compliance certification is claimed.
