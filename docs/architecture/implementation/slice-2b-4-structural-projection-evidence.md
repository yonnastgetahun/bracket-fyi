# Slice 2B.4 canonical structural projection evidence

**Evidence classification:** disposable local Supabase plus synthetic TypeScript sports-structure fixtures.
No provider, credential, hosted, deployment, legacy, lifecycle, notification-delivery, or production
evidence.

## Delivered

- `project_structural_observation(uuid)` is a service-role-only atomic structural boundary.
- Root identity is required; edition-scoped event entries, stages, rounds, contests/entries, brackets,
  and edges can be created with atomic provider mappings after dependencies resolve.
- Structural provenance records the producing observation, timestamp, completeness, and semantic hash.
- Child-before-parent observations quarantine and replay after dependency arrival.
- Partial snapshots update present state without deleting unseen rows.
- Older structural timestamps quarantine; longer bracket cycles quarantine before any bracket row is written.
- Legacy/template/scoring/lifecycle tables are not touched.

## Verification

| Command | Result |
|---|---|
| `npm test -- tests/ingestion/projection/structural-projector.test.ts` | 1 file, 2 tests passed |
| `SUPABASE_TELEMETRY_DISABLED=1 supabase test db supabase/tests/database/17_slice_2b_structural_projection_test.sql` | 20/20 pgTAP assertions passed |
| `SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local --level warning` | no schema errors |
| `npx tsc --noEmit` | passed |
| `npm run lint` | passed; 0 errors, 10 pre-existing unrelated warnings |
| `git diff --check` | passed |

The local database was reset before final verification. All observations and structures were synthetic.

## Migration and rollback

- Forward migration: `supabase/migrations/20261009000001_slice_2b_structural_projection.sql`.
- Local rollback document: `supabase/rollbacks/20261009000001_slice_2b_structural_projection_down.sql`.
- Before hosted data, the down document can remove the projection boundary/state table. After any hosted
  canonical rows exist, use forward repair and preserve evidence and canonical history.

The next sub-slice is atomic result, audit, and operator-outbox projection.
