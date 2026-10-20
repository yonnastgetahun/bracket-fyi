# Slice 2C.5B provider budget evidence

**R4 evidence date:** 2026-10-17
**R5 evidence date:** 2026-10-20

## Status and evidence ceiling

Slice 2C.5B-R5 is implemented as of 2026-10-20 from baseline
`16af580e84a78f63abda09728fb280c929ec2cbd` and remains pending independent
acceptance review. R4 was implemented and recorded on 2026-10-17. Evidence is limited to local synthetic TypeScript and
disposable-local PostgreSQL. No provider, credential, network, hosted,
deployment, notification, production, beta, or device activity occurred.
Slice 2C.5C remains gated, unapproved, and unstarted.

## Commits

- `0f35aca4e9ea5414f7261a28995c7a5b33a63d3e` — R1 budget-boundary remediation
- `33ccdec72de171d8f78f97879094da197aa18329` — `fix: correct slice 2c.5b header semantics`
- `ce9bc741ca439c8391b9e59d86fbdafaa062861a` — `docs: record slice 2c.5b-r2 evidence`
- `0fea413e691ed5b1dc2b557e4c7cd97941798f83` — `test: close slice 2c.5b rollback evidence gaps`
- `f2458d1cc4c6454162a3a76e43c6d76451747fa8` — `docs: record slice 2c.5b-r3 evidence`
- `6682c6d60b236aafa15f9265ff8f3e879bb1594b` — `test: add reproducible slice 2c.5b budget probes`
- `14b421ff78c0a4faf72c0a9515e6c2260694e7ef` — `fix: harden slice 2c.5b probe coordination`

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
- the execution packet contains the 00005/00006 2C.5B entries and identifies
  00007 as the future 2C.5C migration; the implementation plan records status
  only and does not contain a migration inventory.

R4 added a committed, self-contained probe runner without broadening application
implementation scope. The original R4 run was recorded on 2026-10-17:

- `scripts/verify-slice-2c-5b-budget-probes.sh` embeds its fixture SQL,
  derives both canonical attempt keys, coordinates genuine overlapping
  sessions, validates all five required invariants, and resets the local
  database before setup and after completion or failure;
- the 2C.5B inventory includes the probe runner and the packet/plan files used
  for approved status maintenance.

R5 hardens that runner without broadening application implementation scope:

- preflight validates the acknowledgement, required commands, fixed local
  database URL, and repository configuration before creating temporary files or
  resetting the database;
- reset, cleanup, worker waits, readiness polling, and lock coordination are
  bounded; the lock holder publishes readiness only after acquiring the budget
  row lock and the reservation waiter is observed waiting before lease expiry;
- EXIT, INT, and TERM cleanup tracks workers, validates temporary paths, uses
  `trash`, resets the disposable database, and proves the probe provider,
  functions, and triggers are absent;
- `--self-test` proves both deliberate assertion failure and timeout behavior
  without resetting the database.

## Permanent database coverage

Test 24 now has 157 assertions covering no-header provenance preservation,
delayed lower-remaining acceptance, fresh and expired-window stale-reset
rejection, out-of-order non-replenishment, current-window remaining=2 followed
by cost=1, future reset handling, equal-time ordering, and a transaction-scoped
helper failure after run metadata is written. The helper trigger is created and
dropped inside the pgTAP transaction; it is not a production object.

## Reproducible disposable probes

The committed runner is the authoritative reproduction procedure. It is
self-contained, uses only the fixed disposable local database URL, requires an
explicit reset acknowledgement, embeds all fixture SQL, derives both canonical
attempt keys, coordinates genuine overlapping sessions, and resets before setup
and after success or failure. It does not extract line ranges from test 24 or
depend on `/private/tmp` files.

The committed R5 runner is now the authoritative reproduction procedure. Run
exactly:

```sh
bash scripts/verify-slice-2c-5b-budget-probes.sh --ack-reset-local
```

The missing-acknowledgement guard was also run without resetting the database:

```text
command: bash scripts/verify-slice-2c-5b-budget-probes.sh
exit: 1
R5_PROBE reset=not_started reason=ack_required
```

The non-destructive self-test was:

```sh
bash scripts/verify-slice-2c-5b-budget-probes.sh --self-test
```

```text
R5_SELF_TEST wrong_assertion=pass timeout=pass status=pass
```

Three consecutive acknowledged runs completed on 2026-10-20. Representative
machine-readable output was:

```text
R5_RUN=1
R5_PROBE same_key=pass a=reserved|9 b=replayed|9 reservations=1
R5_PROBE expired_window_reset=pass a=reserved|9 b=reserved|8 available=8 reset_future=true
R5_PROBE concurrent_headers=pass a=t b=t state=2|2
R5_PROBE readiness=budget_lock_held
R5_PROBE readiness=reservation_waiting
R5_PROBE lease_expiry_while_blocked=pass error=ERROR: lease_lost
R5_PROBE helper_rollback=pass
R5_PROBE status=pass
R5_PROBE cleanup_reset=pass
R5_PROBE cleanup_objects=pass providers=0 functions=0 triggers=0
R5_PROBE cleanup_temp=pass
R5_PROBE cleanup=pass
```

The reservation pair proves one immutable row and one decrement for an exact
same-key replay. The expired-window pair proves one replenishment without
over-credit. The two-binding header pair proves serialized conservative
availability. The blocked lease pair proves post-lock expiry returns
`lease_lost`. The helper-stage pair compares all six run fields and all eight
budget/provenance fields before and after the forced failure. The runner exits
nonzero on any failed invariant and leaves no fixture object, trigger, or
function after its cleanup reset. Runs 2 and 3 produced the same pass set;
their serialized header final states were `2|7` and `2|2`, respectively. Both
satisfy the invariant that concurrent headers cannot increase availability above
the configured ceiling or the conservative accepted value.

### Same-attempt reservation

The runner launches two concurrent psql sessions with the same canonical
attempt key and requires one `reserved` plus one `replayed` result and one
reservation row.

### Concurrent reset

The runner sets an expired local window and launches distinct canonical retry
attempts concurrently. It requires one replenishment, no over-credit, and a
future trusted reset.

### Serialized headers from different bindings

The runner invokes the response wrapper concurrently from both bindings with
remaining values 2 and 7. It requires both wrappers to succeed and the final
availability to remain within the configured ceiling and never increase from
the initial state; lock serialization determines which accepted observation is
visible.

### Lease expiry while waiting on the budget lock

The runner holds the budget row in one session, expires the other run while it
waits, and requires the blocked reservation to return `lease_lost` without a
reservation.

### Helper-stage response rollback

The runner installs a temporary helper-failure trigger, captures all six run
fields and eight budget/provenance fields, invokes the public response wrapper,
and requires complete before/after equality. The trigger/function are removed
by the cleanup reset; no temporary repository object remains.

## Verification

Passed sequentially for the R3/R4 database evidence:

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
R5 script hardening and verification are limited to the local synthetic and
disposable-local evidence ceiling. Independent acceptance review remains
pending.
