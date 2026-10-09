# Slice 2B-R3 acceptance evidence

**Status:** Implemented and verified locally; Slice 2B remains pending independent acceptance review.

This is static/local and disposable-local synthetic evidence only. No provider calls, provider
documentation, credentials, hosted database, deployment, notification delivery, production data, beta,
device, or production action occurred. Slice 2C was not started.

## Remediation coverage

- Forward migration `20261009000005_slice_2b_r3_provenance_grants.sql` revokes all direct privileges on
  both structural provenance tables from `service_role`, then restores `SELECT` only. Projection remains
  available through the service-role RPC wrapper `project_structural_observation(uuid)` and its
  `SECURITY DEFINER` owner.
- Database test 22 asserts the complete privilege matrix for
  `canonical_structural_projection_state` and `canonical_structural_projection_scope`, direct
  `SET ROLE service_role` INSERT/UPDATE/DELETE/TRUNCATE denial, successful wrapper projection, scoped
  provenance update, and denial of unchecked, root, and quarantine helpers.
- The legacy state table remains untouched by the R2 projector; the edition-scoped scope table is the
  active ordering/provenance boundary. The test explicitly records that behavior rather than claiming
  a state-table provenance update.
- Migration 00004 received only a whitespace-only EOF correction. No prior migration behavior was
  rewritten. The 00005 rollback file is a forward-repair note and intentionally does not restore unsafe
  direct mutation privileges.

## Test-first evidence

The new database test was run against the pre-00005 local baseline and failed on the legacy state-table
direct INSERT/UPDATE/TRUNCATE privilege assertions and direct mutation attempts. After applying 00005,
the same synthetic test passed with 27 assertions. Existing R2 tests remained green.

## Verification ceiling

Evidence is static/local, synthetic TypeScript, and disposable-local database evidence only. Recorded-
provider, live-provider, hosted, deployment, notification-delivery, beta, device, and production
evidence remain unverified and out of scope. Slice 2B remains pending independent acceptance review.

Final command totals from the local working tree:

- `npm test -- tests/ingestion`: pass; 15 files / 127 tests.
- `npx tsc --noEmit`: pass.
- `npm test`: pass; 21 files / 149 tests.
- `npm run lint`: pass; 0 errors / 10 pre-existing warnings.
- `npm run build`: pass.
- `SUPABASE_TELEMETRY_DISABLED=1 supabase db reset --local`: pass; migrations through 00005 applied.
- `SUPABASE_TELEMETRY_DISABLED=1 supabase test db supabase/tests/database`: pass; 22 files / 357 assertions.
- `SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local --level warning`: pass; no schema errors.
- `git diff --check`: pass.
- `git diff --check f96a24df3784d0a117a5b3ecbf4e3ffcd2a10355...HEAD`: pass after the remediation commits.
- Direct transactional `SET ROLE service_role` privilege probe: pass; both provenance tables expose
  `SELECT` only, all four direct mutation privileges are denied, wrapper execution remains available,
  and unchecked/root/quarantine helper execution remains denied.

## Rollback and residual risk

Migration 00005 is forward-only. Its rollback note requires a reviewed replacement forward migration;
it does not reintroduce direct provenance mutation. The evidence ceiling does not include independent
acceptance review, recorded/live providers, hosted migration rehearsal, or production operation.
