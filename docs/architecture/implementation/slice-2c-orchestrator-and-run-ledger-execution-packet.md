# Slice 2C Execution Packet: Orchestrator and Run Ledger

**Prepared:** 2026-10-08

**Status:** Planning packet drafted; awaiting architecture approval; implementation not started.

**Baseline:** `60735ef334086a30818addff3140ae56587c7810` (`docs: define slice 2c execution plan`)

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

- `disabled` is never due. `shadow` and `write` are due by the same phase schedule; mode controls only
  projection after evidence is retained.
- `complete` returns no next poll. Other phases use `idleSeconds`, `pregameSeconds`, `liveSeconds`, or
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
  when `next_poll_at is null or next_poll_at <= p_now`, and the ordinary branch excludes every binding with
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

1. Receive a verified claimed run, call `start_ingestion_run`, and if its mode is disabled, finish canceled
   without a provider call.
2. Before every provider request/page, including every retry, renew when the safety threshold requires it and
   reserve one provider-wide budget unit through the repository. If unavailable, finish `rate_limited` with
   no adapter call and the policy-derived retry time. A response header is recorded through the lease-checked
   run-response RPC, never by direct table write.
3. Resolve the adapter by `providerKey`, build the Slice 2A `ProviderPullRequest`, resolve the credential
   reference through the server-only `CredentialResolver`, and call `pull`.
4. For each normalized observation, call `record_provider_observation` before any identity or projection.
   Exact replay and revision conflict outcomes remain counted and are not treated as transport failures.
5. In `shadow`, retain evidence and count the accepted observation as `skipped`; do not call a canonical
   projector. In `write`, dispatch structural kinds to `project_structural_observation` and results to
   `project_provider_result`; non-write outcomes cannot mutate canonical/result/audit/outbox state.
6. Commit the page checkpoint only after every observation has a terminal evidence/projection/quarantine/
   skipped outcome, using the immutable page key and expected-checkpoint CAS. Finish the attempt through the
   lease RPC.
7. Classify adapter errors through `classifyError`, persist only sanitized failure code/message/details, and
   persist the next retry time/index. Do not sleep while holding the lease or retry within the same attempt;
   a later claim runs the next bounded attempt. Success and terminal failure close retry state.

**Invariants:** no provider conditional in orchestration; no call for disabled or budget-exhausted binding;
shadow has evidence but zero canonical/result/audit/outbox mutations; write uses only accepted RPCs; one
observation is never counted twice; credentials never enter run JSON; a failed pull does not advance cursor;
manual result replay remains outside this fetch path.

**TDD sequence and focused matrix:** fake registry with structurally different sports and ceremony adapters;
credential reference resolution without serializing value; disabled/shadow/write; budget denial; exact
observation replay; structural/result dispatch; adapter error classification; retryable and terminal errors;
sanitized run error; lease loss; no provider-name conditional; no canonical writes in shadow; a later
observation failure retains earlier immutable evidence/projection effects, does not advance the page
checkpoint, and safely replays those effects without duplicate canonical mutations.

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

**Next approval gate:** accept provider-neutral orchestration and mode evidence before pagination/checkpoint
implementation.

### 2C.4 — Cursor, ETag, pagination, partial-batch, and checkpoint policy

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
- An empty `ProviderBatch` is a successful unchanged/no-data page. Persist a returned ETag, retain the
  cursor, update `last_success_at`, and do not update `last_data_at`. Last-Modified is explicitly deferred
  until a separately approved provider-neutral contract extension adds its schema and RPC surface.
- A valid partial batch may advance after every emitted observation is projected, quarantined, unchanged, or
  skipped. It never deletes unseen entities. A transport/normalization failure before a complete page holds
  the prior cursor and retries the page.
- A repeated cursor is `invalid_response`, quarantines the run-level failure, does not advance, and stops the
  run. A run processes at most 25 pages; a valid next cursor at the cap finishes `partial` after committing
  the last safe checkpoint and schedules immediate continuation.
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
  - `supabase/migrations/20261010000003_slice_2c_rate_budget.sql`
  - `supabase/rollbacks/20261010000003_slice_2c_rate_budget_down.sql`
- `supabase/tests/database/24_slice_2c_rate_budget_and_health_test.sql`
- `docs/architecture/implementation/slice-2c-5-accounting-health-evidence.md`

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
  p_now timestamptz,
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
ID or scope. Missing configuration fails closed with `configuration_missing`. Each provider call, page
request, retry request, and 429/Retry-After attempt reserves one unit before the request; the reservation key is
`v1:request:<run_id>:<retry_index>:<page_key>` and is unique across concurrent replays. An exact reservation
replay returns the original reservation and remaining count without decrementing again. A changed cost or
scope for the same attempt key is a conflict. The reservation RPC takes the run ID and lease token, locks the
authoritative run and binding in the fixed order, derives `provider_id` and the fixed provider scope, verifies
the active lease, then locks the budget row.

`configured_limit_count` is the hard ceiling and is never raised by a provider header. Headers can only
reduce `available_count` (subject to nonnegative bounds) and update observed metadata. Header observations
whose timestamp is not newer than the stored observation are ignored. Under the budget-row lock, if
`now >= trusted_reset_at`, compute
`elapsed_windows = floor((now - trusted_reset_at) / configured_window) + 1`, restore availability to the
configured ceiling once, and advance `trusted_reset_at` by `elapsed_windows * configured_window` until it is
strictly after `now`. A trusted reset header cannot advance this boundary; only local configured policy does.
An exact reservation replay returns its stored result before reset replenishment, so replay cannot replenish
twice. Reset and header handling are performed while locking the budget row.

Both functions and the run-response RPC from 2C.2 are `SECURITY DEFINER`, schema-qualified, fixed-search-
path, and service-role-only. RLS is enabled on both tables. `PUBLIC`, `anon`, `authenticated`, and
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
    persistence and `20261010000003` owns budget/health persistence; all writes are wrapper-owned, service-role-
    only SQL boundaries with direct table mutation denied. Response metadata and accepted budget headers commit
    together through the lease-scoped response RPC; caller-supplied provider IDs and scopes are rejected.

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
