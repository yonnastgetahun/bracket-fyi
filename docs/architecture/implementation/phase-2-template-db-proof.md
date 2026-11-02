# P10 draft-template database proof

Criteria written before integration probe:
- [x] Real adapter + seeder insert exactly nine unsealed/manual/unavailable catalog configs under service_role in a new disposable database.
- [x] Replay preserves full rows and creates no additional templates/configs; no leagues activated.
- [x] Drift is rejected without changing stored rows; browser roles cannot read private configs.

Verification: `RUN_EVENT_TEMPLATE_DB=1 npm test -- tests/events/template-seed-db.test.ts` passed (1 real integration case, 10.48 seconds) in retained `bracket_seed_9693f3b4a2d7`. Fresh migrations pinned through00006, nine production adapter/seeder inserts then replay, exact manifest equality, zero league rows, anon/authenticated denials and persisted drift. Test-only readonly-array type error corrected after the first runtime pass; exact-cwd ESLint and project TypeScript checks then passed. Earlier lint attempts from guard-reset cwd were invalid (missing config / ignored-outside-base warning), not accepted lint evidence.

Scope: original synthetic catalog only. SQL-backed Supabase query interface exercises real storage/constraints/grants, not PostgREST HTTP. No hosted environment, provider request, real send, or public activation. Parent owns `tests/events/template-seed-db.test.ts` and this report; no overlapping adapter/core edits.
