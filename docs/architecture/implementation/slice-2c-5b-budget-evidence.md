# Slice 2C.5B provider budget evidence

## Status and evidence ceiling

This document records the local Slice 2C.5B implementation from baseline
`521554ec229335d1bfa20aec12e8f75ef5a4c69f`.

The TypeScript repository evidence is local and synthetic. The disposable
PostgreSQL evidence is pending: the local Docker/Supabase service was
unresponsive during reset, one reset attempt ended with the local container
exit-137 setup error, and a later reset remained in database recreation until
it was stopped. A direct connection to `127.0.0.1:54322` was refused. No
database assertion, two-session probe, or rollback rehearsal is claimed as
passed. Provider, credential, hosted, deployment, notification, production,
beta, and device activity did not occur.

Slice 2C.5C was not started. The repository is not wired into the
orchestrator or ports; that remains 2C.5C work.

## Commits

- `f970823` — `feat: add provider rate budget persistence`
- `e7313c9` — `test: prove provider budget security and concurrency`
- Documentation commit: recorded in the final handoff after this file is
  committed.

## Delivered boundaries

Migration `20261010000004_slice_2c_rate_budget.sql` adds:

- provider-wide `provider_rate_budgets`, keyed only by `(provider_id,
  scope_key)` with `scope_key = 'provider'`;
- immutable `provider_rate_budget_reservations`, uniquely keyed by provider,
  scope, and deterministic attempt key;
- configured ceiling/window, database-authoritative trusted reset, bounded
  observational header fields, and availability constraints;
- RLS and service-role SELECT-only table privileges.

`public.reserve_provider_budget(uuid,text,text,integer)` derives provider,
scope, retry index, binding checkpoint, cursor, ETag, page key, and expected
attempt key from the locked run/binding. It locks binding → run → budget,
checks replay before reset replenishment, uses a post-lock database clock,
decrements once per new attempt, and returns `reserved`, `replayed`,
`exhausted`, or `configuration_missing`.

The existing `record_ingestion_response` signature remains the sole public
response boundary. Its forward body records sanitized response metadata and
invokes the ungranted invoker-rights header helper in the same transaction.
Header observations are clamped/ordered by fresh database acceptance time,
can only reduce configured availability, and never advance trusted reset
state.

Rollback `20261010000004_slice_2c_rate_budget_down.sql` is intentionally a
non-destructive transactional no-op. It preserves budget, reservation, run,
and response evidence and leaves public wrappers resolvable. Hosted rollback
requires a separately reviewed forward repair.

## TypeScript repository

`lib/ingestion/rate-limit/repository.ts` exposes a provider-neutral repository
that accepts only `runId`, `leaseToken`, `attemptKey`, and `cost`. It calls the
four-argument reservation RPC, strictly validates the RPC envelope and row,
maps reserved/replayed to available, exhausted to authoritative retry timing,
and missing configuration to `unknown_budget`. Malformed output and RPC
failures become typed, secret-free repository errors; lease loss and attempt
conflicts remain distinct. It is not integrated into runtime orchestration.

## Verification

Passed locally:

- repository focus: 1 file, 12 tests;
- accounting/health/repository focus: 3 files, 258 tests;
- application regression: 34 files, 624 tests;
- `npx tsc --noEmit`;
- `npm run build`;
- `npm run lint`: 0 errors, 10 pre-existing warnings;
- staged diff checks for both implementation commits.

Not passed or not run because the disposable local database was unavailable:

- Supabase reset;
- database test 24 and the full database suite;
- database lint;
- two-session reservation/reset/header concurrency probes;
- transactional rollback rehearsal.

Database test 24 contains 95 planned assertions covering schema, constraints,
provider-wide sharing, replay, reset windows, header ordering, wrapper
security, browser-role denial, and missing configuration. Those assertions
remain unexecuted in this environment rather than being represented as
green evidence.

## Security and residual risk

The migration revokes direct mutation privileges from PUBLIC, anon,
authenticated, and service_role on both budget tables and grants service_role
SELECT only. Only the reservation and response wrappers receive service_role
EXECUTE; the header helper is ungranted invoker-rights. The migration uses
fixed `search_path = public, pg_temp` and schema-qualified application
objects.

Residual risk is the unverified SQL execution path: migration parsing,
interaction with the complete existing database suite, actual concurrency,
RLS behavior, and rollback resolvability still require a functioning
disposable local Supabase instance. Slice 2C.5C remains separately gated and
must perform runtime attempt-key/budget integration after this database
evidence is completed.
