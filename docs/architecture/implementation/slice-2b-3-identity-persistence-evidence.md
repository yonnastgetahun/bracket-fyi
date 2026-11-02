# Slice 2B.3 identity, evidence, and quarantine persistence

**Evidence classification:** local disposable Supabase plus synthetic TypeScript/RPC fixtures. No provider,
credential, hosted, deployment, notification-delivery, or production evidence.

## Delivered

- Observation evidence requires an existing ingestion run and a validated normalized snapshot envelope.
- Exact replay returns the original immutable observation.
- Same-revision/different-payload evidence is preserved in `provider_observation_conflicts`; the original
  observation is never mutated or silently discarded.
- Mapping transitions are atomic and protect reviewed/rejected states, canonical target scope, and the
  exclusion of result mappings.
- Quarantine opening is deterministic, candidate IDs are sorted and edition-validated, and resolved rows
  are not reopened by replay.
- New RPCs and conflict evidence are RLS-protected and executable only by `service_role`.

## Verification

| Command | Result |
|---|---|
| `npm test -- tests/ingestion/identity tests/ingestion/evidence tests/ingestion/quarantine` | 5 files, 15 tests passed |
| `SUPABASE_TELEMETRY_DISABLED=1 supabase test db supabase/tests/database/16_slice_2b_identity_persistence_test.sql` | 26/26 pgTAP assertions passed |
| `SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local --level warning` | no schema errors |
| `npx tsc --noEmit` | passed |
| `npm run lint` | passed; 0 errors, 10 pre-existing unrelated warnings |
| `git diff --check` | passed |

The local database was reset before the final focused test. All fixture values were synthetic.

## Migration and rollback

- Forward migration: `supabase/migrations/20261009000000_slice_2b_observation_evidence.sql`.
- Local rollback document: `supabase/rollbacks/20261009000000_slice_2b_observation_evidence_down.sql`.
- The rollback is appropriate before hosted data exists; preserved evidence must receive forward repair in
  any future hosted use.

The next sub-slice is atomic canonical structural projection.
