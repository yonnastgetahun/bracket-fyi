# Migration 00013 populated transition proof
project: BRACKET-FYI

done when:
- [x] Harness checkpoints commit distinct names for the same teams in same-template leagues.
- [x] Whole rename rows, template rows and legacy projections have assertions across two repair replays, including service-only ACL/RLS.
- [x] Static compilation/diff checks pass; historical targets remain gated; no database execution.

## Changed

- Added `supabase/tests/transitions/checkpoint-00013.sql`: eight committed names written as `service_role`, covering A/B in active/locked leagues for both bracket and pickem. Each template's complete league remains unrenamed. Replaying the fixture is checked for identical whole rows.
- Registered checkpoint 00013 in all three replay lanes (fresh, legacy, current). The existing no-fabricated-evidence assertion now also proves migration 00013 initially creates an empty names table.
- Whole-row retention now includes templates and template_matches plus optional league_competitor_names. This protects team registries, match identities, all saved names and the already-retained legacy picks/results/participants/leagues.
- Snapshot comparisons prove checkpoint writes touch only names, preserve the frozen legacy service-reader projection, and retain the six-league/twelve-pick score oracle.
- Added two isolated migration-00013 forward-repair replays with whole-row, legacy-reader, nonempty and exact tenant-name assertions. The existing two complete repair-chain replays also retain names and check their security contract after each repair.
- Security assertions cover RLS enabled, no policies, no PUBLIC table/column ACL, no anon/authenticated table or column privileges, and all four service_role DML privileges.
- Historical targets (including through 00012) never resolve the new table through the contract helper; retention probes it with to_regclass. Existing default target 00010 is unchanged.

## Static verification

- `py_compile.compile(..., doraise=True)`: PASS, using a temporary bytecode output outside the repository.
- `git diff --no-index --check /dev/null <file>` for both implementation files: PASS, no whitespace diagnostics. No-index exit 1 is expected for nonempty untracked files and was explicitly handled.
- Static AST assertions: PASS for the early historical-target return, checkpoint registration, and existence-guarded optional table retention.
- Read inspection of migration/repair 00013 and existing checkpoints/reader/retention/security checks completed.

## Handoff

changed: only the assigned Python harness, new checkpoint SQL, and this report.
matters: nonempty same-template tenant names can no longer escape preservation evidence merely because their table was omitted from snapshots.
checks: static checks above passed; no Docker, database, browser, migration execution, or publication performed.
risk: SQL/runtime acceptance remains unverified until the parent runs the transition harness with `--through 20261027000013`; historical runtime lanes were not executed here.
verdict: accept implementation for parent runtime verification.
