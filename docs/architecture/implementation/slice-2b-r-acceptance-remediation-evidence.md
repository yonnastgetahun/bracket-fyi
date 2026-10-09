# Slice 2B-R acceptance-remediation evidence

**Status:** Implemented and verified locally on 2026-10-08.

This document records static/local and disposable-local synthetic evidence for the bounded Slice 2B-R
acceptance remediation. No provider, credential, hosted, deployment, notification-delivery, or
production-data action was performed.

## Scope delivered

- Binding mode gates preserve observation evidence while returning typed `skipped_shadow` outcomes for
  both shadow and disabled bindings; canonical, result, audit, and outbox writes require `write` mode.
- Same-revision conflict evidence is immutable, idempotent by original observation, payload hash, and
  normalized-snapshot hash, and preserves distinct normalized evidence for the same raw payload.
- Competitor mappings validate global competitors; event-entry projection remains edition-scoped and
  creates the edition entry after competitor resolution.
- Root structural updates are limited to approved mutable fields; edition-scoped structural provenance
  is keyed by edition, entity kind, and canonical ID.
- SQL lifecycle ordering matches the TypeScript policy for progression, regression, stale timestamps,
  and equal-timestamp semantic changes.
- TypeScript and SQL terminal-result correction policy requires a nonblank reason, attributable
  provenance, a newer trusted timestamp, and binding permission. Terminal-to-unresolved is accepted;
  terminal-to-provisional is quarantined.
- JavaScript and PostgreSQL canonical JSON share the numeric vector for ordinary values, `1e21`, `1e-7`,
  `0.000001`, `-0`, and safe-integer boundaries.
- Root dependency replay resolves earlier blocking quarantine rows with system provenance.
- Existing automatic identity candidates are labeled `automatic`; reviewed mappings remain authoritative.

## Test-first evidence

The acceptance test was added and run red before the remediation migration. The baseline failures were:

- shadow structural projection returned `quarantined` instead of a typed skip;
- identical conflict replay raised `55000: provider_observation_conflicts is append-only`;
- disabled result projection returned `projected`.

The corrected focused database suite passed with 124 assertions across database tests 17–20 before the
final revisionless and quarantine additions; the final complete database suite passed with 20 files and
261 assertions, including 48 assertions in test 20 and 21 assertions in test 17. The focused
TypeScript policy/idempotency/identity/projection tests passed with 5 test files and 29 tests. The
complete ingestion suite passed with 15 files and 122 tests; the complete application suite passed with
21 files and 144 tests.

Two independent local `psql` sessions concurrently replayed the same synthetic conflict. Both returned
the same conflict ID and the local conflict count remained one. The probe used only the disposable local
default PostgreSQL service connection and was reset afterward; no credential material was read or stored.

## Verification ceiling

Evidence is static/local, synthetic, and disposable-database only. Provider documentation, recorded
provider fixtures, live providers, credentials, hosted migrations, deployment, notification delivery,
beta, device, and production behavior remain unverified and out of scope. Slice 2C was not started.

Final verification results:

- `npm test -- tests/ingestion`: pass, 15 files / 122 tests.
- `npx tsc --noEmit`: pass.
- `npm test`: pass, 21 files / 144 tests.
- `npm run lint`: pass, 0 errors / 10 pre-existing warnings.
- `npm run build`: pass.
- `SUPABASE_TELEMETRY_DISABLED=1 supabase db reset --local`: pass.
- `SUPABASE_TELEMETRY_DISABLED=1 supabase test db supabase/tests/database`: pass, 20 files / 261 assertions.
- `SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local --level warning`: pass, no schema errors.
- `git diff --check`: pass.

## Forward-repair notes

The migration is forward-only. The matching rollback file documents restoration of the replaced
function bodies before removing remediation-only objects; it intentionally does not destructively drop
the authoritative service boundary.
