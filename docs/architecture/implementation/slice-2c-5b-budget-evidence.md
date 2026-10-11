# Slice 2C.5B provider budget evidence

## Status and evidence ceiling

Slice 2C.5B-R1 is implemented from baseline
`f6e8d69daf0a3b3a868da6fb4763e764e4c8837d` and remains pending independent
acceptance review. Evidence is limited to local synthetic TypeScript and
disposable-local PostgreSQL. No provider, credential, network, hosted,
deployment, notification, production, beta, or device activity occurred.
Slice 2C.5C was not started.

## Commits

- `0f35aca` — `fix: remediate slice 2c.5b budget boundaries`
- Documentation commit: recorded in the final handoff after this file is
  committed.

## R1 corrections delivered

The forward migration
`20261010000005_slice_2c_5b_acceptance_remediation.sql` preserves the prior
00004 migration and corrects its local acceptance defects:

- reservation lease validation now occurs before budget lookup and again after
  the provider-budget lock;
- header acceptance time is captured after binding, run, and budget locks;
- expired trusted windows advance before a current-window remaining header is
  applied, preventing quota over-credit;
- provider remaining data can reduce availability but cannot raise it or
  advance the trusted reset boundary;
- run/binding/provider/edition consistency is checked in the sole public
  response boundary;
- decorated `lease_lost` and `attempt_key_conflict` RPC errors map to typed,
  sanitized repository errors without exposing database text.

The rollback companion is an explicit non-destructive forward-repair note. It
preserves budget, reservation, run, response, and prior ledger evidence and
does not remove public wrappers.

## Schema, RPC, and security boundary

The accepted 00004 schema remains provider-wide: budget state is keyed by
`(provider_id, scope_key)` with the fixed `provider` scope, and reservation
identity is `(provider_id, scope_key, attempt_key)`. The reservation RPC
derives provider, scope, retry index, checkpoint, cursor, ETag, and canonical
attempt key from the authoritative run and binding. It uses binding → run →
budget locking, database `clock_timestamp()`, replay-before-reset ordering,
single-decrement reservations, and authoritative reset timestamps.

The existing `record_ingestion_response` signature remains the sole public
response boundary. Its response metadata and provider-header reconciliation
are atomic. Header observations use post-lock acceptance ordering, clamp
future observation times, ignore stale observations, and never redefine the
configured ceiling or trusted reset.

Both budget tables retain RLS and service-role SELECT-only access. Direct
INSERT, UPDATE, DELETE, and TRUNCATE remain denied to browser roles and
service_role. Public reservation and response wrappers are fixed-search-path,
schema-qualified, SECURITY DEFINER, and service-role-only. The private header
helper is invoker-rights and ungranted.

## Verification

Passed sequentially:

- focused TypeScript: 3 files, 260 tests;
- full application suite: 34 files, 626 tests;
- `npx tsc --noEmit`;
- `npm run build`;
- `npm run lint`: 0 errors, 10 pre-existing warnings;
- clean `SUPABASE_TELEMETRY_DISABLED=1 supabase db reset --local` through
  migration 00005;
- targeted database test 24: 98 assertions;
- full database suite: 24 files, 581 assertions;
- `SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local --level warning`:
  only the three existing unused `p_now` warnings in
  `slice_2c_assert_lease`, `start_ingestion_run`, and
  `renew_ingestion_run`;
- `git diff --check`.

## Disposable concurrency and rollback evidence

Temporary fixtures and probe scripts were kept outside the repository and
were removed by a final clean local database reset. Sanitized probe outcomes:

- same-attempt reservation: one `reserved`, one exact `replayed`, one
  reservation row, and one decrement (remaining 9 from a ceiling of 10);
- expired-window reservation contention: one replenishment, remaining 9,
  trusted reset strictly in the future, and no over-credit;
- serialized headers from different bindings: a current-window remaining 2
  was accepted first; a later remaining 7 was accepted observationally but
  availability stayed 2;
- lease expiry while waiting on the provider-budget lock: the blocked reserve
  returned `lease_lost` after post-lock revalidation, not
  `configuration_missing`;
- the response/header atomic-failure path is covered by database test 24,
  including invalid header bounds and unchanged run metadata;
- rollback rehearsal: the no-op companion returned `BEGIN`/`COMMIT`, and the
  service-role privilege probe was `true|true` for reservation and response
  wrappers both before and after inclusion.

The two-session lock probes used local `psql` sessions and left no fixtures
after reset. The response rollback assertion is pgTAP-backed; no hosted or
provider-backed concurrency claim is made.

## Residual risks and deferred work

The repository is intentionally not wired into `ports.ts` or the orchestrator;
runtime attempt-key and budget integration belongs to Slice 2C.5C. Provider,
hosted, deployment, scheduler, beta, device, and production behavior remain
unverified. Independent acceptance review remains pending.
