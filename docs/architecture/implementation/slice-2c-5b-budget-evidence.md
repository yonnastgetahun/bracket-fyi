# Slice 2C.5B provider budget evidence

**Evidence date:** 2026-10-11

## Status and evidence ceiling

Slice 2C.5B-R4 is implemented as of 2026-10-11 from baseline
`f2458d1cc4c6454162a3a76e43c6d76451747fa8` and remains pending independent
acceptance review. Evidence is limited to local synthetic TypeScript and
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

R4 adds a committed, self-contained probe runner without broadening application
implementation scope:

- `scripts/verify-slice-2c-5b-budget-probes.sh` embeds its fixture SQL,
  derives both canonical attempt keys, coordinates genuine overlapping
  sessions, validates all five required invariants, and resets the local
  database before setup and after completion or failure;
- the 2C.5B inventory includes the probe runner and the packet/plan files used
  for approved status maintenance.

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

Run exactly:

```sh
bash scripts/verify-slice-2c-5b-budget-probes.sh --ack-reset-local
```

Successful machine-readable output from the 2026-10-17 run was:

```text
R4_PROBE same_key=pass a=reserved|9 b=replayed|9 reservations=1
R4_PROBE expired_window_reset=pass a=reserved|8 b=reserved|9 available=8 reset_future=true
R4_PROBE concurrent_headers=pass a=t b=t state=2|2
R4_PROBE lease_expiry_while_blocked=pass error=ERROR: lease_lost
R4_PROBE helper_rollback=pass
R4_PROBE status=pass
R4_PROBE cleanup=reset_pass
```

The reservation pair proves one immutable row and one decrement for an exact
same-key replay. The expired-window pair proves one replenishment without
over-credit. The two-binding header pair proves serialized conservative
availability. The blocked lease pair proves post-lock expiry returns
`lease_lost`. The helper-stage pair compares all six run fields and all eight
budget/provenance fields before and after the forced failure. The runner exits
nonzero on any failed invariant and leaves no fixture object, trigger, or
function after its cleanup reset.

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
availability to be the conservative value 2, never an increase.

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
