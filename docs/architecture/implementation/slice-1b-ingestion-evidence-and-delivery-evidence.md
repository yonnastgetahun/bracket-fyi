# Slice 1B: Ingestion Evidence and Delivery Schema

**Date:** 2026-10-08
**Status:** Implemented and verified locally; not deployed
**Evidence ceiling:** Disposable local Supabase database and static/local application verification

## Approval and scope

The product owner approved G1, including the subsequent ingestion, observation, canonical result, audit, outbox, and completion-hold tables, on 2026-10-06. The approval is recorded in [ADR 0002](../decisions/0002-tournament-ingestion-g1-schema-approval.md).

Included in this bounded slice:

- Provider-to-edition bindings and provider-to-canonical entity references.
- Claimed ingestion runs with concurrency, count, failure, retry, and rate-budget evidence.
- Immutable sanitized provider observations with database-generated semantic payload hashes.
- Explicit quarantine records and operator dispositions.
- Append-only, contiguous canonical result versions and corrections.
- Append-only result/lifecycle audit events with provider, organizer, operator, and system actors.
- Event-scoped league completion holds.
- Durable, deduplicated notification intents and per-endpoint attempt history.
- Server-only access defaults, rollback procedure, and disposable-database integration tests.

Excluded: provider adapters or calls, credentials, scheduler activation, normalization/projection code, legacy result projection, override metadata, lifecycle reconciliation, outbox delivery worker, remote migration, deployment, production data, push delivery, beta testing, and GitHub issue #3 implementation or closure.

## Delivered schema

The forward migration adds 10 operational tables:

1. `provider_bindings`
2. `provider_entity_refs`
3. `ingestion_runs`
4. `provider_observations`
5. `ingestion_quarantine`
6. `contest_results`
7. `result_audit_events`
8. `notification_outbox`
9. `notification_attempts`
10. `league_completion_holds`

### Binding and ingestion behavior

- Bindings default to `disabled`; activation requires an explicit `shadow` or `write` mode change.
- Configuration stores a credential reference, never credential material.
- One partial unique index permits only one active ingestion run per binding.
- Run claim keys are globally idempotent; terminal runs retain counts, cursor, HTTP, retry, and rate-limit evidence.
- Provider entity references reject canonical targets outside the binding's event edition.

### Evidence and quarantine behavior

- Observation payloads are explicitly named `sanitized_payload`.
- PostgreSQL derives a SHA-256 hash from canonical JSONB text, making key-order changes semantically stable.
- Provider revisions are the preferred identity when available; revisionless observations deduplicate by external identity and payload hash.
- Observations cannot be updated or deleted.
- Quarantine supports mapping, schema, partial-payload, ordering, terminal-conflict, staleness, provider, and unsupported-shape issues with explicit resolution fields.

### Result and audit behavior

- Canonical results are append-only versions, not mutable current rows.
- Versions must be contiguous and later versions must name the immediately prior version they supersede.
- Winner foreign keys require the winner to be an entry in the target contest.
- Result states represent provisional, final, awarded, canceled, void, and correction-driven unresolved outcomes.
- Audit events are append-only and use idempotency keys.
- Organizer actors store a 64-character token fingerprint, not the organizer token.

### Completion and notification behavior

- Completion holds must match the event edition linked to the league's template.
- Released and expired holds remain recorded; active hold keys are unique per league.
- Outbox intent keys prevent duplicate notification intents.
- Audience constraints prevent cross-edition leagues and cross-league participants.
- Delivery attempts store endpoint fingerprints rather than push endpoint URLs and retain transient, terminal, skipped, and pruned outcomes.

## Test-driven verification

The slice was built through public database behavior in vertical red-green groups:

| Tracer | Initial failure | Passing behavior |
|---|---|---|
| Provider binding | Table absent | Disabled-by-default configuration and credential references |
| Ingestion run | Table absent | Unique claims, one active run, terminal evidence |
| Provider entity reference | Table absent | Reviewed resolution and same-edition canonical targets |
| Provider observation | Table absent | Generated hashes, revision/hash deduplication, immutability |
| Quarantine | Table absent | Unique issues and explicit operator disposition |
| Canonical result | Table absent | Idempotent contiguous versions, valid winners, immutable correction history |
| Audit event | Table absent | Actor attribution, idempotency, append-only history |
| Completion hold | Table absent | Edition isolation, active uniqueness, release history |
| Notification outbox | Table absent | Audited and deduplicated intents with audience isolation |
| Notification attempt | Table absent | Fingerprinted endpoint attempts, retries, and retained outcomes |

## Verification results

| Check | Result | Evidence level |
|---|---|---|
| Fresh `supabase db reset --local` | Pass: all seven forward migrations replayed | Local database |
| Database pgTAP suite | Pass: 12 files, 88 assertions | Local database integration |
| `supabase db lint --local --level warning` | Pass: no schema errors | Local database static analysis |
| Rollback rehearsal | Pass: all 10 Slice 1B tables removed; 13 Slice 1A tables and legacy `templates` remained | Disposable local database |
| Forward restore after rollback | Pass: complete migration history replayed and the full database suite passed again | Disposable local database |
| Migration ledger | Pass: versions `20260724000001` through `20261006000002` present exactly once | Local database |
| `npm test` | Pass: 6 files, 22 tests | Static/local with mocked application database boundary |
| `npx tsc --noEmit` | Pass | Static/local |
| `npm run lint` | Pass: 0 errors; 10 pre-existing warnings | Static/local |
| `npm run build` | Pass: Next.js 16.3.8 webpack production build | Static/local |
| `git diff --check` | Pass | Static/local |

One forward-restore attempt stalled while Docker Desktop's local API returned HTTP 500. The exact hung local processes were terminated, Docker Desktop was cleanly restarted, and the same reset completed successfully in 17 seconds. The subsequent migration replay, lint, and full database suite passed; no SQL migration error was observed.

## Security and access review

- All 10 Slice 1B tables have RLS enabled.
- No policies expose these tables to browser roles.
- All direct table privileges are revoked from both `anon` and `authenticated`.
- `service_role` receives explicit read/insert access to all 10 tables and update access only to the seven mutable operational tables.
- `service_role` has no update grant on immutable observations, canonical result versions, or audit events; database triggers also reject their mutation.
- An explicit anonymous ingestion write is denied.
- No column is named or intended to hold API keys, passwords, access/refresh tokens, private keys, or provider secrets.
- Provider configuration stores only `credential_ref`; notification attempts store only `endpoint_fingerprint`.
- The migration introduces no `security definer` function.

## Rollback and forward repair

Before any hosted deployment, normal rollback is a git revert. The operator rollback at `supabase/rollbacks/20261006000002_ingestion_evidence_and_delivery_down.sql` was executed successfully against a disposable local database.

After observations, result versions, audit events, or delivery evidence exist in a hosted environment, the down migration is destructive and must not be the default recovery path. Disable bindings/workers and prefer a corrective forward migration that preserves evidence.

## Evidence boundaries and residual risks

1. No provider adapter, scheduler, projection transaction, or outbox worker exists yet; this slice provides their persistence contracts only.
2. Idempotency uniqueness is enforced, but provider-neutral key construction and replay-return behavior remain M2 implementation work.
3. Provider timestamp ordering, illegal status regressions, partial-snapshot handling, and stale recovery remain validation/projection logic; the quarantine schema is ready but does not make those decisions itself.
4. Result/audit/outbox tables support one transaction, but no database function or application service yet guarantees atomic projection plus audit plus intent creation.
5. Completion-hold and outbox state changes are constrained but must be paired with audit events by the later orchestration service.
6. Canonical results are not projected into `template_results`, and no league-parameterized effective-result resolver exists yet.
7. Organizer override metadata and backfill remain Slice 1C.
8. No representative production-volume query-plan measurements have been performed.
9. Generated database types are not currently part of this repository.
10. No remote migration, provider call, notification delivery, beta/device test, deployment, or production acceptance has occurred.
