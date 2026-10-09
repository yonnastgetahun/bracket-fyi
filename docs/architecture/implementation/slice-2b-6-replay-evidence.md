# Slice 2B.6 synthetic sports and ceremony replay evidence

**Evidence classification:** static/local synthetic TypeScript plus disposable local Supabase replay only.
No recorded-provider, live-provider, credential, hosted, deployment, notification-delivery, lifecycle,
legacy, beta, device, or production evidence.

## Delivered

- Synthetic provider-neutral `ProviderBatch` fixtures validate sports final/winner and ceremony
  awarded/winner observations through the Slice 2A schemas.
- Replay tests exercise shared normalization, reviewed/exact identity, result identity resolution,
  semantic result keys, exact semantic replay, missing/ambiguous/fuzzy quarantine, and separate result
  versus contest-lifecycle ordering.
- Disposable local replay covers sports and ceremony result projection, source observation provenance,
  exact replay, semantic duplicate replay, one audit per accepted result, one operator-only outbox intent,
  no duplicate audit or intent, edition scoping, no legacy template writes, and the SQL/TypeScript
  semantic-key conformance vector.
- All fixture values and payloads are synthetic; no provider name, URL, credential, or provider payload was
  used.

## Verification

| Command | Result |
|---|---|
| `npm test -- tests/ingestion/replay` | 2 files, 3 tests passed |
| `SUPABASE_TELEMETRY_DISABLED=1 supabase test db supabase/tests/database/19_slice_2b_replay_acceptance_test.sql` | 21/21 pgTAP assertions passed |

The local database replay was disposable and rolled back its synthetic rows. Earlier sub-slice database
tests provide the focused atomic rollback, correction, quarantine, structural child-before-parent, partial
snapshot, and cycle assertions.

## Evidence ceiling and next gate

This evidence proves only local deterministic contracts and synthetic replay. Recorded fixtures, real
provider adapters/calls, credentials, hosted migrations, delivery, lifecycle reconciliation, beta, device,
and production claims remain unverified and out of scope. Slice 2C scheduler/orchestrator work has not
started.
