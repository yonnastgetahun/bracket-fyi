# NO skeptic 3 — independent source review

Date: 2026-10-28. Verdict: **repair justified; runtime acceptance pending parent-owned DB proof**.

## Work item / scope

project: BRACKET-FYI
done when:
- [x] NO-01/NO-02 challenged against SQL, forward repairs and probe oracle.
- [x] Supported/rejected/uncertain conclusions and later-lock timing recommendations recorded.
evidence: this report; read-only source inspection, no database execution.

Only this uniquely named report authored. No SQL/source/test edits, database/Docker calls, deploy, merge, send or purchase. Existing unrelated changes preserved. Reviewed 00007/00008 install SQL and their named forward repairs, relevant preceding ACL/projection SQL, independent report/probe, and imported barrier implementation. Conclusions concern inspected baseline, not concurrently authored repairs.

## NO-01 — supported, with an environment qualification

**Evidence:** `supabase/migrations/20261027000007_event_notifications.sql:306-327` adds INSERT/UPDATE/DELETE row triggers. Neither trigger intercepts TRUNCATE. RLS also does not protect TRUNCATE. The earlier `20261006000002_ingestion_evidence_and_delivery.sql:1086-1123` removes browser-role privileges and adds selective service grants, but adding selective grants does not remove pre-existing defaults. `20261010000008_immutable_evidence_grants.sql` explicitly removes TRUNCATE from three other evidence tables, not notification_outbox/notification_attempts.

**Attempted disproof:** Foreign keys can prohibit truncating the outbox alone; that does not rescue attempts-only truncation or truncating both referencing/referenced tables together. Protected marker checks, immutable row triggers and stopping new work do not stop table-level removal. 00007 forward repair only disables/stops notification work. 00008 forward repair revokes authority-registry privileges and provider_entity_refs writes, but does not revoke notification-table TRUNCATE.

**Qualification:** The selective ingestion grants do not themselves grant TRUNCATE. The independent fixture explicitly establishes Supabase-style default ALL table grants before migration. Thus source supports an inherited-ACL defect under that configuration, not an unconditional claim that every clean PostgreSQL installation grants TRUNCATE. Reported installed-catalog/actual SQL evidence is prior reviewer evidence, not rerun here. Browser roles were already revoked on these tables; do not describe this as demonstrated browser access.

**Narrow repair:** Explicitly revoke TRUNCATE on both notification tables from PUBLIC, anon, authenticated and service_role in the install path and additive forward repair, preserving legitimate legacy row writes. Inspect effective inherited memberships as well as direct ACLs: a role can regain privileges through membership. Inventory REFERENCES/TRIGGER grants separately; no additional exploit is claimed by this review. A repeated forward repair must preserve rows and remain fail-closed.

## NO-02 — supported; verifier-only repair is incomplete for later waits

**Evidence:** `20261027000008_event_operator_controls.sql:50-64` combines active/expiry predicates with `FOR SHARE OF c,p`, then repeats the same structure for grants. An unchanged tuple can satisfy the filter before LockRows waits; release of an unchanged row does not require expiry re-evaluation. `clock_timestamp()` is fresh when evaluated, but its volatility does not force evaluation after acquiring the row lock. This is distinct from update-driven row rechecks and from transaction-start timestamp bugs.

**Attempted disproof:** The command's global `FOR UPDATE` precedes verification, explaining the passing global-lock expiry test, but does not prevent owner maintenance transactions holding registry rows. Registry SHARE locks prevent concurrent revocation updates after acquisition; they cannot freeze wall-clock expiry. A credential checked before a grant wait can expire during that wait even if the grant remains valid. A principal-row wait can delay the joined credential check and needs its own case.

**Later command locks:** `event_operator_command` verifies authority before the binding `FOR UPDATE` and contest `FOR UPDATE` branches. Therefore a repaired verifier can still return while valid, then the command wait until expiry on a resource row and proceed. `health.read` also obtains a binding UPDATE lock. Replay delegates to projectors with additional observation, advisory and contest locks: e.g. result projector `20261009000002_slice_2b_atomic_result_projection.sql:123-139,226` locks observation/binding and the contest-result advisory key. Mapping/upsert, result insert triggers/FKs, and audit insertion can introduce additional waits. The global lock serializes cooperating command paths, not every owner/direct transaction capable of holding a narrower row or advisory lock.

**Narrow repair:**

1. Acquire credential/principal and exact environment/event/action grant locks by identity/scope; then evaluate active flags and credential/grant expiries using a fresh database timestamp after all registry locks. Do not validate credential expiry only before a grant wait. Fail closed if any required row is missing.
2. Revalidate after resource locks before privileged work. Retain existing scope and optimistic-version checks.
3. To cover nested projector/trigger/audit waits without invasive lock hoisting, perform a final fresh authority validation **after command work and audit insertion, immediately before successful return**. Keep authority locks throughout. An expired authority must raise 42501 so the entire command, including nested writes and audit, rolls back. This recommendation relies on inspected SQL-only transactional effects, not external sends. A check before the audit INSERT alone misses audit/FK waits.
4. Define the authorization boundary precisely as successful command completion validation, not an impossible promise that expiry cannot occur between the last check and client commit. Parent-controlled transactions could otherwise wait arbitrarily before COMMIT. No need to change that API contract silently.

An equivalent implementation may preserve a locked, fully validated authority snapshot/deadline and compare its expiry after all work; it must not replace final freshness with `now()`/transaction timestamp or omit any registry identity/scope check.

## Existing probe oracle — useful counterexample tool, not repair acceptance

- `scripts/verify-notification-operator-independent-aebe.py` creates a random disposable DB and explicitly grants default table ALL privileges, faithfully exercising the claimed default-ACL case. `--extra` constrains the DB name and wraps truncate probes in rollback transactions.
- The truncate probes print before/after counts; they do not assert nonzero protected fixture counts or expected post-repair 42501. A successful corrected denial makes `extra_sql` raise due to ON_ERROR_STOP. This is expected for a counterexample reproducer, not a green regression.
- Registry-lock cases in current `--extra` set expiry to **10 seconds**, expire **all rows** of each targeted registry table, and call **global.stop**, not the report's two-second health.read description. The current main-path global-lock case expires the **health.read grant**, not the credential. These differences should be reconciled in evidence captions; they do not disprove the mechanism.
- Imported `verify-event-lifecycle-races.py:50-96` waits for a uniquely named service-role worker to show `wait_event_type='Lock'`, then waits against actual database expiry before releasing an unchanged blocker. This is materially stronger than sleeping and hoping. With only one intended blocker in an isolated DB, inference is reasonable; a stronger oracle should verify blocker PID/relation via pg_blocking_pids/pg_locks and assert the exact target rows were still valid when waiting began.
- Registry cases merely print worker return tuples. They do **not** assert baseline success or repaired rejection, and a zero exit code is not itself a parsed successful DTO. No principal-lock, credential-expiring-during-grant-wait, later binding/contest lock, or nested projector-lock acceptance coverage exists in this script.

## Required parent-owned regression evidence

Run fresh install and upgrade/forward-repair paths (including repair twice) in the parent's serialized disposable DB:

- Actual service TRUNCATE attempts-only and both-tables commands reject with 42501; protected rows/counts/dedup identities unchanged. Catalog checks include PUBLIC/browser/service effective privileges, with an explicit default-ALL fixture.
- Observe credential, principal and grant blocking separately; cross actual expiry; reject with 42501. Include a valid grant blocked while only the credential expires, and the reverse where applicable. Include unexpired successful controls.
- Observe later binding and contest waits after registry validation, plus a representative nested replay advisory/observation wait. Cross credential/grant expiry and reject; prove no result, mapping, manifest, stop/version or audit change survives. Exercise final-check rollback after nested writes, not only a pre-work rejection.
- Preserve the positive global-lock denial and scope/revocation/version behavior. Exclude setup failures, deadlocks and unrelated SQL errors from passing rejection counts.

## Disposition summary

**Supported:** Both baseline mechanisms and need for defensive repairs; registry-only timing fix insufficient for later command waits.

**Rejected:** Row triggers/RLS/stop are a TRUNCATE defense; a global-row lock makes all subsequent authority freshness automatic; current counterexample script is already a green repair oracle.

**Uncertain / unexecuted:** Installed ACLs on any other environment, runtime behavior of proposed repairs, update-revocation anomalies, and exact exploitability of every nested wait. No database results produced by this reviewer.

changed: this report only.
matters: bounds claims and prevents a verifier-only repair from overlooking later lock waits.
checks: exact source and probe/barrier inspection; no runtime tests.
risk: source-supported defects remain acceptance-blocking until parent-owned negative/positive DB proof.
verdict: **iterate**.
