# Slice 2B-R2 acceptance evidence

**Status:** Implemented and verified locally on 2026-10-08; Slice 2B remains pending independent
acceptance review.

This document records only static/local and disposable-local synthetic evidence. No provider calls,
provider documentation, credentials, hosted migration, deployment, notification delivery, production
data, beta, device, or production action occurred.

## Remediation coverage

- Service-role execution is limited to `project_structural_observation(uuid)` and
  `project_provider_result(uuid,text)`. Unchecked projectors, root projection, quarantine resolution,
  and direct structural provenance writes are denied; the SECURITY DEFINER wrappers retain ownership of
  private writes.
- Partial observations preserve omitted URL, short-name, country, date, seed, parent, required-field,
  and metadata values across roots and edition-scoped structures. Full observations retain replacement
  semantics. Invalid partial observations quarantine before canonical or provenance mutation.
- `normalized_snapshot_hash` is a generated stored column. The amended 00003 migration does not issue
  an UPDATE against immutable conflict evidence. Conflicts remain append-only and deterministic on
  identical replay; same raw payload with changed normalized evidence remains distinct evidence.
- Existing structural provenance is copied into edition-scoped provenance during 00004, and shared
  competitors can project independently in multiple editions.
- SQL lifecycle ordering quarantines final-to-live, final-to-scheduled, and equal-timestamp semantic
  changes. TypeScript classifies terminal-to-provisional before generic stale ordering for older,
  equal, and newer timestamps.
- Shadow and disabled bindings both return the intentionally shared typed `skipped_non_write` outcome;
  neither can mutate canonical, result, audit, or outbox state.
- The result and lifecycle acceptance vectors cover terminal-to-provisional parity. The JavaScript
  JSON-serialization vector uses the literal `1.2345678901234567e21` and verifies the actual emitted
  `1.2345678901234568e+21` value against SQL canonicalization.

## Test-first evidence

The TypeScript acceptance additions were run red first: the required JavaScript serialization assertion
failed because the expected representation did not match JavaScript's actual shortest-round-trip output.
The expectation was corrected to the actual serialized RPC value, then the focused ingestion suite
passed. The SQL acceptance test contains privilege, immutable-conflict, partial-merge, provenance,
non-write, lifecycle, and result-policy assertions; it passed with 64 assertions after the migration
and trigger fixes.

## Verification ceiling

Evidence is static/local, synthetic TypeScript, and disposable-local database evidence only. Recorded
provider, live-provider, hosted, deployment, notification-delivery, beta, device, and production
evidence remain unverified and out of scope. Slice 2C was not started.

Final command totals from the local working tree:

- `npm test -- tests/ingestion`: pass, 15 files / 124 tests.
- `npx tsc --noEmit`: pass.
- `npm test`: pass, 21 files / 146 tests.
- `npm run lint`: pass, 0 errors / 10 pre-existing warnings.
- `npm run build`: pass.
- `SUPABASE_TELEMETRY_DISABLED=1 supabase db reset --local`: pass; migrations through 00004 applied.
- `SUPABASE_TELEMETRY_DISABLED=1 supabase test db supabase/tests/database`: pass, 21 files / 328 assertions.
- `SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local --level warning`: pass, no schema errors.
- `git diff --check`: pass.
- Direct `SET ROLE service_role` probe: pass; wrapper execute `true,true`, private helper execute
  `false,false,false,false`, provenance `SELECT true`, mutation privileges `false,false,false,false`.
- Direct transactional plain-SQL partial probe: pass; projected outcome preserved the prior URL and
  merged old/new metadata, then rolled back.

No production schema was rewritten and the only amended migration is the pre-hosted local 00003
immutable-conflict repair.

## Forward repair and rollback

00004 is forward-only. Its rollback file documents restoration of reviewed prior function bodies and
reconciliation of edition-scoped provenance before removing R2 objects; it intentionally performs no
destructive automatic down migration. The generated conflict hash is retained because it is derived
immutably from the preserved normalized snapshot.
