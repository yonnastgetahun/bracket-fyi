# Independent notification/operator acceptance

Date: 2026-10-27. **Verdict: HOLD — two newly reproduced authority/integrity findings; WL-01/02/03 corroborated on baseline.** Bounded review only; no application/runtime acceptance.

## Work item / boundaries

project: BRACKET-FYI

done when:
- [x] Fresh disposable DB probes check authority, fail-closed controls, direct-write bypass and transactional notification semantics.
- [x] Baseline lifecycle findings challenged and concrete results recorded.
- [x] Report separates supporting builder tests from independent evidence and untested integration.

Authored only this report and `scripts/verify-notification-operator-independent-aebe.py`. No production source edits, commits, hosted/provider requests or real sends. All SQL targets were newly created disposable databases in local Docker `supabase_db_bracket-fyi`, not its application `postgres` database. Main independent database: **bracket_lifecycle_e9f0153dab9c**. Installed 00005/00006 baseline, then 00007/00008; excluded in-progress 00009 and later migrations. Existing shared changes preserved.

Read repository rules, approved v1.0 P6/P8/P9/security requirements, notification report, scoped SQL/TypeScript/interfaces/tests, and prior lifecycle finding report. Review skill was inspected, but its branch-diff/subagent protocol does not fit this explicitly scoped independent child task; no broad standards pass inferred.

## NO-01 — P1: service-role TRUNCATE bypasses protected notification history

**Locations:** `20261027000007_event_notifications.sql:306-327`; inherited ACLs in `20261006000002_ingestion_evidence_and_delivery.sql:1086-1123`.

00007 deliberately blocks direct service INSERT/UPDATE/DELETE on protected notification rows through an invoker row trigger. Existing Supabase default privileges also include TRUNCATE. The migration never removes this privilege, and a row trigger does not intercept TRUNCATE.

Independent installed-catalog check:
- service UPDATE binding mode/fetch_enabled: false.
- service control INSERT/UPDATE/DELETE/TRUNCATE: false.
- service notification_outbox TRUNCATE: **true**.
- service notification_attempts TRUNCATE: **true**.

Actual disposable SQL, not just an ACL inference:

1. Owner counts **7 attempts / 7 protected**.
2. `SET LOCAL ROLE service_role; TRUNCATE notification_attempts;`
3. Count becomes **0**.
4. ROLLBACK restores them.
5. Separately count **14 intents / 14 protected**; service `TRUNCATE notification_attempts,notification_outbox;` succeeds; intents become **0**. ROLLBACK restores them.

Thus infrastructure identity alone can erase durable authorization/uncertainty and delivery dedup history, bypassing the claimed RPC-only boundary and potentially making stop falsely appear drained. No operator credential required. This is not a claim of an anonymous/browser exploit.

**Repair:** explicitly revoke TRUNCATE on both tables from public/service/browser roles in install and forward repair. Audit other inherited table-level privileges. Regression must exercise actual service-role TRUNCATE, not only DELETE and column mutation.

## NO-02 — P1: credential/grant expiry can pass while waiting on its own registry row

**Location:** `20261027000008_event_operator_controls.sql:50-64` (`assert_event_operator`).

The verifier combines `expires_at > clock_timestamp()` filtering with `FOR SHARE`. PostgreSQL can evaluate the predicate before waiting for a conflicting row lock; an unchanged row released after the expiry does not force a fresh expiry check.

Independent deterministic probe for **each** registry table:

1. Set synthetic credential and grants valid, then set the targeted credential/grants to expire in two seconds.
2. Another owner transaction holds `SELECT * FROM <target registry> FOR UPDATE`, without changing the row.
3. Service-role operator command reaches an observed `pg_stat_activity.wait_event_type = 'Lock'`.
4. Before release, query the actual database clock until all target rows satisfy `expires_at < clock_timestamp()`.
5. Release lock.

Both credential-row and grant-row cases returned successful **health.read** DTOs after expiry (exit 0), rather than 42501. This differs from waiting on the global control row: a separate independent test proved expiry during a global-row wait is correctly denied, because verifier execution starts after that wait.

**Repair:** acquire registry row locks first, then validate active/expiry of credential, principal and exact matching grant against a fresh timestamp after all authority locks are acquired. Recheck credential expiry after any grant wait as well. Add credential-row, principal-row and grant-row wait regressions. Revocation by actual row update was not shown broken; this finding is specifically expiry during unchanged-row lock waits.

## Independent positive checks

These are bounded behavioral results, not acceptance from counts:

- Missing singleton control row: actual service calls deny operator authority (42501), skip both result/structural projection, deny provider admission before budget reservation, deny notification admission as stopped.
- Credential expiry while blocked on global control: rejected after observed lock wait and actual expiry.
- Marker-stripping UPDATE of protected outbox rows and DELETE of protected attempts: both 42501. NO-01 bypass is table-level, not an incorrectly classified ordinary row edit.
- Installed catalog: no unexpected anon/authenticated EXECUTE on inspected notification/operator/provider-attempt/helper functions.
- Injected BEFORE INSERT outbox failure: broadcast RPC raises; announcement and notification audit roll back. Independent six-assertion transaction also injects failure into lifecycle commit after a canonical draw: completion remains locked and no coronation audit persists. All six assertions passed. Probe trigger/function and fixture transaction rolled back.
- Interface source: strict command schemas; local URL raw-spelling allowlist; opaque credential injection from environment; no caller actor; redirect errors; sanitized failures; no automatic retry of uncertain mutation; credential reflection rejected from JSON output. SQL exact environment/event/action and resource matching is explicit.
- Fake worker source: one-use start RPC, conservative RPC-roundtrip deduction from server start budget, ten-second transport timeout, fresh worker incarnation, no stored permit resume API. These are supporting source checks, not proof of hosted/device behavior.

## Supporting tests actually rerun

- Fresh independent DB before 00007: prior reviewer DB31/DB32 supporting SQL plus its three counterexample probes.
- 00007: DB33 **54 assertions** passed.
- Existing notification race harness redirected to independent DB: **9 observed lock barriers**, recording fake **4 sends**; restart uncertainty and additive forward repair twice. Stop-before-admit, admission-before-stop, issued-before-stop, correction, consent withdrawal, actual expiry/deadline, binding disable, competing workers. This is independently executed **builder-authored** evidence, not a newly authored race oracle.
- 00008: DB34 **45 assertions** passed, including exact scope, stale version, revoked/expired credentials/grants, rotation, old mapping RPC denial, direct result-write denial, fake-only controls.
- Explicit `BRACKET_OPERATOR_DB_TEST=1 npx vitest run tests/events/operator.test.ts tests/events/operator-db.test.ts tests/events/notifications.test.ts`: **3 files / 67 tests passed**. Operator DB test creates its own new disposable DB; actual stop/admit/project barriers, issued/uncertain reporting and forward repair exercised.
- No existing application DB was reset/migrated. No full suite, production build, runtime/application route, real provider, device or visual UI acceptance claimed.

Two attempts to run additional probes failed with local PostgreSQL **“database system is in recovery mode”** before executing probe SQL. These failed attempts are not counted. A subsequent run completed truncate and six atomicity assertions and registry-lock expiry probes.

## WL-01 / WL-02 / WL-03 skeptical disposition against 00005/00006

Re-ran prior independent reviewer probe in the newly created DB, and independently inspected the implementation for alternative explanations. All three stand on baseline; no claim about repair00009.

| Finding | Attempt to disprove | Observed baseline result |
| --- | --- | --- |
| WL-01 late enrollment after deleting first window | Check whether replacement membership-closure helper is actually called by surviving join RPC; inspect invitation/league status and live-window barriers | `event_membership_closed=true`, stored earliest deadline elapsed, yet valid invitation joins one participant. 00005 changes helper, not `join_event_league`; remaining second live window allows join. **Confirmed.** |
| WL-02 poisoned restart page | Check whether SQL scanner returns per-item errors or TS catches scan failure; independently healthy next league capture | Invalid legacy nullable pick basis raises 40001 in scan; next league captures successfully. Per-item sweep catch cannot catch failure before rows returned. **Confirmed**, limited to admitted legacy/invalid persisted basis, not normal submit. |
| WL-03 recurring-basis audit | Check if acknowledged recompletion is merely retry/no-op or has a fresh generation; inspect permanent unique basis index / ON CONFLICT | complete → held → expired hold → complete all acknowledge `replayed:false`; only first two evaluated transitions persist, coronations=1. Original basis recurs without generation bump. **Confirmed** audit omission; not double-coronation. |

Notification integration consequence: evaluated-audit INSERT is the hook; suppressed audit also suppresses hook execution. A hold-only cycle may not require a new final/score notification (and must not recrown); do not exaggerate this specific probe into proof of a missed user notice. Audit contract still fails.

## Reproduce

```text
/Users/yonnasgetahun/clawd/bin/exec -- python3 /Users/yonnasgetahun/bracket-fyi/scripts/verify-notification-operator-independent-aebe.py
/Users/yonnasgetahun/clawd/bin/exec -- python3 /Users/yonnasgetahun/bracket-fyi/scripts/verify-notification-operator-independent-aebe.py --extra bracket_lifecycle_e9f0153dab9c
```

First command always creates a new disposable DB. Extra mode rejects non-disposable names and is intended for the exact fresh DB produced by the first command. Truncate/atomicity transactions roll back. Registry expiry probes update only synthetic fixtures in that disposable DB. Printed counterexamples are findings, not passing acceptance.

## Fingerprints

SHA-256:
- 00005: `a3be839db1aaed9f7a7efb9b641b8f023a627eb4a98ece4a178dd3de26e05429`
- 00006: `55bbb1f26e926041c71ed869ad290d91b5757a5cc11865ba9c1daea67f2362d2`
- 00007: `36f453a18b35756f2cb52e0e03ad9dce4107dcae7e1d9827ec02b529638c9f2b`
- 00008: `441dfc54f7f704ac2cfd86f98068fedbc472c6b452590e226d67900da3debe55`

changed: report and uniquely named disposable probe only.
matters: exposed durable-history erasure and expiry-after-lock authority bypass; independently corroborated baseline lifecycle defects.
checks: actual disposable SQL, observed lock barriers, injected transactional failures, scoped 67-test run.
risk: two new findings unresolved; 00009 fixes and concurrently changing application/runtime excluded.
verdict: **hold**.
