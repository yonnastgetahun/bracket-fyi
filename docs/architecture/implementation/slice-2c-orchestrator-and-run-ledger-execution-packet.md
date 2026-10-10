# Slice 2C Execution Packet: Orchestrator and Run Ledger

**Prepared:** 2026-10-08

**Status:** Slice 2C.1 accepted for local/synthetic evidence; Slice 2C.2 accepted for local/synthetic and
disposable-local database evidence through R2/R3; Slice 2C.3 implemented through R2 and accepted for local,
mocked, and synthetic TypeScript evidence. Slice 2C.4A is independently accepted at the local pure-TypeScript/
synthetic evidence ceiling through R2; Slice 2C.4B is accepted through R2 at the local mocked/synthetic
TypeScript evidence ceiling. Provider, hosted,
deployment, beta, device, and production acceptance remain unverified.

**Baseline:** `60735ef334086a30818addff3140ae56587c7810` (`docs: define slice 2c execution plan`)

**Authorization record:** Slice 2C.1 and Slice 2C.2 local implementation and disposable-local verification,
and Slice 2C.3 local mocked/synthetic implementation through R2 are accepted at their stated evidence
ceiling. Slice 2C.4A pure-policy implementation is independently accepted at the local pure-TypeScript/synthetic
evidence ceiling through R2; Slice 2C.4B runtime integration was implemented and accepted through R2 under its
separate implementation gate. No provider call, credential access, deployment, hosted change, notification
delivery, or production action was authorized or performed. Provider,
recorded-fixture, sandbox, beta, device, and production gates remain later approvals.

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
- A cursor or ETag validator advances only after each observation has reached a terminal disposition through
  the independent idempotent Slice 2B evidence/projection RPCs, followed by the page ledger, counters,
  cursor/ETag, and compare-and-set checkpoint committing in one page-commit transaction.
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
| `provider_bindings` | Provider/edition FKs; unique `(provider_id,event_edition_id,binding_key)` and `(id,provider_id,event_edition_id)`; modes `disabled`, `shadow`, `write`; roles `primary`, `fallback`, `shadow`; health `disabled`, `healthy`, `degraded`, `stale`; `credential_ref`; JSON `adapter_config`, `poll_policy`, and `provider_cursor`; `stale_after_seconds >= 60`; `next_poll_at`; attempt/success/data timestamps; failure count; config version; due and provider indexes; RLS with service-role operational access. | Atomic claim generation/ownership, lease token, explicit ETag storage, provider-wide budget state, and health transition RPC. Last-Modified is deferred because Slice 2A exposes only `etag`. |
| `ingestion_runs` | Binding/provider/edition composite FK; globally unique nonblank `claim_key`; trigger kinds `schedule`, `manual`, `retry`, `replay`; statuses `claimed`, `running`, `succeeded`, `partial`, `failed`, `rate_limited`, `canceled`; lease and finish checks; JSON cursors/metadata; rate headers; error fields; nonnegative counters; one active run per binding partial unique index; binding/status indexes. | Claim request/generation identity, lease ownership, durable retry state, page checkpoint atomicity, shadow skip accounting, and authoritative health updates. |
| `ingestion_page_ledger` | Not present. Planned immutable page-effect ledger keyed by binding and deterministic page key, with expected checkpoint, resulting cursor/ETag, disposition deltas, fingerprint, and commit time. | New table, immutable constraints/trigger, service-role SELECT only, and RPC-owned writes. |
| `provider_observations` | Immutable sanitized evidence with generated payload hash, provider revision/timestamp, run/binding/provider/edition composite FK, and immutable trigger. | Orchestrator caller and page checkpoint integration; no new raw payload field is permitted. |
| `ingestion_quarantine` | Unique `(observation_id, issue_code)`; open/resolved/ignored status; sanitized details; service-role-only operational access. | Run-level provider failure disposition is still recorded in `ingestion_runs`; item-level quarantine is delegated to Slice 2B. |
| `data_providers` | Unique adapter key and enabled flag. | No provider is enabled by this packet; no provider adapter is created. |

The existing migration grants `service_role` direct `SELECT, INSERT, UPDATE` on `provider_bindings` and
`ingestion_runs`. Those grants are unsafe for Slice 2C because they bypass claim, lease, checkpoint, retry,
and health invariants. The first Slice 2C migration must revoke all direct `INSERT`, `UPDATE`, `DELETE`, and
`TRUNCATE` privileges from `service_role` on those tables and restore only required `SELECT`. It must apply
the same boundary to the new page ledger; the budget sub-slice applies it to budget and reservation tables.
New RPCs are `SECURITY DEFINER`, use a fixed safe search path and schema-qualified objects, revoke `PUBLIC`,
`anon`, and `authenticated`, and grant only `service_role`. SECURITY DEFINER owners retain private writes.

### 2.3 Existing operational boundaries and gaps

Existing RLS is enabled on the ingestion tables with no public policies. Existing database constraints must
remain the final defense for provider/edition relationships, run lifecycle, rate-header bounds, and
immutable evidence. No scheduler, orchestrator, retry loop, rate-budget table, claim RPC, lease RPC, page
ledger/checkpoint RPC, or health transition function exists. No provider adapter is approved or implemented.

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
  nextPollAt?: string | null;
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
  configuredLimit?: number;
  available?: number;
  trustedResetAt?: string;
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

The pure 2C.1 policies receive explicit ISO `now` values through these function signatures. The later
orchestrator owns an injected `Clock`, calls `clock.now()`, and passes the resulting ISO value into each
policy; the pure policies do not directly depend on or construct a clock.

**Decisions and invariants:**

- `disabled` is never due. `shadow` and `write` are due by the same phase schedule only when
  `nextPollAt` is non-null and `nextPollAt <= now`; a missing/NULL `nextPollAt` is unscheduled and not due.
  Manual claims remain available independently of this ordinary due check.
- `disabled` and `complete` return no next poll (`null`). Other active phases use `idleSeconds`, `pregameSeconds`, `liveSeconds`, or
  `postgameSeconds` exactly; `nextPollAt` is never earlier than `now`.
- A provider-wide budget is required before a provider call. Unknown or invalid budget is fail-closed as
  `unknown_budget` or `invalid_budget`; it creates a recorded rate-limited run outcome and makes no call.
  Cost is one request unless a later adapter packet explicitly defines a different cost. The policy never
  raises `available` from observed headers; only the trusted configured reset boundary can restore the
  configured ceiling.
- `maxRetries = 3` means three retries after the initial attempt, four total attempts. Retryable failures
  are `timeout`, `network`, and `provider_server`; `rate_limited` uses `provider_reset`; all other Slice 2A
  codes are terminal. `Retry-After` is honored; when both it and a provider reset are present, the later
  safe time wins.
- Lease policy is fixed at minimum 60 seconds, default 300 seconds, maximum 900 seconds, with renewal at
  least every `min(lease / 3, 60)` seconds and before a call or page commit inside the 60-second safety
  threshold. Backoff and `Retry-After` never sleep while a lease is held.
- Backoff is `min(900, 30 * 2^retryIndex)` seconds with deterministic full jitter in `[0, delay]`. Jitter
  is derived from `SHA-256("slice-2c-jitter-v1" + claimKey + ":" + retryIndex)` and is not random state.
- The future orchestrator injects `Clock`; 2C.1 policies remain deterministic over explicit ISO inputs and
  tests never use wall-clock sleeps. Manual replay does not reset retry history unless it creates a new
  operator request key.

**TDD sequence and focused matrix:** due/not-due boundary; all phases; disabled/shadow/write; valid,
exhausted, missing, and invalid budgets; 429 with and without `Retry-After`; timeout/network/5xx retries;
401/403/404/invalid-response/permanent terminal failures; maximum retry count; deterministic jitter across
processes; fixed SHA-256 golden vector; clock boundary and timezone-independent ISO output; runtime rejection
of unknown failure codes, retry-strategy mismatches, malformed details, and malformed provider timestamps.

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

### 2C.2 — Atomic claim, lease, retry-attempt, page ledger, and run completion

**Objective:** Add the service-role-only database boundary that makes claim identity, one active run,
lease ownership, durable retry attempts, immutable page effects, compare-and-set checkpoints, and run
completion authoritative under concurrency and crash recovery.

**Exact allowlist:**

- `supabase/migrations/20261010000000_slice_2c_run_ledger.sql`
- `supabase/rollbacks/20261010000000_slice_2c_run_ledger_down.sql`
- `supabase/migrations/20261010000001_slice_2c_2_acceptance_remediation.sql`
- `supabase/rollbacks/20261010000001_slice_2c_2_acceptance_remediation_down.sql`
- `supabase/migrations/20261010000002_slice_2c_2_clock_remediation.sql`
- `supabase/rollbacks/20261010000002_slice_2c_2_clock_remediation_down.sql`
- `supabase/migrations/20261010000003_slice_2c_2_claim_checkpoint_contract.sql`
- `supabase/rollbacks/20261010000003_slice_2c_2_claim_checkpoint_contract_down.sql`
- `supabase/tests/database/23_slice_2c_run_ledger_test.sql`
- `lib/ingestion/orchestrator/run-ledger-repository.ts`
- `tests/ingestion/orchestrator/run-ledger-repository.test.ts`
- `docs/architecture/implementation/slice-2c-2-run-ledger-evidence.md`

No provider adapter, scheduler, UI, legacy result table, hosted migration, or budget table may change.

The acceptance-remediation migrations `20261010000001` and `20261010000002` are limited to forward repair
of the local 2C.2 boundary: authoritative database-clock lease checks, due-selection and lifecycle gates,
binding-first locking, request-key race serialization, UTF-8 page-key parity, checkpoint indexing, and
bounded sanitized run metadata. They do not introduce provider-budget persistence; that remains a later
2C.5 migration.

The R3 bridge adds `checkpoint_generation bigint` to the row mapper and both claim result shapes. It is
read from the authoritative binding together with the returned cursor and ETag, so the orchestrator can
pass it directly as the page-commit expected checkpoint without an independent unsafe read. The bridge
recreates only the affected claim functions in dependency order; public wrappers remain service-role-only
`SECURITY DEFINER` functions and private helpers remain ungranted invoker-rights functions.

**Required forward schema changes:**

- Add `provider_bindings.provider_etag text`, `provider_bindings.claim_generation bigint not null default 0`,
  and `provider_bindings.checkpoint_generation bigint not null default 0`, with nonnegative checks.
- Before enforcing the claim key invariant, backfill every pre-2C row with the deterministic nonblank value
  `legacy:<run_id>`. Then add `ingestion_runs.claim_request_key text not null`, a check
  `btrim(claim_request_key) <> ''`, and `unique (claim_request_key)`. Automated input keys are normalized
  into the `automated:v1:<operation-key>` namespace; manual input keys are normalized into
  `manual:v1:<binding-id>:<operation-key>`, so the namespaces cannot collide.
- Add `ingestion_runs.claim_generation bigint`, `lease_token text`,
  `retry_index integer not null default 0`, `retry_of_run_id uuid`, `next_retry_at timestamptz`, and
  `skipped_count integer not null default 0`, with bounded/nonnegative checks and indexes on
  `(binding_id, next_retry_at)`. Add a unique partial index on `retry_of_run_id` so one terminal attempt can
  create at most one retry child, and indexes supporting retry priority and due selection.
- Add immutable `ingestion_page_ledger` with: `id`, `binding_id`, `run_id`, deterministic `page_key`,
  `expected_checkpoint_generation`, `expected_cursor`, `expected_etag`, `next_cursor`, `response_etag`,
  `fetched_delta`, `normalized_delta`, `projected_delta`, `unchanged_delta`, `quarantined_delta`,
  `skipped_delta`, `failed_delta`, `disposition_fingerprint`, and `committed_at`. Use a unique
  `(binding_id, page_key)`, a checkpoint-generation index, an immutable trigger, JSON-object checks, and
  nonnegative/count-conservation checks.
- Bound `error_class` and `error_message`, bound serialized run metadata, and reject recursively sensitive
  metadata keys such as `authorization`, `cookie`, `credential`, `password`, `secret`, `token`, `payload`,
  `raw`, and `body`. Callers submit already-sanitized failures; the database never stores raw responses,
  headers, credentials, or provider payloads.
- Revoke `service_role` direct `INSERT`, `UPDATE`, `DELETE`, and `TRUNCATE` on `provider_bindings`,
  `ingestion_runs`, and `ingestion_page_ledger`; restore only `SELECT` to `service_role`. Revoke the same
  privileges from `PUBLIC`, `anon`, and `authenticated`. SECURITY DEFINER owners retain private writes.
- Add only a due-order index if `EXPLAIN` proves the existing partial `(mode,next_poll_at)` index cannot
  support the deterministic claim query. Do not add a duplicate index speculatively.
- Preserve all existing columns and constraints through a forward migration; do not rewrite an applied
  migration.

**Deterministic page identity:** The SQL boundary owns the key formula and verifies any caller-supplied key.
For the current binding checkpoint, canonicalize the Slice 2A JSON cursor and ETag and compute:

```text
page_key = sha256hex(
  "slice-2c-page-v1" || octet_length(binding_id::text) || binding_id ||
  octet_length(checkpoint_generation::text) || checkpoint_generation ||
  octet_length(canonicalJson(expected_cursor)) || canonicalJson(expected_cursor) ||
  octet_length(coalesce(expected_etag, "")) || coalesce(expected_etag, "")
)
```

The page key excludes `run_id`, worker ID, and lease token so a response lost after commit or a reclaimed
attempt recomputes the same logical page key. The page ledger fingerprint includes the expected checkpoint,
result cursor/ETag, all seven deltas, and the canonical disposition counts. Same key plus a different value
is an immutable conflict; it is never updated or silently discarded.

**Exact SQL function signatures:**

```sql
claim_due_ingestion_run(
  p_claim_request_key text,
  p_now timestamptz,
  p_worker_id text,
  p_lease_seconds integer
) returns table (
  run_id uuid,
  binding_id uuid,
  claim_key text,
  claim_request_key text,
  claim_generation bigint,
  retry_index integer,
  checkpoint_generation bigint,
  lease_token text,
  lease_acquired boolean,
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
) returns the identical table shape above

start_ingestion_run(
  p_run_id uuid,
  p_lease_token text,
  p_now timestamptz
) returns table (run_id uuid, status text, started_at timestamptz)

renew_ingestion_run(
  p_run_id uuid,
  p_lease_token text,
  p_now timestamptz,
  p_lease_seconds integer
) returns table (run_id uuid, lease_expires_at timestamptz)

record_ingestion_response(
  p_run_id uuid,
  p_lease_token text,
  p_http_status integer,
  p_rate_limit_limit integer,
  p_rate_limit_remaining integer,
  p_rate_limit_reset_at timestamptz,
  p_retry_after_at timestamptz,
  p_observed_at timestamptz
) returns table (run_id uuid, recorded boolean)

reclaim_expired_ingestion_runs(
  p_now timestamptz,
  p_reason text,
  p_retry_at timestamptz
) returns table (run_id uuid, binding_id uuid, retry_index integer, reclaimed_at timestamptz)

commit_ingestion_page(
  p_run_id uuid,
  p_lease_token text,
  p_page_key text,
  p_expected_checkpoint_generation bigint,
  p_expected_cursor jsonb,
  p_expected_etag text,
  p_next_cursor jsonb,
  p_response_etag text,
  p_fetched_delta integer,
  p_normalized_delta integer,
  p_projected_delta integer,
  p_unchanged_delta integer,
  p_quarantined_delta integer,
  p_skipped_delta integer,
  p_failed_delta integer
) returns table (
  outcome text,
  page_ledger_id uuid,
  run_id uuid,
  checkpoint_generation bigint,
  cursor_after jsonb,
  provider_etag text
)

finish_ingestion_run(
  p_run_id uuid,
  p_lease_token text,
  p_outcome text,
  p_finished_at timestamptz,
  p_next_poll_at timestamptz,
  p_next_retry_at timestamptz,
  p_data_changed boolean,
  p_failure_code text,
  p_error_message text,
  p_metadata jsonb
) returns table (run_id uuid, status text, health_status text, next_poll_at timestamptz, next_retry_at timestamptz)
```

Every public mutation RPC is `SECURITY DEFINER`, fixes `search_path = public, pg_temp`, qualifies all objects,
revokes execution from `PUBLIC`, `anon`, and `authenticated`, and grants only `service_role`. Private helpers
are ungranted and may remain invoker-rights; they are callable only through an approved public RPC boundary.
Error SQLSTATEs distinguish `lease_lost`, `checkpoint_conflict`, `page_conflict`, and lifecycle rejection.

**Claim identity and lifecycle:**

- The caller supplies a stable request key for exactly one claim operation. Automated scheduler and retry keys
  are normalized into `automated:v1:<operation-key>` and are globally unique, not keys for a multi-binding
  dispatcher tick; a dispatcher must generate a distinct key for every claim it requests. Manual/operator
  keys are normalized into `manual:v1:<binding-id>:<operation-key>`. SQL first resolves an exact stored
  request-key replay, before selecting any other due binding. Only when no replay exists does it lock a due
  binding with `FOR UPDATE SKIP LOCKED`, increment its monotonic `claim_generation`, and create a claim key
  `v1:<trigger_kind>:<binding_uuid>:g<claim_generation>`. Due time is scheduling input only, never identity.
- Exact request-key replay returns the same run. The worker that owns the active lease receives its token; a
  competing worker receives the row with `lease_acquired = false` and a null token. It cannot renew, start,
  commit, or finish that run. The nonblank and global-uniqueness constraints apply after namespace
  normalization, including legacy backfill rows.
- An unresolved retry parent is a terminal `failed` or `rate_limited` run with `retry_index < 3`, no existing
  child identified by the unique `retry_of_run_id` index, and a non-null `next_retry_at`, regardless of whether
  that time is future or due. Before `next_retry_at`, the binding is suppressed from both retry and ordinary
  poll branches. At the exact boundary, the retry branch may claim it; retry candidates are ordered by
  `next_retry_at`, then binding UUID, then parent run ID. A retry claim creates `trigger_kind = retry`,
  `retry_of_run_id = parent.run_id`, and `retry_index = parent.retry_index + 1`; an identical normalized
  request-key loser replays that existing child without a lease token. A different request key may claim
  another binding or return no row, but it never aliases the first request's child. One parent can therefore
  create at most one child, and the chain has at most four total attempts.
- `claim_due_ingestion_run` evaluates the union of eligible retry parents and ordinary due bindings in one
  locked selection. A retry is eligible only at `next_retry_at <= p_now`; an ordinary binding is eligible only
  when `next_poll_at is not null and next_poll_at <= p_now`, and the ordinary branch excludes every binding with
  any unresolved retry parent, whether the retry is future or due. Its ordering is retry priority first, then
  retry time, then ordinary `next_poll_at`, then binding UUID, so an earlier ordinary poll cannot bypass
  backoff or reset the retry chain. Before selecting, the normalized request key takes a transaction-scoped
  advisory lock and exact replay is checked again; a different concurrent request may claim another binding or
  receive no row, but never aliases another request's run.
- Reclamation marks the old `claimed`/`running` run terminal with system class `lease_expired`, preserves its
  cursor, records bounded retry state when allowed, and releases the one-active-run index. A later retry
  claim increments `claim_generation`; its claim key is distinct even when the due time is unchanged. If a
  retry is scheduled, `provider_bindings.next_poll_at` is set exactly to `next_retry_at`; ordinary poll
  selection is suppressed while any unresolved retry is pending. After the retry succeeds or exhausts, the
  finish boundary deterministically schedules the next ordinary poll.
- A manual request key is binding-scoped. Replaying the same operator request returns the prior run; a new
  operator request must use a new key and creates a new claim generation. Manual fetch is rejected for a
  disabled binding; replaying stored evidence remains a separate Slice 2B operation.
- Lifecycle is explicit: `claimed -> running -> succeeded|partial|failed|rate_limited|canceled`. The
  worker must call `start_ingestion_run` before its first provider call; an exact start replay by the same
  active lease returns the existing running state. Response, page, and finish RPCs require `running`, and a
  merely claimed run cannot finish. A terminal run cannot be reopened.
- Lease duration is min 60 seconds, default 300 seconds, max 900 seconds. Claim, renewal, and lease validity
  use database `clock_timestamp()`; caller `p_now` values never authorize a stale worker. The safety threshold
  is 60 seconds remaining. The worker renews at least every `min(lease_duration / 3, 60 seconds)` and must
  renew before every provider call and every page commit when remaining time is below the threshold. Provider
  call timeout must be shorter than lease duration minus the safety threshold.
- Backoff and `Retry-After` never hold a lease. `finish_ingestion_run` persists the terminal attempt,
  `retry_index`, and `next_retry_at`; a later claim creates the next attempt. Three retries means four total
  provider-call attempts. Success or terminal failure clears retry state deterministically. Lease expiry is a
  retryable system outcome only until the same bounded retry limit is exhausted.

**Page commit semantics:**

- The function first resolves and locks the binding, then locks and validates the running run's active lease,
  then recomputes `page_key` from the submitted expected checkpoint and verifies the disposition fingerprint.
  It looks up `(binding_id,page_key)` before
  applying the current binding checkpoint CAS.
- If the ledger row already exists and every submitted field is identical, return `replayed` with the original
  ledger ID, counters, and checkpoint. Do not apply the current CAS, increment counters, or update the
  checkpoint; this remains replayable after the first commit advanced the binding generation.
- If the same key exists with changed cursor, ETag, delta, or disposition, return `page_conflict` and mutate
  nothing. Only when no ledger row exists does the function validate the current checkpoint generation, exact
  cursor, and exact ETag. A stale CAS then returns `checkpoint_conflict` and mutates nothing. Concurrent
  callers can therefore produce one ledger row and one counter/checkpoint effect.
- If no ledger row exists and the CAS matches, insert the immutable page row and update run counters,
  `provider_bindings.provider_cursor`, `provider_bindings.provider_etag`, and `checkpoint_generation` in
  the same transaction. `normalized_delta` must equal projected + unchanged + quarantined + skipped + failed.
- A lost lease or failed CAS aborts without cursor/ETag advancement. The immutable ledger remains the source
  of the prior committed page effect.

**TDD/database matrix:** concurrent two-session same-page commit with one committed and one replayed outcome;
response-loss sequence of first commit advancing the
binding generation followed by identical replay returning `replayed` before CAS; same key with changed
cursor, ETag, counts, or disposition; stale expected generation for a new page; generation increment; one
ledger row and one counter effect; exact automated request replay before due-binding selection; distinct
dispatcher key per claim; competing worker receives no token; future unresolved retry suppresses an earlier
ordinary poll; retry remains suppressed before `next_retry_at`; exact-boundary retry claim; retry priority over
ordinary polls; retry parent with `next_retry_at <= now`; one retry child under concurrent claims; exact retry
replay; retry lineage capped at four total attempts; `next_poll_at` set exactly to retry time; legacy claim-key
backfill plus NOT NULL/nonblank/global-unique constraints; namespace collision rejection; reclamation creates
distinct claim identity; old worker
cannot renew/start/commit/finish; claimed-to-running transition; lease min/default/max and cadence; no-sleep
retry persistence; disabled/shadow/write claims; `has_table_privilege` and `has_function_privilege` vectors;
direct `SET ROLE service_role` INSERT/UPDATE/DELETE/TRUNCATE denial for bindings, runs, and page ledger;
future ordinary polling, null `next_poll_at`, exact due boundaries, stale caller-time bypass attempts for
start/renew/response/page/finish, bounded and sensitive-metadata rejection, UTF-8 page-key golden parity,
same-key advisory-lock races, and binding-first deadlock probes;
wrapper claim/start/page/finish success; anonymous/authenticated/helper execution denial; rollback on every
induced partial failure.

**Verification:** `npm test -- tests/ingestion/orchestrator/run-ledger-repository.test.ts`; `npx tsc --noEmit`;
`npm run lint`; `SUPABASE_TELEMETRY_DISABLED=1 supabase db reset --local`; `SUPABASE_TELEMETRY_DISABLED=1 supabase test db supabase/tests/database/23_slice_2c_run_ledger_test.sql`;
`SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local --level warning`; `git diff --check`.

**Evidence ceiling:** Synthetic local database concurrency, immutable page-ledger, grant, and TypeScript
repository evidence only. No provider or hosted lease evidence.

**Rollback/forward repair:** Before hosted data, the down note may remove only new functions, indexes,
ledger, and newly added columns after stopping local workers, reversing the claim-key constraint only in the
disposable pre-hosted state. After hosted runs exist, preserve the legacy backfill and all runs/page
ledgers/observations through a forward repair; never delete, rewrite, or reuse a committed page key.

**Stop conditions:** a claim uses due time as its sole identity; exact request replay is checked after due-row
selection; automated claim keys are reusable across a dispatcher loop; an unresolved future or due retry can be
bypassed by an ordinary poll; a retry-eligible terminal attempt is not discoverable or can create multiple
children; a competing worker receives a lease token; an expired worker
can renew or finish; retry sleeps while holding a lease; a response-loss replay increments counters or returns
checkpoint conflict after generation advancement; page commit lacks an expected-checkpoint CAS; direct
service-role table mutation remains possible; a helper is directly executable; or rollback requires deleting
evidence.

**Next approval gate:** accept claim/retry/page-ledger concurrency and RPC-only grant evidence before
implementing the orchestrator.

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

The R1 and R2 acceptance remediations changed only `lib/ingestion/orchestrator/orchestrator.ts` and
`tests/ingestion/orchestrator/orchestrator.test.ts`; the accepted ports and evidence dispatcher were not
modified. The R2 documentation update is recorded in the evidence file and this packet/status plan.

**Public interfaces:**

```ts
export type PullWindow = Readonly<{
  windowStart: string;
  windowEnd: string;
}>;

export interface PullWindowResolver {
  resolve(input: Readonly<{
    run: ClaimedIngestionRun;
    requestedAt: string;
  }>): PullWindow;
}

export type CurrentBindingMode = "disabled" | "shadow" | "write";

export interface BindingModeReader {
  read(bindingId: string): Promise<CurrentBindingMode>;
}

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
projector, result projector, injected rate-budget repository, binding-mode reader, pull-window resolver,
and clock. No port accepts a provider raw page or credential value in a serializable command. The
`PullWindowResolver` receives the claimed run and `requestedAt`, and returns provider-neutral window bounds.
The resulting `ProviderPullRequest` must pass `providerPullRequestSchema` before adapter invocation. The
orchestrator also runtime-validates the claimed and re-read current modes (`disabled`, `shadow`, `write`) and
the injected budget decision; malformed values fail closed before budget, credential, adapter, evidence, or
projection activity.

Before any budget reservation, credential resolution, or provider call, `BindingModeReader` rechecks the
current binding mode. Effective mode is least privilege: `disabled` if either claimed or current mode is
disabled; `shadow` if either is shadow and neither is disabled; and `write` only when both are write. A
current mode change may downgrade execution but never promote it. A missing `credentialRef` on a
fetch-enabled binding fails closed before adapter invocation. The rate-budget repository is an injected
port with synthetic tests in 2C.3; concrete budget persistence remains Slice 2C.5.

**Execution behavior:**

1. Receive a verified claimed run and call `start_ingestion_run`. Strictly validate both binding modes, then
   apply least privilege. If effective mode is disabled, finish canceled with no budget, credential, adapter,
   evidence, or projection activity.
2. Resolve the polling phase and one-batch pull window, validate the complete request with
   `providerPullRequestSchema`, and resolve the adapter only through `AdapterRegistry`. Renew before reserving
   budget whenever the lease is within the 60-second safety threshold. A valid denial finishes `rate_limited`
   without credential or adapter activity; malformed budget output fails closed as
   `system:invalid_budget_decision`.
3. Reserve exactly one injected provider-wide budget unit, resolve the credential reference through the
   server-only `CredentialResolver`, renew again if the credential step consumed the safety window, and call
   `pull` exactly once.
4. Runtime-validate the returned batch. For each normalized observation, call
   `record_provider_observation` before any identity or projection.
   Exact replay and revision conflict outcomes remain counted and are not treated as transport failures.
5. In `shadow`, retain evidence and count the accepted observation as `skipped`; do not call a canonical
   projector. In `write`, dispatch structural kinds to `project_structural_observation` and results to
   `project_provider_result`; non-write outcomes cannot mutate canonical/result/audit/outbox state.
6. Renew before page commit when needed, then commit the page checkpoint only after every observation has a
   terminal evidence/projection/quarantine/skipped outcome, using the immutable page key and expected-
   checkpoint CAS. Finish the attempt through the lease RPC.
7. Classify adapter errors through `classifyError`, `providerFailureSchema`, `sanitizeFailure`,
   `classifyFailure`, and `decideRetry`. Persist only fixed generic messages derived from validated failure
   codes and recursively filtered details; provider classes are `provider:<Slice 2A code>` and internal
   failures are `system:<specific_class>`. A validated thrown HTTP/rate-limit failure records only safe status,
   retry-after, and injected observed time before finish. Do not sleep while holding the lease or retry within
   the same attempt; a later claim runs the next bounded attempt. Success and terminal failure close retry state.

All controlled terminal and fail-closed outcomes receive a non-null `nextPollAt`; when no approved retry or
regular schedule exists, the deterministic terminal hold is 300 seconds from the injected clock. The accepted
complete-phase policy still permits a successful complete run to omit `nextPollAt`; the null-means-due versus
complete-phase scheduling decision is a residual cross-slice decision before scheduler deployment.

Lease loss propagates without attempting an unauthorized finish. Other mode, registry, budget, renewal,
response-recording, observation-dispatch, checkpoint, and page-commit failures finish through fixed
namespaced system outcomes when the lease still authorizes it. No adapter-controlled message, cause, stack,
raw response, header, payload, credential, or secret is persisted.

Slice 2C.3 processes one provider batch only. Pagination loops, repeated-cursor detection, and the
25-page limit remain Slice 2C.4 and must not be introduced through this sub-slice.

**Invariants:** no provider conditional in orchestration; no call for disabled or budget-exhausted binding;
shadow has evidence but zero canonical/result/audit/outbox mutations; write uses only accepted RPCs; one
observation is never counted twice; `normalized = projected + unchanged + quarantined + skipped + failed`;
credentials never enter run JSON; a failed pull does not advance cursor; terminal controlled outcomes do not
leave a null next-poll schedule; manual result replay remains outside this fetch path.

**TDD sequence and focused matrix:** fake registry with genuinely distinct sports and ceremony adapters and
private raw shapes; credential reference resolution without serializing value; disabled/shadow/write;
malformed claimed/current modes; malformed and contradictory budgets; renewal-before-budget and
renewal-before-provider ordering; controlled mode/registry/budget/credential/renewal/response failures;
missing credential; exact observation replay; structural/result dispatch; adapter error classification;
namespaced retryable and terminal errors; thrown 429 metadata before finish; fixed generic failure messages
with secret-sentinel absence; lease loss; no provider-name conditional; no canonical writes in shadow;
terminal hold coverage; no provider call after controlled pre-call failures; and a later-observation failure
retaining earlier immutable evidence/projection effects, withholding page commit, and replaying without
duplicate canonical mutations. Mixed dispositions prove count conservation.

**Verification:** `npm test -- tests/ingestion/orchestrator/orchestrator.test.ts tests/ingestion/orchestrator/observation-dispatch.test.ts`;
`npx tsc --noEmit`; `npm run lint`; `git diff --check`. Database behavior remains proven by sub-slice 2C.2
and the final synthetic acceptance lane.

**Evidence ceiling:** Local synthetic TypeScript with in-test adapters and mocked repositories. No network,
provider, credential, or hosted evidence.

**Rollback/forward repair:** Revert the orchestrator commit while bindings remain disabled. Existing
observations, projections, and run rows remain immutable evidence; a later-observation failure does not
roll back earlier Slice 2B RPC commits, and page checkpoint advancement remains the only withheld effect.
Any later hosted defect is repaired through binding disablement and a forward migration.

**Stop conditions:** provider HTTP/client code appears; a credential value is serialized; shadow calls a
projector; an adapter error bypasses the Slice 2A classifier; an observation is projected before evidence;
or an orchestrator branch names a provider.

**Next approval gate:** separately approve Slice 2C.5. Slice 2C.4B is accepted through R2 at the local
mocked/synthetic TypeScript evidence ceiling.

### 2C.4A — Pure cursor, ETag, checkpoint, and bounded-pagination policies

**Objective:** Define strict, provider-neutral checkpoint, cursor repetition, ETag, and bounded-pagination
decisions as pure functions. This sub-slice does not itself wire pagination into the runtime orchestrator;
that integration was delivered by the subsequent 2C.4B slice.

**Status:** Independently accepted at the local pure-TypeScript/synthetic evidence ceiling through R2. The pure
policies are local TypeScript artifacts only; runtime integration is recorded in the separate 2C.4B evidence.

R2 commits: `f3da6e0430c2024d3dda8251d4593c6dd0c6b30c` (`fix: enforce raw etag length boundary`) and
`009a9ed3fa89bbf51d8c1dea302bf4183fdfa1e4` (`docs: record slice 2c.4a-r2 evidence`). Independent review
reported Standards: no findings; Spec: one Low stale-status finding, resolved by this closure update.

**Exact allowlist:**

- `lib/ingestion/orchestrator/pagination.ts`
- `lib/ingestion/orchestrator/checkpoint.ts`
- `tests/ingestion/orchestrator/pagination.test.ts`
- `tests/ingestion/orchestrator/checkpoint.test.ts`
- `docs/architecture/implementation/slice-2c-4-checkpoint-evidence.md`

This sub-slice consumes no database or repository boundary and adds no migration. The later integration
sub-slice may use the existing `commit_ingestion_page(...)` boundary; any incompatibility must stop before
database-file changes or allowlist expansion.

**Public interfaces:**

```ts
export type CheckpointDecision = Readonly<{
  advance: boolean;
  cursorAfter?: JsonObject;
  etag?: string;
  reason: "page_consumed" | "not_modified" | "partial_page" | "retryable_failure" | "invalid_page" | "repeated_cursor";
}>;

export type CheckpointInput = Readonly<{
  currentCursor?: JsonObject;
  currentEtag?: string;
  nextCursor?: JsonObject;
  responseEtag?: string;
  transportSucceeded: boolean;
  pageValid: boolean;
  observationsTerminal: boolean;
  pageWasNotModified: boolean;
  validPartialPage: boolean;
  repeatedCursor: boolean;
}>;

export function decideCheckpoint(input: CheckpointInput): CheckpointDecision;

export function cursorFingerprint(cursor: JsonObject): string;

export function isRepeatedCursor(input: Readonly<{
  currentCursor?: JsonObject;
  nextCursor?: JsonObject;
  seenCursorFingerprints: ReadonlySet<string>;
}>): boolean;

export const MAX_PAGES_PER_RUN = 25;

export type PaginationDecision = Readonly<{
  action: "complete" | "continue" | "yield" | "hold" | "invalid";
  pagesProcessed: number;
  scheduleImmediately: boolean;
  reason: "page_consumed" | "partial_page" | "retryable_failure" | "invalid_page" | "repeated_cursor" | "page_limit";
}>;

export function decidePagination(input: Readonly<{
  pagesProcessed: number;
  checkpoint: CheckpointDecision;
  nextCursor?: JsonObject;
}>): PaginationDecision;
```

**Checkpoint decisions:**

- Runtime validation is strict: unknown keys, Last-Modified fields, malformed cursor JSON, unsafe ETags, and
  contradictory flags fail closed as `invalid_page`. ETags are nonblank after normalization, at most 1024
  characters, and reject C0 controls and DELETE before trimming. ETag is the only validator; no Last-Modified
  behavior is added.
- Transport failure advances nothing and returns `retryable_failure`; invalid pages advance nothing and return
  `invalid_page`; nonterminal observations return `retryable_failure`; repeated cursors return
  `repeated_cursor` without advancing.
- A successful not-modified page advances while retaining the current cursor and replacing the ETag only when
  a response ETag is supplied. A successful complete page uses `nextCursor` when supplied and otherwise
  retains the cursor. A valid partial page with terminal observations follows the same cursor/ETag rules.
- Not-modified plus partial-page state and a repeated-cursor flag without a next cursor are rejected as
  contradictory.
- An empty `ProviderBatch` is a successful unchanged/no-data page. Persist a returned ETag, retain the
  cursor, update `last_success_at`, and do not update `last_data_at`. Last-Modified is explicitly deferred
  until a separately approved provider-neutral contract extension adds its schema and RPC surface.
- A valid partial batch may advance after every emitted observation is projected, quarantined, unchanged, or
  skipped. It never deletes unseen entities. A transport/normalization failure before a complete page holds
  the prior cursor and retries the page.
- A repeated cursor is `invalid_response`, quarantines the run-level failure, does not advance, and stops the
  run. A run processes at most 25 pages; a valid next cursor at the cap finishes `partial` after committing
  the last safe checkpoint and schedules immediate continuation.
- Invalid pagination counts fail closed with `pagesProcessed = 0`; malformed non-count fields preserve a
  valid count. `isRepeatedCursor` strictly validates its complete input and conservatively returns `true`
  for malformed cursors, fingerprint sets, or unknown fields without throwing. Slice 2C.4B must classify
  malformed cursor data as `invalid_page` before calling it.
- ETags are sent on the next request and stored separately from the JSON cursor. An ETag change does not
  itself project data; observations and Slice 2B ordering decide projection. No Last-Modified field or
  conditional-request behavior is introduced by this slice.
- Slice 2B evidence and projection RPCs commit independently and idempotently before page commit. The page
  ledger, disposition counters, cursor/ETag, and checkpoint CAS commit atomically only after all observations
  have terminal dispositions. A failure on a later observation retains earlier immutable evidence/projection
  effects, does not advance the page checkpoint, and safely replays those effects on the next attempt.

**TDD sequence and focused matrix:** first page/no cursor; multi-page progression; ETag unchanged page;
ETag changed page; empty unchanged page; partial observations with quarantine; transient failure before
checkpoint; repeated cursor; max-page cap; crash before/after commit; exact page replay; cursor JSON
validation and stable repeated-cursor hash; no deletion from absent objects; explicit rejection of any
Last-Modified input until the separately approved contract extension.

**Verification:** `npm test -- tests/ingestion/orchestrator/pagination.test.ts tests/ingestion/orchestrator/checkpoint.test.ts`;
`npx tsc --noEmit`; `npm run lint`; `git diff --check`.

**Evidence ceiling:** Pure local checkpoint tests with synthetic cursors, validators, and batches only.

**Rollback/forward repair:** Revert before hosted cursor writes. After hosted use, stop the binding, retain
the last safe cursor and observations, and forward-repair the checkpoint boundary; never manually skip a
provider page by deleting evidence.

**Stop conditions:** cursor advances before projection/evidence disposition; ETag is put in raw payload;
partial data deletes unseen state; a repeated cursor loops; max pages is unbounded; or a checkpoint cannot
be replayed idempotently.

**Next approval gate:** separately approve Slice 2C.5. No runtime pagination integration is included in 2C.4A;
that work is recorded as accepted 2C.4B integration.

### 2C.4B — Runtime orchestrator integration

**Objective:** Wire the accepted 2C.4A decisions into the existing provider-neutral orchestrator, including
bounded page loops, repeated-cursor handling, checkpoint commits, immediate continuation, and the 25-page
yield boundary. This sub-slice is complete through R2.

**Allowlist used:** `lib/ingestion/orchestrator/orchestrator.ts`,
`tests/ingestion/orchestrator/orchestrator.test.ts`, and
`docs/architecture/implementation/slice-2c-4b-integration-evidence.md`, subject to separate approval.

**Required boundary:** 2C.4B uses the pure 2C.4A policies without duplicating cursor, ETag, repetition,
or page-limit decisions. It added no provider-specific branches, provider calls, credentials, database
migrations, or budget persistence.

**Status and evidence:** Accepted through R2 at the local mocked/synthetic TypeScript evidence ceiling.
R2 commits are `fc18d24e444d15dfeb0470c640532e742a4871b9` and
`257bb0e3d98e693960812fd0857ed5a1dc836208`. System Engineer acceptance found no surviving Standards or Spec
findings. Provider, database, hosted, deployment, beta, device, scheduler, and production evidence remain
unverified. The approved scheduling rule is that complete-phase `nextPollAt = null` maps to SQL
`next_poll_at IS NULL`, which means unscheduled/not due for ordinary claims.

### 2C.5 — Run accounting, provider budget, health, and staleness

**Objective:** Make request budgets, run counts, sanitized failure persistence, and binding health transitions
authoritative and observable without adding a scheduler or notification worker.

**Status:** Planning only. No 2C.5A, 2C.5B, or 2C.5C behavior is implemented or approved. The next
implementation gate is 2C.5A.

**Shared scheduling decision:** `provider_bindings.next_poll_at IS NULL` means unscheduled/not due. Ordinary
automated claims require `next_poll_at IS NOT NULL AND next_poll_at <= scheduler_time`; retry claims use their
authoritative `next_retry_at`; manual claims remain available. Complete-phase success stores NULL and is not
automatically reclaimed. Authentication/authorization failures disable the binding and clear scheduling;
terminal provider/configuration failures clear automatic scheduling without deleting evidence. Re-enabling an
inactive binding requires an explicit initial `next_poll_at`.

The NULL-semantic change must update the existing TypeScript `isBindingDue`/policy tests, the
`claim_due_ingestion_run` and `slice_2c_claim_due_impl` ordinary-claim branches, and database test
`supabase/tests/database/23_slice_2c_run_ledger_test.sql`; any assertion that treats NULL as immediately due
must be replaced with unscheduled/not-due coverage. Retry and manual-claim assertions remain distinct.

**Failure-code vocabulary:** `ProviderFailureCode` is the unprefixed Slice 2A adapter union
`authentication | authorization | not_found | rate_limited | timeout | network | provider_server |
invalid_response | unsupported_shape | permanent`. `SystemFailureCode` is the exact `system:*` union in the
table below. `PersistedFailureCode` is `provider:${ProviderFailureCode} | SystemFailureCode`; provider failures
are persisted with the `provider:` prefix and system failures already carry their `system:` prefix.

`decideFailureScheduling` accepts exactly one representation: an unprefixed `ProviderFailureCode` or a
canonical `SystemFailureCode`. It rejects already-prefixed provider codes, whitespace-padded values, case
variants, unknown values, and unknown object keys. It returns the canonical `PersistedFailureCode`.

**Failure scheduling and health decision table:**

| Failure class | Run outcome | Retry/scheduling | Item `failed_count` | Health/scheduling effect |
|---|---|---|---:|---|
| `provider:authentication` | `failed` | Disable; clear `next_poll_at`; no retry | 0 from the failure itself | `disabled`; explicit operator schedule required to re-enable |
| `provider:authorization` | `failed` | Disable; clear `next_poll_at`; no retry | 0 from the failure itself | `disabled`; explicit operator schedule required to re-enable |
| `provider:not_found` | `failed` | Terminal; clear automatic scheduling | 0 from the failure itself | `degraded`, unless stale |
| `provider:rate_limited` | `rate_limited` | Retry at the later of valid Retry-After, trusted reset, and deterministic backoff; one reservation already consumed | 0 | One consecutive run failure; degraded after `DEGRADED_AFTER_FAILURES = 1`, unless stale |
| `provider:timeout` | `failed` | Retry only when `decideRetry` returns a bounded retry time; otherwise clear automatic scheduling | 0 from the failure itself | One consecutive run failure; degraded after the threshold, unless stale |
| `provider:network` | `failed` | Retry only when `decideRetry` returns a bounded retry time; otherwise clear automatic scheduling | 0 from the failure itself | One consecutive run failure; degraded after the threshold, unless stale |
| `provider:provider_server` | `failed` | Retry only when `decideRetry` returns a bounded retry time; otherwise clear automatic scheduling | 0 from the failure itself | One consecutive run failure; degraded after the threshold, unless stale |
| `provider:invalid_response` | `failed` | Terminal; clear automatic scheduling | 0 from the failure itself | `degraded`, unless stale |
| `provider:unsupported_shape` | `failed` | Terminal; clear automatic scheduling | 0 from the failure itself | `degraded`, unless stale |
| `provider:permanent` | `failed` | Terminal; clear automatic scheduling | 0 from the failure itself | `degraded`, unless stale |
| `system:adapter_mismatch` | `failed` | Terminal; clear automatic scheduling | 0 unless emitted item dispositions exist | `degraded`, unless stale |
| `system:adapter_registry_failed` | `failed` | Terminal; clear automatic scheduling | 0 unless emitted item dispositions exist | `degraded`, unless stale |
| `system:binding_mode_read_failed` | `failed` | Terminal; clear automatic scheduling | 0 unless emitted item dispositions exist | `degraded`, unless stale |
| `system:budget_reservation_failed` | `failed` | Terminal; clear automatic scheduling | 0 unless emitted item dispositions exist | `degraded`, unless stale |
| `system:checkpoint_conflict` | `failed` | Terminal; clear automatic scheduling | 0 unless emitted item dispositions exist | `degraded`, unless stale |
| `system:credential_resolution_failed` | `failed` | Terminal; clear automatic scheduling | 0 unless emitted item dispositions exist | `degraded`, unless stale |
| `system:invalid_binding_mode` | `failed` | Terminal; clear automatic scheduling | 0 unless emitted item dispositions exist | `degraded`, unless stale |
| `system:invalid_budget_decision` | `failed` | Terminal; clear automatic scheduling | 0 unless emitted item dispositions exist | `degraded`, unless stale |
| `system:invalid_poll_policy` | `failed` | Terminal; clear automatic scheduling | 0 unless emitted item dispositions exist | `degraded`, unless stale |
| `system:invalid_provider_failure` | `failed` | Terminal; clear automatic scheduling | 0 unless emitted item dispositions exist | `degraded`, unless stale |
| `system:invalid_request` | `failed` | Terminal; clear automatic scheduling | 0 unless emitted item dispositions exist | `degraded`, unless stale |
| `system:lease_renewal_failed` | `failed` | Terminal; clear automatic scheduling; confirmed lease loss uses the dedicated path | 0 unless emitted item dispositions exist | `degraded`, unless stale |
| `system:missing_credential` | `failed` | Terminal; clear automatic scheduling | 0 unless emitted item dispositions exist | `degraded`, unless stale |
| `system:observation_dispatch_failed` | `failed` | Terminal; clear automatic scheduling | 0 unless emitted item dispositions exist | `degraded`, unless stale |
| `system:page_commit_failed` | `failed` | Terminal; clear automatic scheduling | 0 unless emitted item dispositions exist | `degraded`, unless stale |
| `system:page_conflict` | `failed` | Terminal; clear automatic scheduling | 0 unless emitted item dispositions exist | `degraded`, unless stale |
| `system:response_recording_failed` | `failed` | Terminal; clear automatic scheduling | 0 unless emitted item dispositions exist | `degraded`, unless stale |
| `system:lease_expired` | `failed` through reclamation, never an unauthorized client finish | Reclaim/retry only through the bounded run-ledger path; no orchestrator retry | 0 | Authoritative reclaim applies the health transition |
| successful complete-phase run | `succeeded` | Store `next_poll_at = NULL`; no automatic reclaim | 0 unless emitted item dispositions exist | Healthy only when accepted data is not stale |

An unknown provider or system code fails closed as `system:invalid_provider_failure`, with run outcome
`failed`, terminal unscheduling, and no item failure increment. A system failure is never converted to
`rate_limited`; only the provider `rate_limited` class has that run outcome. Provider retries are limited to
`timeout`, `network`, `provider_server`, and `rate_limited`. Every row above increments consecutive run
failures once unless the dedicated lease-expiry reclaim path owns the transition; item `failed_count` changes
only for explicit item dispositions emitted before the failure.

Rate limiting affects consecutive run-failure health accounting once per terminal rate-limited run, but never
creates an item failure or increments item `failed_count`. `DEGRADED_AFTER_FAILURES = 1` remains the fixed
policy. Stale state always has higher priority than degraded, and only fresh accepted data can clear stale.

**Health transition outcomes:** `decideHealthTransition` consumes only the operational health input and never
chooses `nextPollAt`. For an active binding, `succeeded` with changed data sets consecutive failures to zero,
updates `last_success_at` and `last_data_at`, and returns `healthy`. `succeeded` with unchanged or empty data
sets consecutive failures to zero and updates only `last_success_at`; it returns `healthy` when accepted data is
fresh and `stale` when no prior data exists or the stale threshold is exceeded. `partial` with continuation only
sets consecutive failures to zero and updates `last_success_at`; `partial` with quarantine returns `degraded`
(or `stale`) without incrementing provider failures. `partial` with an explicit item failure increments
consecutive failures once and returns `degraded` (or `stale`), while `last_data_at` may update when changed data
was accepted. `failed` and `rate_limited` increment consecutive failures once and update neither success nor
data timestamps; `rate_limited` never changes item failure counts. `canceled` preserves the failure count and
timestamps and does not count as a provider failure. Disabled mode always returns mode/health `disabled` without
inventing a schedule. Authentication or authorization overrides all other health outcomes to mode/health
`disabled` and clears automatic scheduling in the separately composed scheduler. A stale input with fresh
accepted changed data returns `stale_input_fresh_data` and may clear stale to `healthy`; stale input without
fresh accepted changed data returns `stale_input_no_fresh_data` and remains `stale`. At the exact boundary
`now - last_data_at = staleAfterSeconds`, data is not stale; only a strictly greater age is stale. Stale always
has priority over degraded.

**Scheduling composition in 2C.5C:** Health never invents a polling timestamp. The runtime composes the
accepted health and failure-scheduling decisions as follows:

| Situation | `next_poll_at` |
|---|---|
| disabled mode, authentication, or authorization | `NULL` |
| terminal provider or terminal system failure | `NULL` |
| retryable provider failure | `FailureSchedulingDecision.retryAt` |
| successful active run with continuation | current injected `now` |
| successful active run without continuation | existing phase-based `nextPollAt` policy |
| complete phase | `NULL` |
| canceled run | `NULL`, unless a separately approved operator action reschedules it |

Manual claims remain independent of automatic scheduling. `isBindingDue` and `nextPollAt` remain fail-closed:
malformed input returns false and null respectively.

**Bounded implementation gates:**

### 2C.5A — Pure policy and identity contracts

**Objective:** Define accounting invariants, health transitions, NULL-means-unscheduled due policy, deterministic
provider-call attempt identity, and explicit failure-to-scheduling decisions without persistence or runtime
integration.

**Allowlist:**

- `lib/ingestion/orchestrator/accounting.ts`
- `lib/ingestion/orchestrator/health.ts`
- `lib/ingestion/orchestrator/policy.ts`
- `lib/ingestion/rate-limit/attempt-key.ts`
- `tests/ingestion/orchestrator/accounting.test.ts`
- `tests/ingestion/orchestrator/health.test.ts`
- `tests/ingestion/orchestrator/policy.test.ts`
- `tests/ingestion/rate-limit/attempt-key.test.ts`
- `docs/architecture/implementation/slice-2c-5a-policy-evidence.md`

**Public contracts:** Pure policies receive explicit ISO timestamps; the later orchestrator owns an injected
`Clock` and passes its current value into these functions. Each function strictly runtime-validates a plain
object, rejects unknown keys, and returns a deterministic rejected decision (or throws the named validation
error for the key constructor) without normalizing malformed values.

```ts
export type IngestionCounts = Readonly<{
  fetchedCount: number;
  normalizedCount: number;
  projectedCount: number;
  unchangedCount: number;
  quarantinedCount: number;
  skippedCount: number;
  failedCount: number;
}>;

export type AccountingDecision =
  | Readonly<{ accepted: true; counts: IngestionCounts; reason: "accepted" }>
  | Readonly<{ accepted: false; counts: null; reason: "invalid_counts" }>
  | Readonly<{ accepted: false; counts: IngestionCounts; reason: "not_conserved" }>;

export function validateAccountingCounts(input: unknown): AccountingDecision;

export type ProviderFailureCode =
  | "authentication" | "authorization" | "not_found" | "rate_limited" | "timeout"
  | "network" | "provider_server" | "invalid_response" | "unsupported_shape" | "permanent";

export type SystemFailureCode =
  | "system:adapter_mismatch" | "system:adapter_registry_failed" | "system:binding_mode_read_failed"
  | "system:budget_reservation_failed" | "system:checkpoint_conflict" | "system:credential_resolution_failed"
  | "system:invalid_binding_mode" | "system:invalid_budget_decision" | "system:invalid_poll_policy"
  | "system:invalid_provider_failure" | "system:invalid_request" | "system:lease_renewal_failed"
  | "system:missing_credential" | "system:observation_dispatch_failed" | "system:page_commit_failed"
  | "system:page_conflict" | "system:response_recording_failed" | "system:lease_expired";

export type PersistedFailureCode = `provider:${ProviderFailureCode}` | SystemFailureCode;

export type FailureSchedulingInput = Readonly<{
  failureCode: string;
  now: string;
  deterministicBackoffAt?: string | null;
  providerRetryAt?: string | null;
  providerResetAt?: string | null;
}>;

export type FailureSchedulingDecision =
  | Readonly<{
      accepted: true;
      failureCode: PersistedFailureCode;
      outcome: "failed" | "rate_limited";
      disposition: "retry" | "unschedule" | "disable";
      retryAt: string | null;
      incrementConsecutiveFailures: boolean;
      itemFailedCountDelta: 0;
      reason: "retryable_provider" | "rate_limited_provider" | "terminal_provider" |
        "terminal_system" | "lease_expired";
    }>
  | Readonly<{
      accepted: false;
      failureCode: "system:invalid_provider_failure";
      outcome: "failed";
      disposition: "unschedule";
      retryAt: null;
      incrementConsecutiveFailures: true;
      itemFailedCountDelta: 0;
      reason: "invalid_input" | "unknown_failure_code";
    }>;

export function decideFailureScheduling(input: unknown): FailureSchedulingDecision;

export type HealthTransitionInput = Readonly<{
  mode: "disabled" | "shadow" | "write";
  currentHealthStatus: "healthy" | "degraded" | "stale" | "disabled";
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastDataAt: string | null;
  staleAfterSeconds: number;
  now: string;
  runOutcome: "succeeded" | "partial" | "failed" | "rate_limited" | "canceled";
  dataChanged: boolean;
  hasItemFailure: boolean;
  hasQuarantine: boolean;
  hasContinuation: boolean;
  failureCode?: string;
}>;

export type HealthTransitionDecision =
  | Readonly<{
      accepted: true;
      mode: "disabled" | "shadow" | "write";
      healthStatus: "healthy" | "degraded" | "stale" | "disabled";
      consecutiveFailures: number;
      updateLastSuccessAt: boolean;
      updateLastDataAt: boolean;
      reason: "success_changed" | "success_unchanged" | "partial_continuation" |
        "partial_quarantine" | "partial_item_failure" | "failed" | "rate_limited" |
        "canceled" | "disabled_mode" | "authentication_disabled" | "authorization_disabled" |
        "stale_input_fresh_data" | "stale_input_no_fresh_data";
    }>
  | Readonly<{
      accepted: false;
      reason: "invalid_input";
    }>;

export function decideHealthTransition(input: unknown): HealthTransitionDecision;

export type AttemptKeyInput = Readonly<{
  runId: string;
  retryIndex: number;
  pageKey: string;
}>;

export function createAttemptKey(input: unknown): string;
```

`isBindingDue({ mode, nextPollAt }, now)` returns false for disabled mode and for absent/NULL `nextPollAt`;
shadow/write modes require a non-null ISO value and are due only at `nextPollAt <= now`. `nextPollAt(input)`
returns NULL for `mode = "disabled"` and for `phase = "complete"`; active shadow/write bindings require an
explicit non-null schedule, and malformed input is rejected rather than defaulted due. `validateAccountingCounts`
requires nonnegative safe integers, keeps `fetchedCount` independent, returns `counts: null` for malformed
counts, retains validated counts for a conservation failure, and accepts only when
`normalizedCount = projectedCount + unchangedCount + quarantinedCount + skippedCount + failedCount`.
`decideFailureScheduling` requires a valid ISO `now` and `deterministicBackoffAt`; for retryable provider codes
it chooses the latest valid value among `now`, `deterministicBackoffAt`, `providerRetryAt`, and
`providerResetAt`. Missing or malformed required retry data returns the rejected invalid-input branch. Its
accepted branch always returns canonical `provider:<code>` or `system:<code>` and `itemFailedCountDelta: 0`;
explicit observation dispositions, not failure scheduling, own item `failed_count`. Malformed or unknown input
returns the specified rejected `system:invalid_provider_failure` branch. `decideHealthTransition` never returns
or invents a polling timestamp: it applies the exact health reasons in its discriminated union, gives stale
precedence over degraded, applies authentication/authorization disabled override, and returns only
`{ accepted: false, reason: "invalid_input" }` for malformed input. `createAttemptKey` accepts only a strict
canonical run UUID, safe integer `retryIndex` 0–3, and exactly 64 lowercase hexadecimal characters for
`pageKey`; malformed input throws `AttemptKeyValidationError` without trimming or other normalization. The
exact output is `v1:request:<run_id>:<retry_index>:<page_key>`.

**Required invariants/tests:** accounting conservation; shadow skips not being item failures; rate limits not
being item failures; stale-over-degraded precedence; authentication/authorization disablement; terminal
unscheduling; complete-phase NULL; exact due boundaries; deterministic attempt-key validation and replay scope;
every Slice 2A provider code and listed system failure class mapped to one explicit scheduling outcome; exhaustive
unknown, prefixed, whitespace-padded, case-altered, malformed-object, and unknown-key rejection; invalid
accounting counts and conservation failures; every health outcome listed above; exact stale boundary;
partial continuation/quarantine/item-failure distinctions; canceled behavior; failure timestamp ordering;
NULL-unscheduled due behavior; and exact attempt-key validation. Pure TypeScript/synthetic evidence only.

**Rollback/stop/gate:** delete only uncommitted pure artifacts on failure; stop if a policy requires database
state or silently treats NULL as due. 2C.5B requires separate approval after 2C.5A review.

### 2C.5B — Budget persistence and security

**Objective:** Add provider-wide budget and reservation persistence with database-authoritative time, atomic
reservation/header recording, replay safety, RPC-only writes, grants/RLS, rollback, and concurrency tests.

**Allowlist:**

- `lib/ingestion/rate-limit/repository.ts`
- `tests/ingestion/rate-limit/repository.test.ts`
- `supabase/migrations/20261010000004_slice_2c_rate_budget.sql`
- `supabase/rollbacks/20261010000004_slice_2c_rate_budget_down.sql`
- `supabase/tests/database/24_slice_2c_rate_budget_and_health_test.sql`
- `docs/architecture/implementation/slice-2c-5b-budget-evidence.md`

**Boundary/signatures:** `reserve_provider_budget(p_run_id uuid, p_lease_token text, p_attempt_key text,
p_cost integer)` has no caller-supplied time, provider ID, or scope and returns the stored reservation outcome.
The function derives the authoritative run, retry index, binding, provider, checkpoint generation, cursor,
ETag, and fixed scope `provider`; it recomputes the expected attempt key and rejects mismatch. Exact replay is
checked under the established binding-then-run-then-budget lock order before reset replenishment; same key with
different cost is a conflict. Every provider call reserves exactly once, including 429, and later retry/page
calls use distinct keys.

Reservation eligibility, `reserved_at`, and reset replenishment use fresh `clock_timestamp()` after locks;
caller timestamps cannot replenish or advance budget state. Provider headers are observational. Header ordering
uses a validated provider observation timestamp plus a server-generated database acceptance timestamp; future
caller timestamps are clamped to that acceptance time and cannot suppress later valid observations. Headers
never raise the configured ceiling, stale/out-of-order headers are ignored, and trusted local reset windows
advance only under the budget-row lock.

`record_ingestion_response` remains the sole public response boundary and atomically records sanitized run
metadata with accepted header state. RLS is enabled; PUBLIC/anon/authenticated/service_role have no direct
INSERT/UPDATE/DELETE/TRUNCATE, service_role has SELECT only, public mutation wrappers are SECURITY DEFINER
with `search_path = public, pg_temp`, schema-qualified objects, and service-role-only execution. Private
helpers remain ungranted invoker-rights. Test 24 owns budget, header, rollback, privilege, replay, and
concurrency assertions. Test 23 and all ordinary-claim NULL scheduling changes belong exclusively to 2C.5C.

**Rollback/stop/gate:** down SQL must preserve evidence and leave prior public wrappers executable; rehearse
transactionally. Stop if time/provider/scope is caller-controlled, replay can decrement twice, headers can
raise the ceiling, or direct mutation is possible. 2C.5C requires separate approval after 2C.5B review.

### 2C.5C — Runtime accounting, scheduling, and health integration

**Objective:** Wire attempt keys and the persistent budget repository into the existing orchestrator, replace
SQL ordinary-claim NULL semantics, and integrate authoritative finish/health transitions without a second
finish path.

**Allowlist:**

- `lib/ingestion/orchestrator/ports.ts`
- `lib/ingestion/orchestrator/orchestrator.ts`
- `tests/ingestion/orchestrator/orchestrator.test.ts`
- `supabase/migrations/20261010000005_slice_2c_5_scheduling_health.sql`
- `supabase/rollbacks/20261010000005_slice_2c_5_scheduling_health_down.sql`
- `supabase/tests/database/23_slice_2c_run_ledger_test.sql`
- `supabase/tests/database/25_slice_2c_scheduling_health_test.sql`
- `docs/architecture/implementation/slice-2c-5c-integration-evidence.md`

**Required behavior/tests:** one reservation per page/retry/call; attempt-key mismatch denial; complete-phase
unscheduling; future/NULL ordinary claim behavior; terminal unscheduling; explicit initial schedule on
reenable; retry and 429 scheduling; stale/degraded/healthy transitions; rate-limited health accounting without
item failure; aggregate count preservation; no competing finish path; and legacy test 23 updated for NULL not
due. Runtime remains provider-neutral and no scheduler/hosted activation is included.

**Rollback/stop/gate:** revert runtime wiring and any 00005 forward migration while preserving run/evidence/
reservation history. Stop if orchestration can bypass reservation, creates a second finish path, changes
accepted 2C.4B behavior, or enables an inactive binding without an explicit schedule. 2C.6 remains separately
gated after 2C.5C.

**Combined implementation inventory:**

- `lib/ingestion/orchestrator/accounting.ts`
- `lib/ingestion/orchestrator/health.ts`
- `lib/ingestion/orchestrator/policy.ts`
- `lib/ingestion/orchestrator/ports.ts`
- `lib/ingestion/orchestrator/orchestrator.ts`
- `lib/ingestion/rate-limit/attempt-key.ts`
- `lib/ingestion/rate-limit/repository.ts`
- `tests/ingestion/orchestrator/accounting.test.ts`
- `tests/ingestion/orchestrator/health.test.ts`
- `tests/ingestion/rate-limit/attempt-key.test.ts`
- `tests/ingestion/rate-limit/repository.test.ts`
- `supabase/migrations/20261010000004_slice_2c_rate_budget.sql`
- `supabase/rollbacks/20261010000004_slice_2c_rate_budget_down.sql`
- `supabase/migrations/20261010000005_slice_2c_5_scheduling_health.sql`
- `supabase/rollbacks/20261010000005_slice_2c_5_scheduling_health_down.sql`
- `supabase/tests/database/23_slice_2c_run_ledger_test.sql`
- `supabase/tests/database/24_slice_2c_rate_budget_and_health_test.sql`
- `supabase/tests/database/25_slice_2c_scheduling_health_test.sql`
- `supabase/tests/database/26_slice_2c_orchestrator_replay_test.sql`
- `docs/architecture/implementation/slice-2c-5a-policy-evidence.md`
- `docs/architecture/implementation/slice-2c-5b-budget-evidence.md`
- `docs/architecture/implementation/slice-2c-5c-integration-evidence.md`

**Required forward schema and RPCs:**

```sql
create table provider_rate_budgets (
  provider_id uuid not null references data_providers(id) on delete restrict,
  scope_key text not null,
  configured_limit_count integer not null,
  configured_window_seconds integer not null,
  available_count integer not null,
  trusted_reset_at timestamptz not null,
  observed_limit_count integer,
  observed_remaining_count integer,
  observed_reset_at timestamptz,
  observed_at timestamptz,
  observed_accepted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (provider_id, scope_key),
  check (btrim(scope_key) = 'provider'),
  check (configured_limit_count > 0 and configured_window_seconds > 0),
  check (available_count >= 0 and available_count <= configured_limit_count),
  check (observed_limit_count is null or observed_limit_count >= 0),
  check (observed_remaining_count is null or observed_remaining_count >= 0),
  check (observed_limit_count is null or observed_remaining_count is null
         or observed_remaining_count <= observed_limit_count)
);

create table provider_rate_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null,
  scope_key text not null,
  attempt_key text not null,
  cost integer not null,
  reserved_at timestamptz not null,
  remaining_after integer not null,
  unique (provider_id, scope_key, attempt_key),
  foreign key (provider_id, scope_key)
    references provider_rate_budgets(provider_id, scope_key),
  check (btrim(attempt_key) <> '' and cost > 0 and remaining_after >= 0)
);

reserve_provider_budget(
  p_run_id uuid,
  p_lease_token text,
  p_attempt_key text,
  p_cost integer
) returns table (outcome text, reservation_id uuid, remaining_count integer, retry_at timestamptz)

-- Private helper called only by record_ingestion_response; never granted directly.
record_provider_rate_headers_for_run(
  p_run_id uuid,
  p_lease_token text,
  p_observed_limit_count integer,
  p_observed_remaining_count integer,
  p_observed_reset_at timestamptz,
  p_observed_at timestamptz
) returns table (accepted boolean, available_count integer, trusted_reset_at timestamptz)
```

The initial scope is derived inside the function and is exactly `provider`; callers cannot supply a provider
ID or scope. Missing configuration fails closed with `configuration_missing`. The orchestrator computes
`attempt_key = v1:request:<run_id>:<retry_index>:<page_key>` before every provider call; SQL derives the
authoritative run, retry index, binding, checkpoint generation, cursor, and ETag, recomputes the expected
canonical page key, and rejects mismatches. Each provider call, page request, retry request, and 429/Retry-After
attempt reserves one unit exactly once. An exact reservation replay returns the original reservation and
remaining count without decrementing again. A changed cost or scope for the same attempt key is a conflict.
The reservation RPC takes the run ID and lease token, locks the authoritative binding then run in the fixed
order, derives `provider_id` and the fixed provider scope, verifies the active lease, then locks the budget row.

`configured_limit_count` is the hard ceiling and is never raised by a provider header. Header ordering is
deterministic: after the authoritative binding/run/budget locks are held, capture
`observed_accepted_at = clock_timestamp()`. If a supplied `p_observed_at` is in the future, set
`effective_observed_at = observed_accepted_at`; otherwise use `p_observed_at` (or the acceptance time when it
is absent). Store `effective_observed_at` separately from `observed_accepted_at`. Reject/ignore an observation
whose effective time is older than the currently accepted effective observation. For equal effective times,
the later database acceptance timestamp wins; a caller timestamp can never suppress a later valid observation.
An observation whose reset boundary is older than the current trusted configured window is stale-window data:
record its bounded provenance if needed, but do not change availability or the trusted reset. A future reset
header is observational only and also cannot advance the trusted reset. For an accepted current-window header,
set `available_count = min(current_available_count, configured_limit_count, max(0, observed_remaining_count))`;
the provider can only reduce availability, never raise it. Under the budget-row lock, if
`clock_timestamp() >= trusted_reset_at`, compute
`elapsed_windows = floor((clock_timestamp() - trusted_reset_at) / configured_window) + 1`, restore availability
to the configured ceiling once, and advance `trusted_reset_at` by `elapsed_windows * configured_window` until
it is strictly after the locked database time. An exact reservation replay returns its stored result before
reset replenishment, so replay cannot replenish twice. Reset and header handling are performed while locking
the budget row.

The public `reserve_provider_budget` wrapper and the existing run-response RPC from 2C.2 are `SECURITY
DEFINER`, schema-qualified, fixed-search-path, and service-role-only. The private header helper remains
ungranted invoker-rights. RLS is enabled on both tables. `PUBLIC`, `anon`, `authenticated`, and
`service_role` receive no direct `INSERT`, `UPDATE`, `DELETE`, or `TRUNCATE`; `service_role` receives only
`SELECT`. The function owner retains private writes. Database tests must use `has_table_privilege` and
`SET ROLE service_role` to prove direct mutation denial and wrapper success, including the budget and
reservation tables.

`record_ingestion_response(...)` from 2C.2 is the only public response boundary. In one transaction it locks
the authoritative run/binding, verifies the lease, persists sanitized HTTP status and `Retry-After` timing in
the existing run ledger, and invokes the private `record_provider_rate_headers_for_run` helper for the same
response. If either the run-ledger update or accepted budget-header update fails, both roll back; no partial
response metadata or budget state can diverge. No adapter or orchestrator code may write `ingestion_runs` or
the budget tables directly, and the private header helper has no direct grant.

**Run count and status invariants:**

- `fetched_count` counts provider objects returned by successful pages; `normalized_count` counts emitted
  normalized observations; `projected_count`, `unchanged_count`, `quarantined_count`, `skipped_count`, and
  `failed_count` are mutually exclusive terminal dispositions for emitted observations.
- Count conservation is checked in the same page-ledger/checkpoint transaction:
  `normalized_count = projected_count + unchanged_count + quarantined_count + skipped_count + failed_count`.
  A transport failure before normalization may have all observation counts zero and a terminal failed run.
- An intentional shadow/non-write skip may still produce a `succeeded` run when all work was retained and
  no continuation or item failure remains. `partial` means a continuation, quarantine, or actual item
  failure remains; shadow mode alone is not a reason for `partial`. Disabled bindings do not fetch and do
  not produce skipped observations.
- `succeeded` means the final page was consumed without item failure and no continuation remains. `failed`
  means no safe retry remains or a terminal provider/validation failure occurred. `rate_limited` means no
  provider call was permitted or a 429 reschedule ended the run. `canceled` is operator/lease control only.
- `invalid_response` is terminal. Retryable classes are limited to timeout, network, provider-server, and
  rate-limited outcomes under the Slice 2A taxonomy; changing that classification requires a separately
  approved policy update. Three retries means four total provider-call attempts.
- Error class and message are sanitized and bounded. Provider failure classes use `provider:<Slice 2A code>`;
  system classes such as `system:lease_expired`, `system:checkpoint_conflict`, and `system:page_conflict`
  are distinct and never masquerade as provider failures. No raw response, authorization header, credential,
  or provider payload is stored in `ingestion_runs.error_message` or metadata.

**Health transitions:**

- `DEGRADED_AFTER_FAILURES = 1` is the explicit fixed local policy constant for this slice. A later
  configurable threshold requires a separate schema/config approval and tests.
- `disabled` is the operator/mode kill state. Authentication or authorization failure sets mode and health
  to disabled and clears automatic scheduling; only an operator can re-enable it.
- A successful changed-data page sets `healthy`, resets consecutive failures, and updates `last_data_at`.
- A successful empty/not-modified page resets consecutive failures and updates `last_success_at`; it updates
  `healthy` only if accepted data is still within `stale_after_seconds`.
- A retryable timeout, network, provider-server, or rate-limit outcome increments or preserves the configured
  failure state as specified by the policy and sets `degraded` after the threshold while accepted data remains
  fresh. Once `now - last_data_at > stale_after_seconds` (or no data has ever arrived), state is `stale`.
  Stale takes precedence over degraded.
- 429/rate-limited does not count as an item failure; it schedules at the later of `Retry-After`, trusted
  provider reset, and deterministic backoff. A missing or stale header cannot restore budget or freshness.
- Not-found, unsupported shape, invalid response, and permanent configuration failures stop automatic
  scheduling, preserve evidence, and set `degraded` until operator disposition; they do not delete canonical
  state.

`finish_ingestion_run` from 2C.2 is the only run state-transition writer. The 2C.5 migration may replace
its forward function body or add a private helper, but it may not create a second competing finish path.

**TDD/database matrix:** run/lease-derived provider and fixed-scope reservation; configured-ceiling
reservation available/exhausted/reset; missing configuration; concurrent reservation and exact reservation
replay; changed attempt-key conflict; headers above the ceiling; stale and out-of-order headers; reset exactly
at the boundary; multi-window reset advancement; concurrent reset; reset replay without double replenishment;
header ordering with an older effective timestamp (ignored), an equal effective timestamp (later database
acceptance wins), a future provider timestamp (clamped to the acceptance time), a reset header from a prior
trusted window (availability unchanged), and an out-of-order header after a newer accepted observation;
atomic response metadata plus budget-header update and rollback; 429 Retry-After; reservation before every
page/retry; count conservation for write/shadow/quarantine; transport failure with zero normalized items;
success/empty/partial/failure/rate-limited terminal statuses; authentication disablement;
invalid-response terminality; degraded/stale/healthy transitions; stale recovery; bounded provider and
system error fields; direct mutation denial for both tables; wrapper success; no direct private-helper
execution; rollback after budget or health update failure.

**Verification:** `npm test -- tests/ingestion/orchestrator/accounting.test.ts tests/ingestion/orchestrator/health.test.ts tests/ingestion/rate-limit/repository.test.ts`;
`npx tsc --noEmit`; `npm run lint`; `SUPABASE_TELEMETRY_DISABLED=1 supabase db reset --local`;
`SUPABASE_TELEMETRY_DISABLED=1 supabase test db supabase/tests/database/24_slice_2c_rate_budget_and_health_test.sql`;
`SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local --level warning`; `git diff --check`.

**Evidence ceiling:** Synthetic local database budget/health evidence and pure TypeScript accounting only.
No real quota, provider, hosted, or deployment evidence.

**Rollback/forward repair:** Before hosted data, remove only the new budget/reservation tables and functions
through the reviewed down note. After hosted data, stop claims, preserve observed headers, reservations, and
run history, and forward-repair budget/health state; never reset a provider budget by deleting evidence.

**Stop conditions:** configured and observed budgets are conflated; a header raises the hard ceiling; provider
identity or scope is caller-supplied; response metadata and accepted header state can diverge after partial
failure; unknown budget fails open; reservation is not idempotent; a request/page/retry bypasses reservation;
trusted reset replenishes twice or does not advance by whole windows; count meanings overlap; a 429 is treated
as an item failure; `invalid_response` retries without an approved taxonomy change; stale state clears without
fresh accepted data; authentication failure continues automatic calls; secrets enter error fields; direct table
writes bypass the RPC; or browser roles can mutate budget state.

**Next approval gate:** approve and implement 2C.5A first; 2C.5B and 2C.5C require their own subsequent
approval gates before complete synthetic replay.

### 2C.6 — Synthetic sports and ceremony orchestrator acceptance

**Objective:** Exercise the complete local Slice 2C path with two substantially different synthetic adapters,
including claim/retry/checkpoint/health behavior and the accepted Slice 2B projection boundaries.

**Exact allowlist:**

- `tests/ingestion/orchestrator/replay/sports-orchestrator-replay.test.ts`
- `tests/ingestion/orchestrator/replay/ceremony-orchestrator-replay.test.ts`
- `tests/ingestion/orchestrator/replay/fixtures/sports/*.json`
- `tests/ingestion/orchestrator/replay/fixtures/ceremony/*.json`
- `supabase/tests/database/26_slice_2c_orchestrator_replay_test.sql`
- `docs/architecture/implementation/slice-2c-6-replay-evidence.md`

Fixtures must be synthetic and contain no real provider payload, URL, credential, header, or token. The
private source shapes must be materially different before normalization:

- sports uses `SportsSourcePage` with `teams`, `matches`, `scheduledAt`, match lifecycle status, scores,
  and a final winner reference. Its private match/score objects are never exposed outside the sports adapter.
- ceremony uses `CeremonySourcePage` with `categories`, `nominees`, ceremony lifecycle status, and an
  awarded winner. Its private category/nominee objects are never exposed outside the ceremony adapter.

Both adapters emit only the shared normalized `ProviderObservation`/`ProviderBatch` contracts, use the same
registry and orchestrator path, and have no provider-name branch in orchestration, persistence, or projection.

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
claim due binding with a monotonic generation and lease
  -> start the claimed run
  -> renew before every provider call/page when below the safety threshold
  -> reserve provider-wide budget for this request/page/retry
  -> pull one page under lease
  -> record sanitized response headers and accepted budget state atomically through the response RPC
  -> independent evidence insertion/replay RPC
  -> independent identity/order/structural-or-result projection RPC
  -> commit immutable page ledger + cursor/ETag + counters by CAS atomically
  -> finish the attempt, persist retry state, or claim the next retry later
  -> update health through the finish boundary
```

The binding row is the lock root for claims and run-scoped operations. Run-scoped RPCs acquire locks in the
fixed order binding UUID, run ID, then budget `(derived provider ID, fixed scope)`; claims acquire binding
locks in UUID order. The page ledger is inserted while holding the binding/run locks and its unique page key.
No transaction locks a provider observation or canonical contest before its binding/run lock is established.
This fixed order prevents a scheduler worker, response recorder, budget reservation, and page worker from
deadlocking.

A page is at-least-once: Slice 2B evidence and projection may commit independently and may be replayed after a
crash, but deterministic keys and SQL uniqueness return prior outcomes. A failure on a later observation
retains earlier immutable evidence/projection effects, does not advance the page checkpoint, and safely
replays those effects. The immutable page key and ledger return the prior page outcome without incrementing
counters on response-loss replay. Cursor/ETag checkpoint and page counters commit atomically only after all
page observations reach a terminal disposition and the expected checkpoint still matches. A lease loss aborts
the current page transaction; a later worker reclaims the run with a new claim generation and repeats from the
last committed checkpoint. Backoff and `Retry-After` sleep occur after the attempt is finished, not while a
lease is held.

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
- Stored failures contain only namespaced Slice 2A/system codes, fixed generic messages derived from those
  codes, bounded HTTP status/timestamps, and recursively filtered safe JSON details. Adapter-controlled
  messages, headers, raw bodies, tokens, cookies, and personal data are excluded.
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

1. **Lease model:** SQL-generated opaque lease token, one active run per binding, minimum/default/maximum
   lease durations of 60/300/900 seconds, renewal at least every `min(lease/3, 60)` seconds and before a
   call/page commit inside the 60-second safety threshold, and no cursor advancement after lease loss.
2. **Claim identity:** pre-2C rows are backfilled as `legacy:<run_id>`, then claim request keys become
   NOT NULL, nonblank, globally unique, and namespace-normalized as `automated:v1:<operation-key>` or
   `manual:v1:<binding-id>:<operation-key>`. A monotonic binding claim generation forms the claim key; exact
   request replay resolves before selecting another binding, returns the prior run/token only to its owner,
   and a competing worker receives no token. Manual replay uses a new request key.
3. **Attempt lifecycle:** `claimed -> running -> terminal` requires `start_ingestion_run`; expired attempts
   finish as `lease_expired`, cannot renew/commit/finish afterward, and a later claim creates one bounded
   retry child with `trigger_kind = retry`, parent ID, and incremented retry index. Any unresolved retry parent
   suppresses ordinary polling until its exact retry boundary; `next_poll_at` equals that retry time.
4. **At-least-once delivery:** repeat pages after crash; evidence/projection RPCs commit independently, while
   the immutable page ledger plus accepted Slice 2B idempotency return prior outcomes without a second
   counter/checkpoint effect.
5. **Checkpoint rule:** look up an existing page ledger row before current-checkpoint CAS; identical replay
   returns `replayed` even after generation advancement, changed content quarantines as `page_conflict`, and a
   new page advances only after every emitted observation has a terminal disposition and CAS matches. Maximum
   25 pages per run; repeated cursor is terminal `invalid_response`.
6. **Budget rule:** provider-wide scope is derived from the leased run/binding, configured hard ceiling is
   separate from observed headers, one lease-scoped idempotent reservation occurs per request/page/retry,
   unknown configuration fails closed, stale headers are ignored, and a trusted reset advances by whole windows
   under lock without double replenishment.
7. **Retry rule:** three retries after the initial attempt, 30-second exponential base, 15-minute cap,
   deterministic full jitter, persisted next retry/index discovered before ordinary polls, no lease held during
   sleep, and no automatic retries for auth/configuration or `invalid_response` failures.
8. **Mode rule:** disabled does not fetch, shadow retains evidence and may still yield a successful run while
   skipping canonical projection, and write invokes Slice 2B wrappers. No mode automatically enables another.
9. **Health/accounting rule:** shadow skip is not by itself `partial`; `partial` means continuation, quarantine,
   or item failure; `invalid_response` is terminal; `DEGRADED_AFTER_FAILURES = 1` is the fixed local policy;
   stale data age takes precedence; auth disables; 429 follows retry scheduling without item-failure counting.
10. **Validator rule:** Slice 2C persists and sends only ETag. Last-Modified requires a separately approved
    Slice 2A contract extension.
11. **Manual replay:** later operator-authenticated replay uses a new request key and remains subject to mode,
    lease, budget, retry, and idempotency policy; it cannot fetch while disabled.
12. **Schema/RPC boundary:** forward migration `20261010000000` owns claim/lease/attempt/page-ledger/checkpoint
    persistence and `20261010000004` owns budget/health persistence; all writes are wrapper-owned, service-role-
    only SQL boundaries with direct table mutation denied. Response metadata and accepted budget headers commit
    together through the lease-scoped response RPC; caller-supplied provider IDs and scopes are rejected.

Architecture approval must explicitly accept or reject the 2C.5A constants and boundaries before 2C.5A
implementation begins. Rejection of any item returns this packet for revision; implementation must not
silently choose a variant.

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
git diff --check 60735ef334086a30818addff3140ae56587c7810...HEAD
git diff --name-only 60735ef334086a30818addff3140ae56587c7810...HEAD
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
