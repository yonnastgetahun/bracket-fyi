# PHASE2-CONFLICT-RACES Final-schema race harness integration
project: BRACKET-FYI
done when:
  - [x] All three runners require a validated explicit disposable database.
  - [x] Business-conflict expectations select PT409 by default or explicit historical 40001.
  - [x] Existing barrier, rejection, state and rollback checks remain intact; syntax passes.
evidence: focused source diff and in-memory Python compilation; DB execution belongs to parent.

## Scope and behavior

Only the three race/review runners and this note changed. No migrations, SQL tests,
production retry/serialization handling, application code, commits or pushes changed.

All runners require `--database`; accepted names match
`bracket_[a-z0-9_]{1,55}` (9–63 total characters). This excludes `postgres`, connection strings, SQL
punctuation and overlength/truncated identifiers. The prefix is a naming guard,
not proof of disposability: the caller must supply an isolated disposable database.
Docker container and PostgreSQL role are unchanged.

`--business-sqlstate` accepts exactly `PT409` (default, current schema) or `40001`
(explicit historical schema). Each rejection still requires the selected code;
there is no accept-either fallback. Incarnation workers retain the exact
`window unavailable or stale` message and `2|2|4|0` state assertion. Lifecycle
nonzero exits, rollback/capture equality, generation, fanout, expiry, coronation,
replay and forward-repair assertions remain unchanged. Lock barriers still use
`pg_stat_activity` evidence.

The independent review's two catches are business-conflict probes (late enrollment
and invalid pick basis), not genuine serialization retry handlers. Only their
expected SQLSTATE is parameterized. Existing findings/reporting and rollback
boundaries are retained; this runner is not promoted to a new transition oracle.
`--barriers` passes both options directly to each runner's `main(argv)` instead
of patching `BASE` and global `sys.argv`. This avoids the lifecycle runner's
existing argument parser overriding or misreporting the selected database.

The lifecycle runner retains its existing `--fresh` historical RED/GREEN flow:
it now creates the explicitly supplied database, stops at migration 00006 and
requires `--business-sqlstate 40001`. It does not pretend to provision the current
schema. Existing database creation failures remain fatal; no reset/drop added.

## Invocations (not executed here)

From the repository root, against an already provisioned current-schema disposable DB:

```sh
python3 scripts/verify-event-lifecycle-races.py --database bracket_conflict_review
python3 scripts/verify-window-incarnation-races.py --database bracket_conflict_review
python3 scripts/verify-window-lifecycle-independent-review.py --database bracket_conflict_review --barriers
```

Each command defaults to PT409; `--business-sqlstate PT409` is also explicit.
Historical-schema runs append `--business-sqlstate 40001`. For the retained
historical provisioning flow, choose a fresh, unused name:

```sh
python3 scripts/verify-event-lifecycle-races.py --database bracket_lifecycle_historical_001 --fresh --business-sqlstate 40001
```

Independent probes roll back. Barrier harnesses retain synthetic fixtures, as
before. Current/historical DB provisioning and transition/SQL assertions belong
to the parent integration owner.

## Verification

In-memory `compile(source, path, "exec")` passed for all three files; no pycache
written by this check. Focused before/after diffs inspected. No runner execution,
Docker, database or browser calls performed. Runtime/DB acceptance is unverified
by this change and remains with the parent.
