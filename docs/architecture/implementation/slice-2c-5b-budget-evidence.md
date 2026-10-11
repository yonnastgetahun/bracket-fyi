# Slice 2C.5B provider budget evidence

**Evidence date:** 2026-10-11

## Status and evidence ceiling

Slice 2C.5B-R3 is implemented from baseline
`ce9bc741ca439c8391b9e59d86fbdafaa062861a` and remains pending independent
acceptance review. Evidence is limited to local synthetic TypeScript and
disposable-local PostgreSQL. No provider, credential, network, hosted,
deployment, notification, production, beta, or device activity occurred.
Slice 2C.5C was not started.

## Commits

- `0f35aca4e9ea5414f7261a28995c7a5b33a63d3e` — R1 budget-boundary remediation
- `33ccdec72de171d8f78f97879094da197aa18329` — `fix: correct slice 2c.5b header semantics`
- `ce9bc741ca439c8391b9e59d86fbdafaa062861a` — `docs: record slice 2c.5b-r2 evidence`
- `0fea413e691ed5b1dc2b557e4c7cd97941798f83` — `test: close slice 2c.5b rollback evidence gaps`

## R2 and R3 corrections delivered

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

R3 adds permanent acceptance proof without changing production SQL:

- test 24 now has 157 assertions;
- fresh stale-reset, expired-window stale-reset, and out-of-order header cases
  compare all eight budget/provenance fields;
- helper-stage rollback compares all six captured run/response fields and all
  eight budget/provenance fields;
- the equal-time fixture uses a deterministic historical observation baseline,
  so the later database-acceptance assertion is independent of wall-clock time;
- the execution packet and implementation plan include migrations 00005 and
  00006 in the 2C.5B inventory, and identify 00007 as the future 2C.5C
  migration.

## Permanent database coverage

Test 24 now has 157 assertions covering no-header provenance preservation,
delayed lower-remaining acceptance, fresh and expired-window stale-reset
rejection, out-of-order non-replenishment, current-window remaining=2 followed
by cost=1, future reset handling, equal-time ordering, and a transaction-scoped
helper failure after run metadata is written. The helper trigger is created and
dropped inside the pgTAP transaction; it is not a production object.

## Reproducible disposable probes

The probes use only the local database. No committed or persistent probe script
is required. Start from a clean disposable database, then derive the fixture
from committed test 24 source with the following exact command; lines 55–80
insert the two bindings, provider-wide budget, running claim, and canonical
page attempt key:

```sh
SUPABASE_TELEMETRY_DISABLED=1 supabase db reset --local
{ printf 'begin;\n'; sed -n '55,80p' supabase/tests/database/24_slice_2c_rate_budget_and_health_test.sql; printf 'commit;\n'; } \
  | psql postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Capture the primary run values with these exact read-only queries after the
derivation commits:

```sh
DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres
run_a_id=$(psql "$DB" -At -c "select id from ingestion_runs where binding_id='c5000000-0000-4000-8000-000000000005' order by created_at desc limit 1")
lease_a=$(psql "$DB" -At -c "select lease_token from ingestion_runs where id='$run_a_id'")
attempt_a=$(psql "$DB" -At -c "select 'v1:request:'||'$run_a_id'||':0:'||public.slice_2c_page_key('c5000000-0000-4000-8000-000000000005',0,'{}'::jsonb,null)")
printf '%s\n' "$run_a_id|$lease_a|$attempt_a"
```

For the second-binding probes, create and start the second run with the same
approved public wrappers, then capture its values:

```sh
psql "$DB" -c "select * from claim_manual_ingestion_run('c5000000-0000-4000-8000-000000000006','r3-probe-b','r3-worker-b',now(),900);"
run_b_id=$(psql "$DB" -At -c "select id from ingestion_runs where binding_id='c5000000-0000-4000-8000-000000000006' order by created_at desc limit 1")
lease_b=$(psql "$DB" -At -c "select lease_token from ingestion_runs where id='$run_b_id'")
psql "$DB" -c "select * from start_ingestion_run('$run_b_id','$lease_b',now());"
```

Substitute these captured values into the Session A and Session B commands
below. The authoritative lock order is
binding → run → provider budget. Each pair is started from separate terminal
sessions and both commands are issued before either is allowed to finish.

### Same-attempt reservation

Session A:

```sh
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c \
"select outcome, remaining_count from reserve_provider_budget('<run_id>', '<lease_token>', '<attempt_key>', 1);"
```

Session B runs the identical command. Expected: one reservation and one
replay. Actual: `session-A: replayed|9`, `session-B: reserved|9`; the final
reservation state was one decrement.

### Concurrent reset

Before the two calls, either session set `available_count=0` and
`trusted_reset_at=clock_timestamp()-interval '1 second'`. Session A and B then
ran the same reservation command with distinct canonical attempt keys:

```sh
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c \
"update provider_rate_budgets set available_count=0, trusted_reset_at=clock_timestamp()-interval '1 second' where provider_id='<provider_id>' and scope_key='provider';"
```

Then each session ran `reserve_provider_budget` with its own canonical key.
Expected: one local
window replenishment and no over-credit. Actual: `reserved|8` and
`reserved|9` (session order is nondeterministic); final state was
`available_count=8`, trusted reset strictly in
the future, with four total disposable reservation rows including earlier
probe calls.

### Serialized headers from different bindings

With availability reset to 10, session A ran:

```sh
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c \
"select recorded from record_ingestion_response('<run_a_id>', '<lease_a>', 200, 10, 2, clock_timestamp()+interval '60 seconds', null, clock_timestamp());"
```

Session B ran the same command for the second binding with remaining 7
concurrently.
Expected: lock serialization and conservative minimum. Actual: both wrappers
returned `t`; final state was `available_count=2|observed_remaining=2`.
The later observational value was retained, but it could not raise
availability.

### Lease expiry while waiting on the budget lock

Session A executed `begin`, locked the provider budget with a no-op update, and
held it during `select pg_sleep(8)`:

```sh
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c \
"begin; update provider_rate_budgets set updated_at=updated_at where provider_id='<provider_id>' and scope_key='provider'; select pg_sleep(8); rollback;"
```

Before that lock, Session B’s lease was set to expire with this command, then
Session B invoked its canonical reservation call and waited on the budget lock:

```sh
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c \
"update ingestion_runs set lease_expires_at=clock_timestamp()+interval '2 seconds' where id='<run_b_id>';"
```

Expected: post-lock lease validation.
Actual: `ERROR: lease_lost`; it did not return configuration missing or create
a reservation. Session A then rolled back.

### Helper-stage response rollback

The permanent test 24 itself installs a transaction-scoped budget update
trigger after capturing every run and budget field, then calls the public
response wrapper. To reproduce the same helper-stage failure manually, run the
fixture derivation above, create a trigger whose body raises
`forced_header_helper_failure`, call `record_ingestion_response`, and query
all six run fields plus all eight budget fields before and after. Expected:
the trigger error rolls back both writes and every captured field compares
equal. The rerun produced `before=200|7|2|2` and `after=200|7|2|2` for the
same compact probe summary; test 24 additionally compares every captured field.
The exact trigger shape used by the permanent test is:

```sql
create or replace function public.slice_2c_test_fail_budget_header()
returns trigger language plpgsql as $$
begin
  raise exception 'forced_header_helper_failure' using errcode = 'P0001';
end;
$$;
create trigger slice_2c_test_fail_budget_header_trigger
before update on provider_rate_budgets
for each row execute function public.slice_2c_test_fail_budget_header();
```

The trigger and function must be dropped in the same disposable transaction.

After all probes, run the exact cleanup command:

```sh
SUPABASE_TELEMETRY_DISABLED=1 supabase db reset --local
```

This removes every disposable fixture. No `/private/tmp` file is needed for
reproduction; any temporary shell composition is generated from committed
test 24 source and is not evidence-bearing.

## Verification

Passed sequentially:

- full application suite: 34 files, 626 tests;
- `npx tsc --noEmit`;
- `npm run build`;
- `npm run lint`: 0 errors, 10 pre-existing warnings;
- clean `SUPABASE_TELEMETRY_DISABLED=1 supabase db reset --local` through
  migration 00006;
- targeted database test 24: 157 assertions;
- full database suite: 24 files, 640 assertions after the R3 test-only
  assertion expansion;
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
