# Structural qualifiers — bounded implementation

changed:
- `lib/events/application-manifest.ts`: NBA seed 7/8 slots become reviewed placements; share canonical Play-In entrant IDs; no Play-In markets/points added. Initial qualification windows stay closed.
- `lib/events/application-pairings.ts`: authenticated `reviewApplicationQualifiers` service, deriving actual winners in SQL rather than accepting entrants/manifests.
- `lib/events/application-contract.ts`: strict `structuralQualifierReviewInput`, explicit synthetic acknowledgment and all-or-none source credentials.
- `lib/events/application.ts`: qualification capability and initial actual pairings exposed to existing choices consumer.
- `supabase/migrations/20261027000015_structural_qualifiers.sql`: immutable idempotent reviews, current target/source basis checks, complete NCAA 12-qualifier/32-pairing validation; NBA actual six-game path validation and authenticated pinned source; additive versioned orientations; earliest-cutoff/postlock holds and freeze; no pick/participant/score copying.
- `supabase/rollbacks/20261027000015_structural_qualifiers_forward_repair.sql`: matching function and grants; preserves evidence, freezes affected leagues.
- `tests/events/structural-qualifiers.test.ts`: contract, closed initial structure, separate NBA score membership, immutable saved-pick scoring, denied credential.
- `tests/events/structural-qualifiers-db.test.ts`: executable transactional synthetic NCAA/NBA fixtures; authenticated/stale rejection, exact replay and key conflict, unchanged no-op, prelock correction with saved picks, real scorer on prelock capture, cutoff-only hold, immutable postlock manifest/picks, separate Play-In entries/picks and zero transferred points.
- Own work item: `docs/architecture/implementation/task-structural-qualifiers.md`.

matters: actual qualification changes reviewed initial-round orientations, never participant predictions; source and target league result/entry/point domains remain separate.

checks:
- `./node_modules/.bin/vitest run tests/events/structural-qualifiers.test.ts tests/events/structural-qualifiers-db.test.ts tests/events/application.test.ts tests/events/application-pairings.test.ts`: 21 passed, two SQL cases skipped pending parent-owned DB.
- `./node_modules/.bin/tsc --noEmit --pretty false`: passed.
- Scoped ESLint on four application files and two test files: passed.
- Scoped `git diff --check`: passed.
- No Docker, DB creation, DB execution, live access, env-file edits, commits or deployment performed.

Parent execution:
1. Apply migration 00015 after the parent-owned 00014 to the disposable database.
2. Run `RUN_STRUCTURAL_QUALIFIERS_DB=1 BRACKET_SERIES_TEST_DATABASE=bracket_series_<suffix> ./node_modules/.bin/vitest run tests/events/structural-qualifiers-db.test.ts`.
3. The adapter rejects absent/nonmatching database names (including postgres). Uses existing `supabase_db_bracket-fyi` container only when explicitly enabled; all test fixtures roll back.

risk / integration gaps:
- SQL runtime remains unexecuted by this child as explicitly instructed; parent owns DB proof and repair.
- Exported service/schema are ready for a caller, but no browser route/control was added (outside owned files). Existing pairings route remains UCL/WWC; call the separate structural service for NCAA/NBA.
- Older synthetic NBA manifests with literal placeholder entrants deliberately fail SQL contract validation; create a new full synthetic fixture with the updated builder. No unchecked migration/backfill.
- Postlock correction freezes the scored structure and holds its scored markets. Resumption/disposition remains reviewed lifecycle work; no automatic unhold.
- Prelock corrections preserve historical eligible pools and original picks; current draft choices use actual initial-round orientations. Version-bound feasibility certificates are cleared rather than reused.

verdict: hold for parent SQL execution; pure application checks accept.

## Integration-owner follow-up

SQL was subsequently executed on dedicated owned databases. Parent integration fixed PL/pgSQL CASE parsing and adopted PT409 business conflicts, wired the actual event-room/POST controls, added real create/join/pick/lock/HTTP consumer tests, and made incompatible locked structure expose held with no stale leaderboard. Exact HTTP lost-response replay now captures source basis once in SQL rather than injecting a changed token on retry. See `phase-2-series-structural-integration.md` and `series-structural-evidence.json` for final results; earlier child checks above are historical, not final acceptance.
