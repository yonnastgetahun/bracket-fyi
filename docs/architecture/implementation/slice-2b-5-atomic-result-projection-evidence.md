# Slice 2B.5 atomic result, audit, and outbox projection evidence

**Evidence classification:** disposable local Supabase plus synthetic TypeScript sports fixtures. No
provider, credential, hosted, deployment, notification-delivery, legacy, lifecycle, or production
evidence.

## Delivered

- `project_provider_result(uuid, text)` requires an existing immutable observation and derives provider,
  edition, contest, winner-entry, actor, version, audit classification, and outbox classification inside
  one service-role-only transaction.
- Result semantic keys are deterministic and caller-provided keys are verified rather than trusted.
- Exact replay and semantic replay return the prior verified result/audit/outbox IDs without new versions
  or intents.
- Older, equal, missing-provenance, illegal, and unapproved terminal transitions preserve quarantine
  evidence; approved attributable newer corrections append one result version.
- First accepted final results create one operator `result_final` intent. Accepted corrections create one
  operator `result_correction` intent and never an additional final intent. Unresolved corrections remain
  append-only result history; lifecycle reopening is deferred.
- An induced audit failure rolls back the result and outbox atomically. No legacy/template/scoring,
  lifecycle, push, or delivery tables are touched.
- The TypeScript result-key builder and SQL result-key helper share a canonical JSON vector, including
  UTC millisecond timestamp normalization; the replay database test verifies the vector through the
  untrusted caller-key check.

## Verification

| Command | Result |
|---|---|
| `npm test -- tests/ingestion/projection/result-projector.test.ts` | 1 file, 2 tests passed |
| `SUPABASE_TELEMETRY_DISABLED=1 supabase test db supabase/tests/database/18_slice_2b_atomic_result_projection_test.sql` | 39/39 pgTAP assertions passed |
| `npx tsc --noEmit` | passed |

The local database was reset before the focused database verification. All fixture values were synthetic.

## Migration and rollback

- Forward migration: `supabase/migrations/20261009000002_slice_2b_atomic_result_projection.sql`.
- Local rollback document: `supabase/rollbacks/20261009000002_slice_2b_atomic_result_projection_down.sql`.
- The rollback is appropriate before hosted data exists. After canonical result history exists, disable
  the binding/write path and use forward repair; do not delete immutable observations, results, audits,
  or outbox evidence.

The next sub-slice is synthetic sports and ceremony replay acceptance.
