# NO defensive repairs — independent skeptic 2

Date: 2026-10-28. Source inspection only; no database/Docker calls, no source edits, no deployment, merge, sends or purchases.

## Work item

project: BRACKET-FYI

done when:
- [x] Challenge NO-01/NO-02 against exact migration, forward-repair and probe source.
- [x] Identify authority timing gaps and a falsifiable regression oracle.

evidence: source locations and dispositions below. Only this report written.

## Disposition

**NO-01 supported, conditional on installed default ACLs; not independently runtime-reproduced here.** Migration `20261006000002_ingestion_evidence_and_delivery.sql:1086-1123` revokes browser-role access but only *adds* selective service grants; GRANT SELECT/INSERT/UPDATE does not remove preexisting TRUNCATE. Migration00007:304 revokes all on four new control/subscription/snapshot tables, not legacy notification_outbox or notification_attempts. Its :306-327 guards are row INSERT/UPDATE/DELETE triggers, not statement TRUNCATE triggers. RLS does not protect TRUNCATE. The earlier immutable-evidence-grants migration explicitly revokes TRUNCATE for three other evidence tables, not these two. Neither 00007 nor 00008 forward repair closes this gap: stopping admissions is not an ACL repair, and 00008's revoke-all table list excludes notification history.

Attempted disproof: foreign-key protection could reject truncating outbox alone; the supplied probe instead truncates attempts and outbox together, defeating that objection. A role without inherited TRUNCATE would be safe, so source alone does not establish every installation is vulnerable. The probe explicitly installs `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES ... service_role`, reproducing the stated Supabase premise rather than proving the production catalog. The report records actual catalog/erasure evidence; that historical execution was not rerun by this reviewer.

**NO-02 supported by SQL structure; repair limited to registry locking is incomplete for late command-lock waits.** Migration00008:53-60 evaluates credential/principal active and credential expiry in the locking SELECT's WHERE, then evaluates grant active/expiry in another locking SELECT's WHERE. A conflicting lock released without row modification need not trigger predicate re-evaluation. More importantly, even a refreshed credential check immediately after its own lock can become stale during the later grant lock. Principal-row waits also extend credential lifetime in the same joined query; principal has no expires_at, so its regression must expire the credential or grant while holding the principal row, not invent principal expiry.

Attempted disproof: global-control serialization does not rescue this issue. `event_operator_command:74-75` locks global control before invoking the verifier, which correctly protects expiry during that specific wait; owner registry locks are independent. Revocation through an actual row update has different PostgreSQL row-recheck semantics and is not established broken by these unchanged-row expiry probes.

**Later lock timing:** command :96 locks provider_bindings and :100 locks contests *after* the sole verifier call. Even a correct post-registry-lock verifier can return while valid and then wait past expiry on those rows. Revalidate once those explicit resource locks are acquired, before response or mutation dispatch. Nested mapping/projector calls, row inserts, unique-index conflicts, FK checks, triggers and audit insertion can introduce further waits. A final authority check after branch work and before returning (raising 42501 to roll back all transactional writes) provides a narrow additional defense against those waits; retain pre-dispatch validation too. This is not a guarantee of validity at transaction COMMIT: a caller can delay commit after function return. Explicitly document the intended acceptance/linearization boundary rather than promise continuous wall-clock validity. No external effects should occur inside this transaction.

## Probe quality and rejected overclaims

Read `scripts/verify-notification-operator-independent-aebe.py` and imported `verify-event-lifecycle-races.py:51-99` without executing either.

- Barrier workers actually `SET ROLE service_role`; blocker runs owner transaction. Each uniquely named worker must be observed in pg_stat_activity with wait_event_type='Lock' before expiry is polled against the database clock and blocker released. This is materially stronger than arbitrary sleeps. Exact blocker identity via pg_blocking_pids would further tighten attribution.
- Current extra-mode registry probe sets ten-second expiry and executes **global.stop**, not the report's two-second **health.read** narrative. Thus reject an assertion that the current script exactly reproduces that narrative. The same verifier path is exercised, but archive exact command/output with regression evidence.
- Extra-mode registry results are printed, not asserted to be denial or acceptance. TRUNCATE counts are also printed; after a correct ACL repair, ON_ERROR_STOP aborts on the first expected denial and never reaches later extra probes. This script is an exploratory counterexample harness, **not a repair acceptance test**. A clean process exit is insufficient proof.
- Principal-row wait and credential-expiry-during-grant-wait are absent. So are binding/contest/nested waits after verifier return. Current grant probe expires grants, not the credential while only grants are locked.
- NO-01 is infrastructure-role authority/integrity failure, not evidence of anonymous/browser exploitation. TRUNCATE does not prove arbitrary user notification disclosure. NO-02 does not independently establish active-flag revocation bypass.

## Narrow repair and acceptance recommendations

1. Explicitly revoke TRUNCATE on public.notification_outbox and public.notification_attempts from PUBLIC, anon, authenticated and service_role in applicable install and additive upgrade/forward-repair paths. Preserve legitimate legacy row-writer privileges. Recheck effective inherited membership ACLs; do not assume direct REVOKE removes grants through other group roles. Audit REFERENCES/TRIGGER separately without broad unrelated behavior changes.
2. Acquire credential/principal and exact-scope grant locks without trusting time-sensitive WHERE predicates as the final authorization decision. After all registry waits, use one freshly sampled clock_timestamp to validate credential active/expiry, principal active, and at least one exact environment/event/action active unexpired grant. Preserve multiple-grant semantics: an expired duplicate must not hide a valid grant. Deterministic lock ordering avoids unnecessary deadlock exposure.
3. Revalidate after explicit binding/contest locks and at final transactional return boundary as above, including credential expiry after grant waits. Fail 42501 with no successful DTO, audit or version/state change.
4. Parent's serialized disposable DB tests should assert actual service TRUNCATE denial for attempts and joint attempts/outbox, unchanged counts, and valid RPC behavior. Exercise clean default-grant install and additive repair applied twice with evidence preserved.
5. Assert exact SQLSTATE 42501 for credential, grant, principal, credential-during-grant, binding and contest wait cases after observed blocking plus database-clock expiry. Include nonexpired successful control cases and revoked-row cases. For mutations assert rollback of audit, version and business rows, not only stderr text. Include a deterministic late nested/audit wait case if final revalidation is adopted.

changed: this report only.
matters: corroborates both findings while narrowing their evidence and preventing an incomplete timing repair.
checks: scoped SQL/probe inspection; no runtime tests permitted or claimed.
risk: installed ACLs and runtime repair behavior require parent-owned serialized disposable DB proof; current probe narrative and executable source differ.
verdict: HOLD for acceptance until the above targeted assertions pass; defensive repair is justified.
