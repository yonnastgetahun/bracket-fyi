# NO-01/NO-02 — independent skeptic 1

Date: 2026-10-28. **Disposition: both defects supported by source; runtime repair acceptance remains unverified.**

project: BRACKET-FYI

done when:
- [x] Baseline claims challenged against exact SQL and probe implementation.
- [x] Narrow repairs and post-lock validation timing documented.
evidence: source locations and supported/rejected/uncertain findings below.

## Scope and evidence standard

Read `phase-2-notification-operator-independent.md`, migrations `20261027000007_event_notifications.sql` / `20261027000008_event_operator_controls.sql`, their corresponding forward-repair files, inherited notification ACLs, `scripts/verify-notification-operator-independent-aebe.py`, and its actual barrier helper in `scripts/verify-event-lifecycle-races.py`. Source inspection only: no database or Docker calls. The prior report's runtime observations are attributed evidence, not independently rerun here. This uniquely named report is the only authored artifact; no source edits, deployment, merge, external messaging or purchase.

## NO-01: supported, with an environment qualification

- 00007:306–327 uses an invoker **row** trigger for INSERT/UPDATE/DELETE. Neither that trigger nor RLS guards TRUNCATE. The current-user service-role check therefore does not defeat the proposed bypass.
- The earlier `20261006000002_ingestion_evidence_and_delivery.sql:1086–1123` revokes browser-role privileges but only adds SELECT/INSERT/UPDATE grants for service_role. GRANT is additive, not an allowlist that removes preexisting TRUNCATE. No revocation on the two notification tables appears in 00007 or 00008's scoped hardening.
- The 00007 forward repair only disables notification control. The 00008 forward repair hardens its enumerated registry/runtime/operator/attempt tables and provider mappings; it does not include notification_outbox or notification_attempts. Neither repairs this bypass.
- Attempt to disprove via foreign-key protection fails: the oracle truncates attempts alone, and truncates attempts plus outbox together for the referencing-table case. It does not rely on CASCADE or ownership.
- Important qualification: the independent harness explicitly installs `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES ... TO service_role`. These defaults are a fixture assumption, not something the cited ingestion migration itself creates. This establishes a real vulnerability under those inherited ACLs; it does not prove every PostgreSQL install grants TRUNCATE. The prior installed-catalog observation supports that environment, but I did not inspect a live catalog.

**Rejected interpretation:** RLS or the protected-row trigger makes inherited TRUNCATE harmless. Also reject claiming the application SQL itself explicitly grants TRUNCATE in the cited ingestion section.

**Narrow repair:** explicitly `REVOKE TRUNCATE ON public.notification_outbox, public.notification_attempts FROM PUBLIC, anon, authenticated, service_role` in install and additive forward repair. Preserve legitimate legacy DML. Verify effective role privileges as well as direct ACL entries, since a different inherited group membership would need its own revocation. This is not a request to redesign all table grants.

## NO-02: supported; helper-only repair is insufficient for later waits

00008:54–60 filters credential/principal and grant rows by active/expiry while selecting them `FOR SHARE`. This does not establish a fresh time boundary **after** an unchanged row lock wait. `clock_timestamp()` being volatile does not move the predicate evaluation after row-lock acquisition. A conflicting transaction that updates the row may force re-evaluation; an unchanged locked row is precisely the counterexample, so the finding does not establish broken active-flag revocation.

There are two separate expiry windows even within the helper:

1. Credential/principal row wait can cross credential expiry before the first SELECT returns.
2. The credential can expire while the subsequent grant query waits, even if that grant never expires. Checking credential freshness immediately after only its own lock would not fix this.

**Narrow helper repair:** identify and lock the credential and principal by stable identity, lock exact-scope grant candidates, and only then evaluate active flags, exact environment/event/action and both expiry values using one freshly sampled `clock_timestamp()`. No active/expiry predicate should be the sole post-wait oracle. Fail closed on missing rows. Multiple grants are legal: do not accidentally reject a valid alternative just because an arbitrary expired candidate was selected. Preserve SHARE locks through the transaction and private helper ACLs.

### Later command locks are an additional required boundary

`event_operator_command` takes global control at line 74 and invokes the verifier at line 75, but only **afterward** takes provider binding UPDATE locks at line 96 and contest UPDATE locks at line 100. Therefore, repairing only `assert_event_operator` still admits this sequence: valid helper result → blocked binding/contest lock → actual expiry → command result/mutation. Global serialization does not stop unrelated owner/direct writers from holding these narrower locks, and does not freeze time.

A fresh authorization check after the top-level binding/contest lock is necessary but not sufficient for a blanket claim about all command waits. `mapping.review` calls the underlying mapping upsert; `replay.project` calls projectors with later observation/reference/canonical-row locks (see `20261027000004_security_boundary_repair.sql:116,141–148`); result insert paths can also encounter advisory/trigger/constraint waits. An entry-only check before those calls leaves another expiry window.

**Recommended bounded defense:** retain initial authorization, revalidate after the immediate resource locks, and add a final fresh authorization validation after delegated SQL work **and the audit INSERT**, immediately before returning success. Let any 42501 propagate so the SQL command's mutations and audit roll back atomically. Existing authority rows remain locked, so their active/scope state is stable, but expiry must still be sampled afresh. If the helper can choose an alternative grant on recheck, its locking and fresh validation must cover any new candidate too. This protects against waits inside the command without invasive projector changes; it relies on these commands remaining transactional database work with no external side effects.

Define this as authorization at the final command validation boundary, not a guarantee that credentials remain valid until an arbitrarily delayed caller COMMIT. PostgreSQL row locks cannot freeze wall-clock expiry. No commit-time guarantee is established here.

**Rejected interpretations:** global-row-first locking fixes registry-row waits; `clock_timestamp()` in WHERE automatically rechecks after a lock; one post-credential check covers a later grant wait; one repaired helper call covers later command locks.

## Existing oracle: useful counterexample, not repaired acceptance

- The barrier helper really starts workers as service_role, observes their unique application names waiting with `wait_event_type='Lock'`, invokes the pre-release expiry check, then releases the blocker and returns exit code/stdout/stderr. It does not infer the barrier from sleep alone. The expiry check uses actual DB time.
- It observes a generic Lock wait rather than validating `pg_blocking_pids` against the intended blocker. In its isolated fixture with a single deliberate blocker this is persuasive, but stronger repair tests should prove blocker identity and the targeted row.
- **Reproduction mismatch:** the checked-in extra-mode registry probe uses `global.stop` and ten-second expiry, whereas the report describes health.read and two-second expiry. This does not invalidate the SQL defect, but the current script does not exactly reproduce that narrative. Extra mode must be used for registry probes; normal mode tests the global-control wait.
- Registry extra mode prints returned results without asserting denial/success. Baseline TRUNCATE extra mode expects SQL success and prints counts; it will stop on an intentional repair denial. Thus the script is a baseline counterexample tool, not a post-repair green test.
- Principal-lock waits, later binding/contest waits and nested command waits are absent from the extra-mode registry probe. It also does not isolate credential expiry during a grant wait with the grant itself remaining valid.

## Minimal serial DB acceptance for parent

1. Seed protected attempts/intents and prove actual service-role TRUNCATE of attempts and combined attempts/outbox raises 42501; retained row identities/counts unchanged. Check effective ACLs for service/browser/PUBLIC exposure, while preserving legitimate notification RPC behavior.
2. On fresh installation and forward repair applied twice, test credential, principal and grant row blockers separately with unchanged locked rows. Wait until actual credential/grant expiry before release; require 42501, not merely nonzero exit.
3. Explicit cross-row case: credential expires during grant wait while grant remains valid. Add valid-control and active-revocation cases, including multiple grants with one valid candidate.
4. Block a binding and a contest after entry authorization; release after actual expiry. Require denial and unchanged resource/version/audit state. Include a delegated projector or mapping lock to test the final-check defense rather than only top-level locks.
5. Test missing singleton, wrong scope, unauthorized caller, unchanged valid command behavior, and rollback of mutations/audit when final revalidation fails. Do not interpret deadlock, timeout or version-conflict errors as authorization-test success.

changed: only this review report.
matters: supports both defensive repairs and identifies the remaining later-lock expiry window and oracle limitations.
checks: exact SQL/probe/helper source inspection; no runtime checks claimed.
risk: inherited live ACLs, executable repair and repaired lock-race outcomes remain for parent's serialized disposable DB verification.
verdict: **iterate** — implement bounded repairs; accept only after the stated behavioral oracle passes.
