# Slice 2C.5B provider budget evidence

## Status and evidence ceiling

Slice 2C.5B-R2 is implemented from baseline
`21496d7ac90a896c1240555e4f43190809fd34b5` and remains pending independent
acceptance review. Evidence is limited to local synthetic TypeScript and
disposable-local PostgreSQL. No provider, credential, network, hosted,
deployment, notification, production, beta, or device activity occurred.
Slice 2C.5C was not started.

## Commits

- `0f35aca4e9ea5414f7261a28995c7a5b33a63d3e` — R1 budget-boundary remediation
- `33ccdec` — `fix: correct slice 2c.5b header semantics`
- Documentation commit: recorded in the final handoff after this file is
  committed.

## R2 corrections delivered

Migration `20261010000006_slice_2c_5b_r2_header_semantics.sql` forward-replaces
the 00005 header helper without rewriting either applied migration:

- rate-header presence is based only on limit, remaining, or reset fields;
  `observed_at` alone never clears provenance or changes budget state;
- effective observation ordering and stale provider-reset classification occur
  before local reset replenishment or observational writes;
- an expired local window computes its projected boundary without mutation,
  rejects stale/out-of-order reset headers, then replenishes once only for an
  accepted current-window header;
- future provider reset values remain observational and cannot advance the
  database-authoritative trusted reset;
- equal effective timestamps continue to use later serialized database
  acceptance;
- helper-stage failures remain inside the atomic response transaction.

The rollback companion is a non-destructive forward-repair note. It preserves
all budget, reservation, run, and header evidence and leaves public wrappers
executable.

## Permanent database coverage

Test 24 now has 131 assertions covering no-header provenance preservation,
delayed lower-remaining acceptance, fresh and expired-window stale-reset
rejection, out-of-order non-replenishment, current-window remaining=2 followed
by cost=1, future reset handling, equal-time ordering, and a transaction-scoped
helper failure after run metadata is written. The helper trigger is created and
dropped inside the pgTAP transaction; it is not a production object.

## Reproducible disposable probes

All probes used temporary files under `/private/tmp` and a disposable fixture
created with:

```text
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -f /private/tmp/slice-2c-5b-r1-setup.sql
```

The authoritative lock order for each wrapper was binding → run → provider
budget. Sanitized session procedures and actual outputs follow.

### Same-attempt reservation

Session A and session B executed the same canonical `reserve_provider_budget`
call concurrently with the same run, lease, attempt key, and cost. Expected:
one reservation and one replay. Actual: `session-A: replayed|8`,
`session-B: reserved|8`; the final reservation state was one decrement.

### Concurrent reset

Before the two calls, session A set `available_count=0` and
`trusted_reset_at=clock_timestamp()-interval '1 second'`. Session A and B then
reserved distinct canonical attempt keys concurrently. Expected: one local
window replenishment and no over-credit. Actual: `reserved|9` and
`reserved|8`; final state was `available_count=8`, trusted reset strictly in
the future, with four total disposable reservation rows including earlier
probe calls.

### Serialized headers from different bindings

With availability reset to 10, session A called `record_ingestion_response`
with remaining 2 and session B called it with remaining 7 concurrently.
Expected: lock serialization and conservative minimum. Actual: both wrappers
returned `true`; final state was `available_count=2|observed_remaining=7`.
The later observational value was retained, but it could not raise
availability.

### Lease expiry while waiting on the budget lock

Session A executed `begin`, locked the provider budget with a no-op update, and
held it during `select pg_sleep(8)`. Before that lock, session B’s run lease
was set to expire in two seconds. Session B invoked its canonical reservation
call and waited on the budget lock. Expected: post-lock lease validation.
Actual: `ERROR: lease_lost`; it did not return configuration missing or create
a reservation. Session A then rolled back.

### Helper-stage response rollback

The command

```text
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -f /private/tmp/slice-2c-5b-r2-helper-rollback.sql
```

installed a transaction-scoped budget update trigger after capturing state,
then called the public response wrapper. Expected: the helper error rolls back
both the earlier run update and the budget update. Actual: the trigger raised
`forced_header_helper_failure`; state was `before=429|7|2|7` and
`after=429|7|2|7`. The trigger and function were dropped afterward.

After all probes, a clean local Supabase reset removed every disposable fixture.

## Verification

Passed sequentially:

- full application suite: 34 files, 626 tests;
- `npx tsc --noEmit`;
- `npm run build`;
- `npm run lint`: 0 errors, 10 pre-existing warnings;
- clean `SUPABASE_TELEMETRY_DISABLED=1 supabase db reset --local` through
  migration 00006;
- targeted database test 24: 131 assertions;
- full database suite: 24 files, 614 assertions;
- `SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local --level warning`:
  only the three existing unused `p_now` warnings in
  `slice_2c_assert_lease`, `start_ingestion_run`, and
  `renew_ingestion_run`;
- transactional rollback rehearsal for 00006: wrapper privilege probe
  `true|true` before and after the no-op companion;
- `git diff --check`.

## Security and residual risk

RLS, service-role SELECT-only access, direct mutation denial, fixed search
paths, schema qualification, service-role-only public wrappers, and private
helper denial remain covered by test 24 and the prior database suite.

The budget repository remains intentionally unwired into `ports.ts` or the
orchestrator; that is Slice 2C.5C work. Provider, hosted, deployment,
scheduler, beta, device, and production behavior remain unverified.
Independent acceptance review remains pending.
