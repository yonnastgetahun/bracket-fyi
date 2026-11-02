# NO01 / NO02 authority repair

project: BRACKET-FYI
done when:
- [x] Forward migration and repeatable repair revoke notification-history TRUNCATE and assert effective application-role denial.
- [x] Registry locks precede fresh active/expiry validation; all exact-scope grants are considered.
- [x] Resource-lock and final post-audit revalidation propagate 42501 for atomic rollback.
- [x] Focused SQL and PID-attributed race regression scripts implement the required assertions.
- [ ] Parent executes fresh/populated/repeated-repair SQL and race tests successfully.
evidence: static results below; runtime commands provided, not executed by this author.

Criteria were written before implementation; checked source claims are not runtime acceptance.

## Scope and ownership

Approved P8 notification integrity / P9 operator authority / P12 additive transition. Read approved spec/plan, all three NO skeptics, independent notification/operator report, exact 00008 command/helper source, delegated mapping source, and existing SQL/barrier fixtures.

Only these five files authored:

- `supabase/migrations/20261027000011_notification_operator_authority_repair.sql`
- `supabase/rollbacks/20261027000011_notification_operator_authority_forward_repair.sql`
- `supabase/tests/database/DB37_notification_operator_authority_test.sql`
- `scripts/verify-notification-operator-authority-races.py`
- This report.

No earlier migration, shared transition harness, application file or other report changed. No DB/Docker execution, commit/push, deployment, provider call, send or purchase.

## Design

### NO01

Explicit TRUNCATE revocation from PUBLIC, anon, authenticated and service_role on both notification history tables. Existing row-write privileges and historical rows remain untouched.

An immediate catalog assertion uses `has_table_privilege` for each application role/table, including effective inherited privileges. Unexpected group-role TRUNCATE inheritance **fails the migration transaction with 42501**, rather than silently claiming that direct REVOKE removed inheritance. That exceptional installation needs its group ACL repaired by its owner; this migration intentionally does not rewrite arbitrary group roles. Standard default-ALL grants are handled.

### NO02

Credential is locked by hash only, principal by stable ID, then all exact environment/event/action grant candidates in ID order. No expiry/active predicate is trusted before locking. Records are held under SHARE locks through the transaction. The greatest active candidate deadline preserves any-valid-grant semantics (including valid alternatives alongside expired/inactive duplicates). After all registry waits, one fresh `clock_timestamp()` validates credential and grant deadlines plus active principal/credential flags. Principal has no expiry field.

Command source is reproduced exactly from 00008 except CREATE OR REPLACE and two added verifier calls:

1. After binding/contest resource selection and before optimistic-version checking/dispatch.
2. After delegated branch work **and audit INSERT**, immediately before return.

Initial verifier remains. A final denial is uncaught: PostgreSQL rolls back business writes, versions, nested changes and audit together. No external effects are introduced. Helper remains private, command remains service-only; arguments, return contracts, payload/version handling and error behavior outside new expiry rejection remain intact.

Boundary: authority is fresh at final command validation, **not guaranteed through an arbitrarily delayed client COMMIT**.

## New regression oracles

DB37 creates a rollback-only synthetic protected intent through actual consent/reconcile/emit/admit RPCs. It asserts nonempty protected history; effective ACLs; service attempts-only and combined attempts/outbox TRUNCATE both raise exactly 42501; full history JSON remains identical; legacy DML and RPC/helper ACL contracts remain.

Race script accepts only disposable local database names. `--fresh` creates a new database with Supabase-style default ALL grants and installs current migrations. `--database` uses an already migrated disposable database. Fixtures use fresh namespaces; no shared harness import or modification.

For each worker, the script records its actual PID, intended blocker PID, wait event and `pg_blocking_pids`. It checks the blocker holds a granted lock on the named relation (or the audit advisory lock). Authority must still be valid at the observed barrier; actual DB-clock expiry is polled before blocker release. Timing never substitutes for lock/expiry evidence. Worker errors must be verbose SQLSTATE **42501**; timeouts, deadlocks and generic failures fail the test. Denials require no successful DTO and full equality of business/version/audit/history snapshots.

Each matrix includes 30 attributed barriers:

- Credential, principal and grant waits crossed with **both** credential and grant expiry.
- Global-control grant expiry.
- Binding, contest, delegated mapping-row and AFTER-audit-insert waits crossed with both expiry types.
- Additional post-audit global-stop, result and manifest rollback.
- Actual credential/principal/grant revocation updates under blockers.
- Unexpired successful controls for all seven registry/resource/delegated/audit blocker classes.
- Multiple valid grants: one expires while another remains valid → accepted; all expire → 42501.
- Additional non-barrier positive assertion: inactive/expired duplicates do not hide a valid grant.

The audit barrier is an owner-installed fixture-only AFTER INSERT trigger taking a known advisory lock. It deliberately runs after branch mutation and the audit row insertion, proving a pre-audit-only check is inadequate. The trigger/function is dropped in `finally`; synthetic business/evidence rows remain in the disposable DB for inspection.

Runs matrix once, snapshots populated data, applies the identical forward repair twice (asserting unchanged data after each), reruns DB37 and the complete matrix. Expected **60 barriers** total. This is an expected count, not an execution result.

## Parent-owned exact commands

Fresh default-ALL installation, focused SQL, matrix, populated forward repair twice and repeated matrix:

```sh
/Users/yonnasgetahun/clawd/bin/exec -- python3 /Users/yonnasgetahun/bracket-fyi/scripts/verify-notification-operator-authority-races.py --fresh
```

Existing parent-created **already migrated** disposable DB (replace only the concrete disposable name; the parser rejects production/default names):

```sh
/Users/yonnasgetahun/clawd/bin/exec -- python3 /Users/yonnasgetahun/bracket-fyi/scripts/verify-notification-operator-authority-races.py --database bracket_lifecycle_012345abcdef
```

Standalone SQL, via parent's existing psql runner: execute the full contents of `supabase/tests/database/DB37_notification_operator_authority_test.sql` with `ON_ERROR_STOP=1`, and reject any TAP `not ok` or mismatched plan/count. The race command does this automatically.

For prior populated-00010 upgrade, parent must first apply 00011 (or its identical forward repair) to that isolated DB, then use `--database`. No clean-install result is represented as proof of an independently preserved populated upgrade baseline. Existing DB34 contract suite should also remain in the parent's normal isolated transition/suite run.

## Static checks actually performed

- Python compile / AST parse: passed.
- Migration and forward-repair bytes identical: passed.
- Extracted command compared to exact 00008 source after removing only CREATE OR REPLACE and the two added checks: byte-for-byte identical.
- `git diff --check`: no diagnostics at author check time.
- PostgreSQL parser/runtime unavailable by task policy; `pglast` not installed; no package installed.
- Migration/repair SHA-256: `efc5c242e3c6f05430dc4b620165d0b9eabb156331ca15f5c6571000403a404c`.

## Remaining risk / disposition

SQL installation, pgTAP outcomes, actual blocking/error/rollback observations, and harness behavior are **unverified** until the parent runs them. Script depends on existing local Docker/Postgres roles/extensions and frozen DB34 fixture prefix, not hosted credentials. A slow host that lets the five-second authority deadline expire before the observed barrier fails setup rather than generating a false pass; increase the fixture TTL only if evidence shows that setup limitation. No generalized proof of every delegated code path or commit-time expiry guarantee is claimed.

changed: additive migration/identical repair, rollback-only SQL, strict deterministic race oracle.
matters: removes history-erasure privilege and authority expiry acceptance after registry/resource/delegated/audit waits.
checks: static only; no DB execution by author.
risk: parent-owned fresh/populated transition and runtime acceptance still required.
verdict: **iterate — implementation ready for serialized parent verification, not accepted from source alone.**
