# Slice 2C Execution Packet: Orchestrator and Run Ledger

**Prepared:** 2026-10-08

**Status:** Planning packet drafted; awaiting architecture approval; implementation not started.

**Baseline:** `b5c4ce3b17033e49e247ec836bd679c249c6707e` (`chore: normalize slice 2b-r3 migration EOF`)

**Authorization:** This document authorizes planning only. It authorizes no application code, migration,
database reset, provider call, credential access, deployment, hosted change, notification delivery, or
production action. Slice 2C implementation requires explicit architecture approval after review of this
packet. Provider, recorded-fixture, sandbox, beta, device, and production gates remain later approvals.

**Evidence ceiling for the planned local work:** Pure TypeScript policy evidence, deterministic synthetic
adapter tests, and disposable-local Supabase integration only. Recorded-provider and live-provider evidence
are prohibited until the later provider gate.

## 1. Objective and operating rules

Slice 2C will claim due provider bindings, execute the existing provider-neutral adapter seam, persist
sanitized observations, invoke the accepted Slice 2B evidence and projection boundaries, and maintain a
durable run ledger. It will not implement a real provider, schedule a hosted job, deliver notifications,
reconcile lifecycle completion, project legacy scoring tables, or close GitHub issue #3.

The implementation must follow these rules:

- One run is owned by one lease token at a time. A crashed or expired worker cannot renew or finish it.
- At-least-once delivery is intentional. Repeated pages and runs rely on Slice 2B observation and projection
  idempotency; the orchestrator never claims exactly-once provider delivery.
- A cursor or validator advances only after the current page's evidence and every normalized observation
  have a durable terminal disposition in the same local transaction boundary.
- Disabled bindings do not fetch or project. Shadow bindings may fetch and retain sanitized evidence but
  never mutate canonical/result/audit/outbox state. Write bindings may project through the accepted
  service-role wrappers.
- Provider failures are classified into the accepted Slice 2A failure taxonomy. Raw responses, headers,
  credentials, and unsanitized error causes never enter runs, observations, logs, or fixtures.
- Every database change is a new forward migration with a matching non-destructive rollback/forward-repair
  note. Applied migrations are never rewritten.
- The orchestrator is provider-neutral: adapter keys select an implementation through a registry, never a
  provider-specific branch in orchestration or projection code.

## 2. Authority and current-state inventory

### 2.1 Accepted preceding contracts

Slice 2A is accepted at the local/synthetic evidence level. Its authoritative public surface is:

- `lib/ingestion/contracts.ts`: strict JSON, normalized entity, observation, and `ProviderBatch` schemas.
  An empty observation array is valid for an unchanged page. `MappableProviderEntityKind` excludes
  `result` from provider mappings.
- `lib/ingestion/config.ts`: strict event configuration, polling minima, stale threshold, binding config,
  and credential reference validation. It does not contain retry execution or provider budgets.
- `lib/ingestion/errors.ts`: sanitized `ProviderFailure` codes and retry strategies:
  `authentication`, `authorization`, `not_found`, `rate_limited`, `timeout`, `network`,
  `provider_server`, `invalid_response`, `unsupported_shape`, and `permanent`.
- `lib/ingestion/providers/provider-adapter.ts`: `ProviderAdapter`, `ProviderPullRequest`, `PullContext`,
  and non-serializable `ProviderCredential`. Raw provider page types remain adapter-private.

Slice 2B is accepted at the local/synthetic evidence level. Its authoritative boundaries are:

- `record_provider_observation(...)`: immutable sanitized observation and normalized-snapshot evidence,
  including exact replay and preserved revision conflicts.
- `project_structural_observation(uuid)`: service-role-only structural wrapper; non-write bindings are
  skipped and the edition-scoped provenance table is authoritative.
- `project_provider_result(uuid,text)`: service-role-only result/audit/outbox wrapper; its caller key is
  untrusted and SQL derives binding, edition, actor, version, correction, and intent values.
- Pure identity, ordering, canonical JSON, and deterministic key policies under `lib/ingestion/identity/**`,
  `lib/ingestion/ordering/**`, and `lib/ingestion/idempotency/**`.

The Slice 2B evidence ceiling is static/local, synthetic TypeScript, and disposable-local database
evidence. It does not authorize Slice 2C implementation or provider access.

### 2.2 Existing binding and run ledger tables

The applied `supabase/migrations/20261006000002_ingestion_evidence_and_delivery.sql` currently provides:

| Object | Existing behavior Slice 2C must use | Missing for Slice 2C |
|---|---|---|
| `provider_bindings` | Provider/edition FKs; unique `(provider_id,event_edition_id,binding_key)` and `(id,provider_id,event_edition_id)`; modes `disabled`, `shadow`, `write`; roles `primary`, `fallback`, `shadow`; health `disabled`, `healthy`, `degraded`, `stale`; `credential_ref`; JSON `adapter_config`, `poll_policy`, and `provider_cursor`; `stale_after_seconds >= 60`; `next_poll_at`; attempt/success/data timestamps; failure count; config version; due and provider indexes; RLS with service-role operational access. | Atomic claim ownership, lease token, explicit ETag/Last-Modified storage, provider-wide budget state, and health transition RPC. |
| `ingestion_runs` | Binding/provider/edition composite FK; globally unique nonblank `claim_key`; trigger kinds `schedule`, `manual`, `retry`, `replay`; statuses `claimed`, `running`, `succeeded`, `partial`, `failed`, `rate_limited`, `canceled`; lease and finish checks; JSON cursors/metadata; rate headers; error fields; nonnegative counters; one active run per binding partial unique index; binding/status indexes. | Claim/renew/finish/reclaim functions, lease ownership, page checkpoint atomicity, shadow skip accounting, and authoritative health updates. |
| `provider_observations` | Immutable sanitized evidence with generated payload hash, provider revision/timestamp, run/binding/provider/edition composite FK, and immutable trigger. | Orchestrator caller and page checkpoint integration; no new raw payload field is permitted. |
| `ingestion_quarantine` | Unique `(observation_id, issue_code)`; open/resolved/ignored status; sanitized details; service-role-only operational access. | Run-level provider failure disposition is still recorded in `ingestion_runs`; item-level quarantine is delegated to Slice 2B. |
| `data_providers` | Unique adapter key and enabled flag. | No provider is enabled by this packet; no provider adapter is created. |

The existing service-role grants allow operational table writes, but they do not provide a safe claim
transaction. Slice 2C must not add direct browser grants. New RPCs are `SECURITY DEFINER`, use a fixed safe
search path and schema-qualified objects, revoke `PUBLIC`, `anon`, and `authenticated`, and grant only
`service_role`.

### 2.3 Existing operational boundaries and gaps

Existing RLS is enabled on the ingestion tables with no public policies. Existing database constraints must
remain the final defense for provider/edition relationships, run lifecycle, rate-header bounds, and
immutable evidence. No scheduler, orchestrator, retry loop, rate-budget table, claim RPC, lease RPC, page
checkpoint RPC, or health transition function exists. No provider adapter is approved or implemented.

The current `ProviderBatch` already carries `nextCursor`, `etag`, `providerRequestId`, and rate-limit
metadata. Slice 2C will persist the cursor and validator through new server-only boundaries; it will not
put them in raw payloads or alter the accepted provider-neutral meaning of an empty unchanged batch.

## 3. Bounded implementation sequence

The sequence below is six independently reviewable sub-slices. The allowlists are plans, not authorization
to create or modify the files. Each sub-slice requires the approval gate stated at its end; no provider or
hosted gate is implied by a local gate.

### 2C.1 — Pure due, budget, retry, and failure policies

**Objective:** Define deterministic scheduling, provider-budget, retry, backoff, jitter, and failure
classification decisions before persistence or adapter execution.

**Exact allowlist:**

- `lib/ingestion/orchestrator/types.ts`
- `lib/ingestion/orchestrator/policy.ts`
- `lib/ingestion/rate-limit/policy.ts`
- `lib/ingestion/retry/policy.ts`
- `lib/ingestion/orchestrator/failure-policy.ts`
- `tests/ingestion/orchestrator/policy.test.ts`
- `tests/ingestion/rate-limit/policy.test.ts`
- `tests/ingestion/retry/policy.test.ts`
- `tests/ingestion/orchestrator/failure-policy.test.ts`
- `docs/architecture/implementation/slice-2c-1-policy-evidence.md`

No migration, adapter, credential resolver, or database repository may change in this sub-slice.

**Public interfaces:**

```ts
export interface Clock {
  now(): Date;
}

export type PollPhase = "distant" | "pregame" | "live" | "postgame" | "complete";

export type DueBindingInput = Readonly<{
  mode: "disabled" | "shadow" | "write";
  nextPollAt?: string;
  phase: PollPhase;
  idleSeconds: number;
  pregameSeconds: number;
  liveSeconds: number;
  postgameSeconds: number;
}>;

export function isBindingDue(input: DueBindingInput, now: string): boolean;
export function nextPollAt(input: DueBindingInput, now: string): string | null;

export type RateBudgetDecision = Readonly<{
  allowed: boolean;
  cost: number;
  retryAt?: string;
  reason: "available" | "exhausted" | "unknown_budget" | "invalid_budget";
}>;

export function decideRateBudget(input: Readonly<{
  limit?: number;
  remaining?: number;
  resetAt?: string;
  now: string;
  cost?: number;
}>): RateBudgetDecision;

export type RetryDecision = Readonly<{
  retry: boolean;
  retryIndex: number;
  retryAt?: string;
  delaySeconds?: number;
  reason: "retryable" | "provider_reset" | "max_retries" | "terminal";
}>;

export function decideRetry(input: Readonly<{
  failure: ProviderFailure;
  retryIndex: number;
  now: string;
  claimKey: string;
  retryAfterAt?: string;
}>): RetryDecision;
```

**Decisions and invariants:**

- `disabled` is never due. `shadow` and `write` are due by the same phase schedule; mode controls only
  projection after evidence is retained.
- `complete` returns no next poll. Other phases use `idleSeconds`, `pregameSeconds`, `liveSeconds`, or
  `postgameSeconds` exactly; `nextPollAt` is never earlier than `now`.
- A provider-wide budget is required before a provider call. Unknown or invalid budget is fail-closed as
  `unknown_budget` or `invalid_budget`; it creates a recorded rate-limited run outcome and makes no call.
  Cost is one request unless a later adapter packet explicitly defines a different cost.
- `maxRetries = 3` means three retries after the initial attempt, four total attempts. Retryable failures
  are `timeout`, `network`, and `provider_server`; `rate_limited` uses `provider_reset`; all other Slice 2A
  codes are terminal. `Retry-After` is honored; when both it and a provider reset are present, the later
  safe time wins.
- Backoff is `min(900, 30 * 2^retryIndex)` seconds with deterministic full jitter in `[0, delay]`. Jitter
  is derived from `SHA-256("slice-2c-jitter-v1" + claimKey + ":" + retryIndex)` and is not random state.
- Every policy accepts an injected `Clock`; tests never use wall-clock sleeps. Manual replay does not reset
  retry history unless it creates a new operator request key.

**TDD sequence and focused matrix:** due/not-due boundary; all phases; disabled/shadow/write; valid,
exhausted, missing, and invalid budgets; 429 with and without `Retry-After`; timeout/network/5xx retries;
401/403/404/invalid-response/permanent terminal failures; maximum retry count; deterministic jitter across
processes; clock boundary and timezone-independent ISO output.

**Verification:**

```sh
npm test -- tests/ingestion/orchestrator/policy.test.ts tests/ingestion/rate-limit/policy.test.ts tests/ingestion/retry/policy.test.ts tests/ingestion/orchestrator/failure-policy.test.ts
npx tsc --noEmit
npm run lint
git diff --check
```

**Evidence ceiling:** Pure TypeScript, synthetic failure objects, and injected-clock local evidence only.
No provider, database, credential, or network evidence.

**Rollback/forward repair:** Revert the sub-slice before persistence exists. No migration or data repair is
needed.

**Stop conditions:** a policy uses wall-clock global state, random jitter, provider-revision ordering,
unknown budget fail-open behavior, a disabled binding fetches, a retryable failure is silently terminal, or
the implementation requires provider-specific branching.

**Next approval gate:** Architecture approval of policy evidence and constants before any run-ledger or
orchestrator implementation.

### 2C.2 — Atomic claim, lease, renewal, expiry, and run completion

**Objective:** Add the smallest service-role-only database boundary that makes one active run and lease
ownership authoritative under concurrency and crash recovery.

**Exact allowlist:**

- `supabase/migrations/20261010000000_slice_2c_run_ledger.sql`
- `supabase/rollbacks/20261010000000_slice_2c_run_ledger_down.sql`
- `supabase/tests/database/23_slice_2c_run_ledger_test.sql`
- `lib/ingestion/orchestrator/run-ledger-repository.ts`
- `tests/ingestion/orchestrator/run-ledger-repository.test.ts`
- `docs/architecture/implementation/slice-2c-2-run-ledger-evidence.md`

No provider adapter, scheduler, UI, legacy result table, or hosted migration may change.

**Required forward schema changes:**

- Add `provider_bindings.provider_etag text` with a nonblank-if-present check.
- Add `ingestion_runs.lease_token text`, `ingestion_runs.skipped_count integer not null default 0`, and
  nonnegative checks. The lease token is an opaque server-generated ownership value, not provider or user
  credential material.
- Add an index supporting due binding order `(next_poll_at, id)` for non-disabled bindings if the existing
  partial due index is insufficient; prove the query plan before adding a duplicate index.
- Preserve all existing columns, constraints, RLS, and grants. No applied migration is rewritten.

**Exact SQL function signatures:**

```sql
claim_due_ingestion_run(
  p_now timestamptz,
  p_worker_id text,
  p_lease_seconds integer
) returns table (
  run_id uuid,
  binding_id uuid,
  claim_key text,
  lease_token text,
  provider_id uuid,
  event_edition_id uuid,
  adapter_key text,
  binding_key text,
  mode text,
  credential_ref text,
  adapter_config_version integer,
  adapter_config jsonb,
  poll_policy jsonb,
  provider_cursor jsonb,
  provider_etag text,
  lease_expires_at timestamptz
)

claim_manual_ingestion_run(
  p_binding_id uuid,
  p_request_key text,
  p_worker_id text,
  p_now timestamptz,
  p_lease_seconds integer
) returns same row shape as claim_due_ingestion_run

renew_ingestion_run(
  p_run_id uuid,
  p_lease_token text,
  p_now timestamptz,
  p_lease_seconds integer
) returns table (run_id uuid, lease_expires_at timestamptz)

reclaim_expired_ingestion_runs(
  p_now timestamptz,
  p_reason text
) returns table (run_id uuid, binding_id uuid, reclaimed_at timestamptz)

commit_ingestion_page(
  p_run_id uuid,
  p_lease_token text,
  p_advance_checkpoint boolean,
  p_cursor_after jsonb,
  p_provider_etag text,
  p_fetched_delta integer,
  p_normalized_delta integer,
  p_projected_delta integer,
  p_unchanged_delta integer,
  p_quarantined_delta integer,
  p_skipped_delta integer,
  p_failed_delta integer
) returns table (run_id uuid, cursor_after jsonb, provider_etag text)

finish_ingestion_run(
  p_run_id uuid,
  p_lease_token text,
  p_outcome text,
  p_finished_at timestamptz,
  p_next_poll_at timestamptz,
  p_data_changed boolean,
  p_failure_code text,
  p_error_message text,
  p_metadata jsonb
) returns table (run_id uuid, status text, health_status text, next_poll_at timestamptz)
```

The signatures above are exact design contracts. Return types may add no security-sensitive values. Every
function is `SECURITY DEFINER`, fixes `search_path = public, pg_temp`, qualifies all objects, revokes
execution from `PUBLIC`, `anon`, and `authenticated`, and grants only `service_role`. Internal helper
functions are not granted directly.

**Claim and lease semantics:**

- A scheduled claim selects one eligible non-disabled binding with `next_poll_at` null or not later than
  `p_now`, ordered by `(next_poll_at nulls first, id)`, using `FOR UPDATE SKIP LOCKED`.
- Before claiming, the transaction reclaims expired `claimed`/`running` runs in deterministic `run_id`
  order: set them to `failed`, `finished_at = p_now`, `error_class = lease_expired`, preserve all evidence,
  and never advance their cursor. A later claim may then create a new run.
- A scheduled claim key is derived inside SQL as
  `v1:schedule:<binding_uuid>:<due_epoch_seconds>`. A manual/replay request key is normalized and scoped as
  `v1:manual:<binding_uuid>:<request_key>`. Callers cannot choose another binding's claim key.
- Exact claim-key replay returns the existing run and its prior terminal/active outcome. An active run owned
  by another lease is not stolen. A manual claim against `disabled` is rejected; replay of stored evidence
  remains a separate Slice 2B operation.
- `lease_token` is generated by SQL and returned only to the server-side worker. Renewal requires the exact
  token, an active status, and an unexpired lease. A lost or expired lease cannot be renewed or finished.
- `commit_ingestion_page` requires the lease token and updates the run counters, run checkpoint, and binding
  cursor/ETag atomically. `p_advance_checkpoint = false` leaves both cursor and ETag unchanged.
- `finish_ingestion_run` is idempotent for the same run and verified lease token. It returns the existing
  terminal outcome on replay and never reopens a finished run. Unexpected SQL errors roll back the run,
  checkpoint, binding, and health mutation together.

**TDD/database matrix:** two concurrent due claims yield one run; exact claim replay; manual key scoped to
one binding; lease renewal before/after expiry; worker crash and deterministic reclamation; old worker cannot
finish after reclamation; disabled binding not claimed; shadow and write bindings claimed; invalid lease
duration/worker/key rejected; page checkpoint and counter atomicity; rollback on invalid page update; finish
replay returns prior outcome; one-active-run unique constraint remains effective; anonymous/authenticated and
direct helper execution denied.

**Verification:** `npm test -- tests/ingestion/orchestrator/run-ledger-repository.test.ts`; `npx tsc --noEmit`;
`npm run lint`; `SUPABASE_TELEMETRY_DISABLED=1 supabase db reset --local`; `SUPABASE_TELEMETRY_DISABLED=1 supabase test db supabase/tests/database/23_slice_2c_run_ledger_test.sql`;
`SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local --level warning`; `git diff --check`.

**Evidence ceiling:** Synthetic local database concurrency and TypeScript repository evidence only. No
provider or hosted lease evidence.

**Rollback/forward repair:** Before hosted data, the down note may remove only the new functions/indexes and
nullable columns after stopping local workers. After hosted runs exist, disable claims, preserve completed
runs and observations, and use a forward repair; never delete or rewrite run history.

**Stop conditions:** a claim relies on an application pre-read, two active runs can exist, an expired worker
can finish, a caller can inject a lease token or binding identity, cursor state advances without a page
commit, a helper is directly executable, or rollback requires deleting evidence.

**Next approval gate:** accept run-ledger concurrency and grant evidence before implementing the orchestrator.

### 2C.3 — Provider-neutral orchestration and mode enforcement

**Objective:** Execute one claimed run through the existing `ProviderAdapter` interface, credential resolver,
evidence boundary, and accepted Slice 2B projection wrappers without provider-specific orchestration logic.

**Exact allowlist:**

- `lib/ingestion/orchestrator/orchestrator.ts`
- `lib/ingestion/orchestrator/ports.ts`
- `lib/ingestion/orchestrator/observation-dispatch.ts`
- `tests/ingestion/orchestrator/orchestrator.test.ts`
- `tests/ingestion/orchestrator/observation-dispatch.test.ts`
- `docs/architecture/implementation/slice-2c-3-orchestration-evidence.md`

**Public interfaces:**

```ts
export interface CredentialResolver {
  resolve(reference: string): Promise<ProviderCredential>;
}

export interface AdapterRegistry {
  get(providerKey: string): ProviderAdapter;
}

export interface IngestionOrchestrator {
  execute(run: ClaimedIngestionRun): Promise<RunExecutionOutcome>;
}

export type RunExecutionOutcome = Readonly<{
  runId: string;
  status: "succeeded" | "partial" | "failed" | "rate_limited" | "canceled";
  fetchedCount: number;
  normalizedCount: number;
  projectedCount: number;
  unchangedCount: number;
  quarantinedCount: number;
  skippedCount: number;
  failedCount: number;
}>;
```

`ports.ts` owns server-only repository seams for the 2C run ledger, observation evidence, structural
projector, result projector, rate budget, and clock. No port accepts a provider raw page or credential
value in a serializable command.

**Execution behavior:**

1. Receive a verified claimed run; if its mode is disabled, finish canceled without a provider call.
2. Reserve one provider-wide budget unit through the repository. If unavailable, finish `rate_limited`
   with no adapter call and the policy-derived retry time.
3. Resolve the adapter by `providerKey`, build the Slice 2A `ProviderPullRequest`, resolve the credential
   reference through the server-only `CredentialResolver`, and call `pull`.
4. For each normalized observation, call `record_provider_observation` before any identity or projection.
   Exact replay and revision conflict outcomes remain counted and are not treated as transport failures.
5. In `shadow`, retain evidence and count the accepted observation as `skipped`; do not call a canonical
   projector. In `write`, dispatch structural kinds to `project_structural_observation` and results to
   `project_provider_result`; non-write outcomes cannot mutate canonical/result/audit/outbox state.
6. Commit the page checkpoint only after every observation has a terminal evidence/projection/quarantine/
   skipped outcome. Finish the run through the lease RPC.
7. Classify adapter errors through `classifyError`, apply the injected-clock retry policy, and persist only
   sanitized failure code/message/details. Retry within the same lease until the policy limit; then finish
   with the terminal run outcome.

**Invariants:** no provider conditional in orchestration; no call for disabled or budget-exhausted binding;
shadow has evidence but zero canonical/result/audit/outbox mutations; write uses only accepted RPCs; one
observation is never counted twice; credentials never enter run JSON; a failed pull does not advance cursor;
manual result replay remains outside this fetch path.

**TDD sequence and focused matrix:** fake registry with structurally different sports and ceremony adapters;
credential reference resolution without serializing value; disabled/shadow/write; budget denial; exact
observation replay; structural/result dispatch; adapter error classification; retryable and terminal errors;
sanitized run error; lease loss; no provider-name conditional; no canonical writes in shadow; rollback when a
later observation fails.

**Verification:** `npm test -- tests/ingestion/orchestrator/orchestrator.test.ts tests/ingestion/orchestrator/observation-dispatch.test.ts`;
`npx tsc --noEmit`; `npm run lint`; `git diff --check`. Database behavior remains proven by sub-slice 2C.2
and the final synthetic acceptance lane.

**Evidence ceiling:** Local synthetic TypeScript with in-test adapters and mocked repositories. No network,
provider, credential, or hosted evidence.

**Rollback/forward repair:** Revert the orchestrator commit while bindings remain disabled. Existing
observations and run rows remain immutable evidence; any later hosted defect is repaired through binding
disablement and a forward migration.

**Stop conditions:** provider HTTP/client code appears; a credential value is serialized; shadow calls a
projector; an adapter error bypasses the Slice 2A classifier; an observation is projected before evidence;
or an orchestrator branch names a provider.

**Next approval gate:** accept provider-neutral orchestration and mode evidence before pagination/checkpoint
implementation.

### 2C.4 — Cursor, validator, pagination, partial-batch, and checkpoint policy

**Objective:** Make page progression restartable and bounded without losing observations, skipping pages, or
advancing past unprocessed data.

**Exact allowlist:**

- `lib/ingestion/orchestrator/pagination.ts`
- `lib/ingestion/orchestrator/checkpoint.ts`
- `tests/ingestion/orchestrator/pagination.test.ts`
- `tests/ingestion/orchestrator/checkpoint.test.ts`
- `docs/architecture/implementation/slice-2c-4-checkpoint-evidence.md`

The sub-slice uses the `commit_ingestion_page(...)` boundary from 2C.2 and adds no migration unless a test
proves the existing boundary cannot preserve the required state. Any required migration must be a new
forward migration and stop for review before implementation.

**Public interfaces:**

```ts
export type CheckpointDecision = Readonly<{
  advance: boolean;
  cursorAfter?: JsonObject;
  etag?: string;
  reason: "page_consumed" | "not_modified" | "partial_page" | "retryable_failure" | "invalid_page" | "repeated_cursor";
}>;

export function decideCheckpoint(input: Readonly<{
  currentCursor?: JsonObject;
  currentEtag?: string;
  nextCursor?: JsonObject;
  responseEtag?: string;
  observationsTerminal: boolean;
  transportSucceeded: boolean;
  pageWasNotModified: boolean;
  repeatedCursor: boolean;
}>): CheckpointDecision;

export const MAX_PAGES_PER_RUN = 25;
```

**Checkpoint decisions:**

- A successful page advances `cursor_after` only when transport succeeded, the page cursor is valid, every
  normalized observation has a terminal disposition, and the next cursor is not a previously seen cursor.
- An empty `ProviderBatch` is a successful unchanged/no-data page. Persist a returned ETag/Last-Modified
  validator, retain the cursor, update `last_success_at`, and do not update `last_data_at`.
- A valid partial batch may advance after every emitted observation is projected, quarantined, unchanged, or
  skipped. It never deletes unseen entities. A transport/normalization failure before a complete page holds
  the prior cursor and retries the page.
- A repeated cursor is `invalid_response`, quarantines the run-level failure, does not advance, and stops the
  run. A run processes at most 25 pages; a valid next cursor at the cap finishes `partial` after committing
  the last safe checkpoint and schedules immediate continuation.
- ETags are sent on the next request and stored separately from the JSON cursor. A validator change does not
  itself project data; observations and Slice 2B ordering decide projection.
- Cursor and ETag writes occur in the same transaction as the page disposition counters. A crash before the
  commit repeats the page safely; a crash after commit resumes from the committed checkpoint.

**TDD sequence and focused matrix:** first page/no cursor; multi-page progression; ETag unchanged page;
Last-Modified equivalent; empty unchanged page; partial observations with quarantine; transient failure
before checkpoint; repeated cursor; max-page cap; crash before/after commit; exact page replay; cursor JSON
validation and stable repeated-cursor hash; no deletion from absent objects.

**Verification:** `npm test -- tests/ingestion/orchestrator/pagination.test.ts tests/ingestion/orchestrator/checkpoint.test.ts`;
`npx tsc --noEmit`; `npm run lint`; `git diff --check`.

**Evidence ceiling:** Pure local checkpoint tests with synthetic cursors, validators, and batches only.

**Rollback/forward repair:** Revert before hosted cursor writes. After hosted use, stop the binding, retain
the last safe cursor and observations, and forward-repair the checkpoint boundary; never manually skip a
provider page by deleting evidence.

**Stop conditions:** cursor advances before projection/evidence disposition; ETag is put in raw payload;
partial data deletes unseen state; a repeated cursor loops; max pages is unbounded; or a checkpoint cannot
be replayed idempotently.

**Next approval gate:** accept checkpoint/replay evidence before operational accounting and provider-budget
persistence.

### 2C.5 — Run accounting, provider budget, health, and staleness

**Objective:** Make request budgets, run counts, sanitized failure persistence, and binding health transitions
authoritative and observable without adding a scheduler or notification worker.

**Exact allowlist:**

- `lib/ingestion/orchestrator/accounting.ts`
- `lib/ingestion/orchestrator/health.ts`
- `lib/ingestion/rate-limit/repository.ts`
- `tests/ingestion/orchestrator/accounting.test.ts`
- `tests/ingestion/orchestrator/health.test.ts`
- `tests/ingestion/rate-limit/repository.test.ts`
- `supabase/migrations/20261010000001_slice_2c_rate_budget.sql`
- `supabase/rollbacks/20261010000001_slice_2c_rate_budget_down.sql`
- `supabase/tests/database/24_slice_2c_rate_budget_and_health_test.sql`
- `docs/architecture/implementation/slice-2c-5-accounting-health-evidence.md`

**Required forward schema and RPCs:**

```sql
create table provider_rate_budgets (
  provider_id uuid not null references data_providers(id) on delete restrict,
  scope_key text not null,
  limit_count integer not null,
  remaining_count integer not null,
  reset_at timestamptz,
  observed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (provider_id, scope_key),
  check (btrim(scope_key) <> ''),
  check (limit_count >= 0 and remaining_count >= 0 and remaining_count <= limit_count)
);

reserve_provider_budget(
  p_provider_id uuid,
  p_scope_key text,
  p_now timestamptz,
  p_cost integer
) returns table (allowed boolean, remaining_count integer, retry_at timestamptz, reason text)

record_provider_rate_headers(
  p_provider_id uuid,
  p_scope_key text,
  p_limit_count integer,
  p_remaining_count integer,
  p_reset_at timestamptz,
  p_observed_at timestamptz
) returns table (remaining_count integer, reset_at timestamptz)
```

The initial scope key is exactly `provider`. A later adapter packet may add a documented provider-specific
scope only with dedicated tests. Both functions lock the budget row, validate nonnegative bounds, and are
service-role-only `SECURITY DEFINER` functions. Missing budget rows fail closed. Reservation is one request
unit and is consumed even when the provider returns 429, 401, or 5xx. A reset timestamp may restore the
configured limit only at or after its trusted boundary; untrusted headers cannot increase a budget without
the same bounds check.

**Run count and status invariants:**

- `fetched_count` counts provider objects returned by successful pages; `normalized_count` counts emitted
  normalized observations; `projected_count`, `unchanged_count`, `quarantined_count`, `skipped_count`, and
  `failed_count` are mutually exclusive terminal dispositions for emitted observations.
- When all emitted observations have a disposition:
  `normalized_count = projected_count + unchanged_count + quarantined_count + skipped_count + failed_count`.
  A transport failure before normalization may have all observation counts zero and a terminal failed run.
- `skipped_count` is nonzero only for shadow/non-write projection outcomes. Disabled bindings do not fetch,
  so they do not produce skipped observations.
- `succeeded` means the final page was consumed without item failure and no continuation remains. `partial`
  means safe work was committed but a valid continuation remains or some items quarantined/skipped. `failed`
  means no safe retry remains or a terminal provider/validation failure occurred. `rate_limited` means no
  provider call was permitted or a 429 reschedule ended the run. `canceled` is operator/lease control only.
- Error class/message are sanitized and bounded. No raw response, authorization header, credential, or
  provider payload is stored in `ingestion_runs.error_message` or metadata.

**Health transitions:**

- `disabled` is the operator/mode kill state. Authentication or authorization failure sets mode and health
  to disabled and clears automatic scheduling; only an operator can re-enable it.
- A successful changed-data page sets `healthy`, resets consecutive failures, and updates `last_data_at`.
- A successful empty/not-modified page resets consecutive failures and updates `last_success_at`; it updates
  `healthy` only if accepted data is still within `stale_after_seconds`.
- A retryable network/5xx/invalid-page failure increments consecutive failures and sets `degraded` while
  accepted data remains fresh. Once `now - last_data_at > stale_after_seconds` (or no data has ever arrived),
  the state is `stale`. Stale takes precedence over degraded.
- 429/rate-limited does not increment consecutive failures; it preserves degraded/stale calculation from data
  age and schedules at the later of `Retry-After`, provider reset, and deterministic backoff.
- Not-found, unsupported shape, and permanent configuration failures stop automatic scheduling, preserve
  evidence, and set `degraded` until operator disposition; they do not delete canonical state.

`finish_ingestion_run` from 2C.2 is the only state transition writer. The 2C.5 migration may replace its
forward function body or add a private helper, but it may not create a second competing finish path.

**TDD/database matrix:** budget reservation available/exhausted/reset; concurrent provider reservations;
invalid headers; 429 Retry-After; count conservation for write/shadow/quarantine; transport failure with zero
normalized items; success/empty/partial/failure/rate-limited terminal statuses; authentication disablement;
degraded/stale/healthy transitions; stale recovery; sanitized error fields; no public grants; rollback after
budget or health update failure.

**Verification:** `npm test -- tests/ingestion/orchestrator/accounting.test.ts tests/ingestion/orchestrator/health.test.ts tests/ingestion/rate-limit/repository.test.ts`;
`npx tsc --noEmit`; `npm run lint`; `SUPABASE_TELEMETRY_DISABLED=1 supabase db reset --local`;
`SUPABASE_TELEMETRY_DISABLED=1 supabase test db supabase/tests/database/24_slice_2c_rate_budget_and_health_test.sql`;
`SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local --level warning`; `git diff --check`.

**Evidence ceiling:** Synthetic local database budget/health evidence and pure TypeScript accounting only.
No real quota, provider, hosted, or deployment evidence.

**Rollback/forward repair:** Before hosted data, remove only the new budget table/functions through the
reviewed down note. After hosted data, stop claims, preserve observed headers and run history, and forward-
repair budget/health state; never reset a provider budget by deleting evidence.

**Stop conditions:** budget reservation is per league instead of provider-wide; unknown budget fails open;
count meanings overlap; a 429 is treated as data failure; stale state clears without fresh accepted data;
authentication failure continues automatic calls; secrets enter error fields; or direct table writes bypass
the RPC.

**Next approval gate:** accept accounting, budget, health, and grant evidence before complete synthetic replay.

### 2C.6 — Synthetic sports and ceremony orchestrator acceptance

**Objective:** Exercise the complete local Slice 2C path with two substantially different synthetic adapters,
including claim/retry/checkpoint/health behavior and the accepted Slice 2B projection boundaries.

**Exact allowlist:**

- `tests/ingestion/orchestrator/replay/sports-orchestrator-replay.test.ts`
- `tests/ingestion/orchestrator/replay/ceremony-orchestrator-replay.test.ts`
- `tests/ingestion/orchestrator/replay/fixtures/sports/*.json`
- `tests/ingestion/orchestrator/replay/fixtures/ceremony/*.json`
- `supabase/tests/database/25_slice_2c_orchestrator_replay_test.sql`
- `docs/architecture/implementation/slice-2c-6-replay-evidence.md`

Fixtures must be synthetic and contain no real provider payload, URL, credential, header, or token. The
replay harness consumes `ProviderAdapter` through the registry and never branches on adapter/provider name.

**Required acceptance matrix:**

- due claim, one-active-run concurrency, lease renewal, crash recovery, and expired-run reclamation;
- at-least-once duplicate page and exact observation replay with one canonical effect;
- deterministic retry/backoff/jitter, provider budget exhaustion, 429/Retry-After, and terminal auth failure;
- disabled, shadow, and write bindings with explicit zero canonical mutation in shadow/disabled;
- sports pagination with cursor and ETag, ceremony empty/unchanged page, partial batch, repeated cursor,
  and checkpoint crash/replay;
- missing/ambiguous identity quarantine delegated to Slice 2B; structural and result projection dispatch;
- out-of-order/illegal-regression behavior delegated to Slice 2B with run counts preserved;
- sanitized failure persistence and health degraded/stale/recovery transitions;
- transaction rollback leaves no partial page checkpoint or orphan run mutation;
- no duplicate observation, result, audit, outbox, or run effect after exact/concurrent replay;
- all existing application and database suites remain green.

**Verification:** `npm test -- tests/ingestion/orchestrator/replay`; `npx tsc --noEmit`; `npm run lint`;
`npm run build`; `SUPABASE_TELEMETRY_DISABLED=1 supabase db reset --local`;
`SUPABASE_TELEMETRY_DISABLED=1 supabase test db supabase/tests/database`;
`SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local --level warning`; `git diff --check`.

**Evidence ceiling:** Synthetic TypeScript, disposable-local database, and deterministic replay only. No
recorded-provider, live-provider, hosted, beta, device, notification-delivery, or production claim.

**Rollback/forward repair:** Revert synthetic fixtures and local code before any external binding. If a
future hosted run exists, disable the binding and preserve all runs/evidence while repairing forward.

**Stop conditions:** a fixture resembles a real provider payload; replay reaches a network; a provider name
conditional appears; shadow or disabled state mutates canon; checkpoint/count/idempotency invariants fail;
or the test suite requires lifecycle, legacy scoring, notification delivery, or UI work.

**Next approval gate:** submit complete Slice 2C local evidence for architecture review. Provider/recorded
fixture work requires a separate G2 approval; shadow/beta/deployment work requires later rollout gates.

## 4. End-to-end transaction and concurrency model

The intended local flow is:

```text
claim due binding
  -> reserve provider-wide budget
  -> pull one page under lease
  -> evidence insertion/replay boundary
  -> identity/order/structural-or-result projection boundary
  -> commit page cursor + counters atomically
  -> renew or finish run + health transition
```

The binding row is the lock root for claims, budget state is the lock root for provider-wide reservation,
and the run row is the lock root for lease renewal/finish. Claim locks are acquired in binding UUID order;
budget locks are acquired by `(provider_id, scope_key)`; run locks are acquired by `run_id`. No transaction
locks a provider observation or canonical contest before its binding/run lock is established. This fixed
order prevents a scheduler worker and an in-flight page worker from deadlocking.

A page is at-least-once: evidence and projection may be replayed after a crash, but Slice 2B deterministic
keys and SQL uniqueness return prior outcomes. Cursor/ETag checkpoint and page counters commit only after
all page observations reach a terminal disposition. A lease loss aborts the current transaction; a later
worker reclaims the run and repeats from the last committed checkpoint.

No notification is delivered by Slice 2C. Slice 2B may create an operator-audience outbox intent for an
accepted result, but the outbox worker and delivery semantics remain outside this slice.

## 5. Security and operational boundaries

- Only `service_role` may execute claim, lease, checkpoint, budget, finish, and health RPCs. Browser roles
  receive no run, binding, budget, observation, error, cursor, or quarantine access.
- `SECURITY DEFINER` functions set a fixed safe `search_path`, schema-qualify objects, derive provider and
  edition from binding rows, verify lease ownership, and never trust caller-supplied canonical IDs,
  provider IDs, claim scopes, or counts without validation.
- `credential_ref` is a reference only. The secret resolver is server-only and is not a database function,
  serialized request field, fixture value, log field, or error detail.
- Stored failures contain only Slice 2A code, sanitized message, bounded HTTP status/timestamps, and safe
  JSON details. Headers, raw bodies, tokens, cookies, and personal data are excluded.
- Shadow is a retention/proposal mode, not a write shortcut. Disabled is an operational kill state. Neither
  mode may mutate canonical, result, audit, or outbox state.
- Run IDs, binding IDs, and provider IDs are internal/provenance values; no participant-facing UI or public
  API is added. Manual replay must be operator-authenticated in a later server boundary.
- The packet does not change RLS for public compatibility reads, notification delivery, lifecycle state,
  template scoring, or organizer routes.

## 6. Test and evidence matrix

| Evidence class | Planned in Slice 2C | Boundary |
|---|---:|---|
| Pure TypeScript unit | Yes | 2C.1, policy/accounting/checkpoint decisions |
| Local database integration | Yes | 2C.2, 2C.5, and replay assertions |
| Synthetic adapter replay | Yes | 2C.3 and 2C.6 |
| Recorded provider fixture | No | Separate approved provider-evidence gate |
| Live provider/sandbox | No | G2/G3 provider and rollout approvals |
| Deployment/beta/device/production | No | Later rollout gates only |

The complete local suite must preserve the accepted Slice 2A and 2B totals as a regression baseline and
add explicit assertions for every scenario named in 2C.6. A green mocked adapter test alone is insufficient;
claim/lease/budget/checkpoint/health assertions must run against disposable local PostgreSQL.

## 7. Decisions requiring approval before implementation

The packet makes the following bounded recommendations for review:

1. **Lease model:** SQL-generated opaque lease token, one active run per binding, expired runs become failed
   with `lease_expired`, and no cursor advancement occurs during reclamation.
2. **Claim identity:** SQL-derived scheduled key plus binding-scoped manual request key; exact replay returns
   the prior run rather than creating a duplicate.
3. **At-least-once delivery:** repeat pages after crash; rely on accepted Slice 2B idempotency and return
   prior outcomes.
4. **Checkpoint rule:** advance only after every emitted observation has a terminal disposition; 25-page
   maximum per run; repeated cursor is terminal invalid response.
5. **Budget rule:** provider-wide scope, one request cost, fail closed when unknown, reserve before fetch,
   honor the later of `Retry-After` and provider reset.
6. **Retry rule:** three retries after the initial attempt, 30-second exponential base, 15-minute cap,
   deterministic full jitter, and no automatic retries for auth/configuration errors.
7. **Mode rule:** disabled does not fetch, shadow retains evidence but skips canonical projection, and write
   invokes Slice 2B wrappers. No mode automatically enables another mode.
8. **Health rule:** successful fresh data is healthy; retryable failures are degraded; stale data age takes
   precedence; auth disables; 429 does not count as a data failure.
9. **Manual replay:** later operator-authenticated replay uses a new request key and remains subject to mode,
   lease, budget, and idempotency policy; it cannot fetch while disabled.
10. **Schema/RPC boundary:** forward migrations `20261010000000` and `20261010000001` own run/lease/checkpoint
    and provider-budget/health persistence respectively; all writes are service-role-only SQL boundaries.

Architecture approval must explicitly accept or reject these constants and boundaries before 2C.1 begins.
Rejection of any item returns this packet for revision; implementation must not silently choose a variant.

## 8. Exclusions and later gates

Explicitly excluded from Slice 2C:

- real adapters, provider calls, provider documentation, credentials, recorded provider payloads, and
  provider terms/licensing;
- hosted/remote migrations, deployment, scheduler/cron activation, production data, production backfill,
  beta, physical devices, and production claims;
- notification delivery, push sends, outbox workers, organizer UI, operator UI, and public health endpoints;
- lifecycle completion/reopening, scoring/template projection, effective-result read changes, and GitHub
  issue #3 closure;
- UCL/NFL live configuration, provider account setup, rate-budget verification against real headers, and
  any paid plan or hosting change;
- changing accepted Slice 2A contracts or Slice 2B SQL behavior without a separately approved correction.

The next external gate is G2 provider verification after the local Slice 2C packet and implementation are
reviewed. The next product/rollout gates remain shadow, private write beta, device, and production canary as
defined by `docs/architecture/tournament-ingestion-rollout-plan.md`.

## 9. Documentation-only verification and stop conditions

For this planning change, run only:

```sh
git diff --check
git diff --name-only b5c4ce3b17033e49e247ec836bd679c249c6707e...HEAD
```

Review the packet against:

- `docs/architecture/tournament-ingestion-architecture-plan.md`;
- `docs/architecture/tournament-ingestion-implementation-plan.md`;
- `docs/architecture/tournament-ingestion-qa-plan.md`;
- `docs/architecture/tournament-ingestion-rollout-plan.md`;
- `docs/architecture/implementation/slice-2a-provider-contracts-execution-packet.md`;
- accepted Slice 2B packet and R3 evidence;
- applied ingestion migrations `20261006000002`, `20261009000000` through `20261009000005`.

Paths in the six future allowlists are planned deliverables and may not exist until their sub-slice is
approved. Existing authoritative input paths above must exist. Any contradiction with an applied migration,
accepted Slice 2A contract, or accepted Slice 2B boundary is a stop condition. No application, database, or
provider test is authorized for this documentation-only packet.
