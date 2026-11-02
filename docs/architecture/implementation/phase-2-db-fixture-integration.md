# Phase 2 DB fixture integration

## BRACKET-PHASE2-DELIVERY bounded fixture criteria (before edits)
project: BRACKET-FYI
done when:
  - [x] DB17 reproduces 12/21 failures and DB20 reproduces 7/51 failures before fixture changes.
  - [x] Canonical fixtures and explicit reviewed mappings restore projection/order checks without source or migration changes.
  - [x] Both rollback-only suites pass; security admission and original legitimate assertions remain effective.
evidence: local disposable supabase_db_bracket-fyi pgTAP runs and scoped diff.

## Implementation and proof — 2026-10-27

Only DB17, DB20 and this report edited. Existing authorized BRACKET-PHASE2-DELIVERY; no migrations, source, history, commits, hosted/provider calls or resets.

- DB17 now provisions stage, round, contests and a bracket target plus explicit reviewed subject mappings. The stage mapping is intentionally absent for the first child attempt, then explicitly reviewed before replay. All original projection, ordering, partial-snapshot, ordinal conflict and no-partial-cycle-row expectations remain unchanged. Mapping-count wording now describes retained reviewed associations, not automatic creation.
- Cycle fixture has a reviewed provisioned target under `approved-bracket`, while the invalid payload requests `cycle`. The original zero-row assertion for `cycle` is preserved. Added assertions require `unsupported_shape` (not admission failure) and unchanged provisioned target. This exercises graph rejection before canonical writes; it does not authorize natural-key identity drift.
- DB20 provisions the new competitor's edition entry in `invited` state, explicitly reviews competitor and entry mappings, and supplies the missing `edition` alias consumed by lifecycle observations. Original scheduled/live/final and regression expectations are unchanged. The obsolete automatic-bootstrap expectation is strengthened to require retained `reviewed` authority. Added assertion proves actual `invited` → `confirmed` projection, not merely presence of a seeded row.

| Suite | Reproduced red | Final green |
| --- | --- | --- |
| DB17 | 12 failed / 21 | 23 passed / 23 |
| DB20 | 7 failed / 51 | 52 passed / 52 |

Executed each file through guarded Python subprocess stdin to `docker exec -i supabase_db_bracket-fyi psql -X -At -U postgres -d postgres -v ON_ERROR_STOP=1`; both contain BEGIN/ROLLBACK. TAP output inspected, not just psql status (pgTAP assertion failures can exit zero). Final exits both zero, every planned assertion `ok`, explicit ROLLBACK. Intermediate DB20 fixture used invalid status `pending`, causing a setup constraint error; corrected to supported `invited` before the recorded final green run. No setup error is counted as successful evidence.

Cleanup read: both synthetic provider IDs absent (count 0). Scoped `git diff --check` exit 0, no diagnostics. All shell work routed through `/Users/yonnasgetahun/clawd/bin/exec --` with absolute project paths.

changed: reviewed canonical fixture provisioning and three stronger projection/graph controls.
matters: restores legitimate projection/order regression coverage under reviewed-only admission without weakening security.
checks: red 12/21 and 7/51; green 23/23 and 52/52; rollback cleanup and diff check passed.
risk: bounded suites only; full database/security acceptance and operator provisioning workflow remain parent-owned.
verdict: accept bounded fixture integration; independent parent review remains separate.
