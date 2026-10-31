# Window post-repair independent review

Date: 2026-10-27. **Verdict: ITERATE — original F2/F3/F4 reproductions blocked; one Medium version/cutoff transition defect remains.**

## Scope and method

Read repository AGENTS.md, repair report, migration 00003, DB29, original window review and skeptical reproductions 1/2, and 00002 constraints. Read review skill; explicit bounded assignment supersedes its branch-diff/subagent workflow. Source read-only; only this report written. No migration application, schema edits, provider/hosted calls or commits.

Done criteria: independently execute original-path regressions; probe alternate transition paths; explicitly distinguish accepted invariant repairs from remaining gates. All DB commands target local `supabase_db_bracket-fyi`, via guarded wrapper and `docker exec -i ... psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres`. Synthetic transactions only, explicit ROLLBACK. Adverse commands run as actual service_role; fixture bootstrap uses postgres.

## Executed results

| Check | Independent result |
| --- | --- |
| Entire DB29 | **47/47 pass**, ROLLBACK |
| Unchanged database test 28 | **25/25 pass**, ROLLBACK |
| Additional service evaluation DELETE/reINSERT attempt | **Bypass disproved**: restrictive window FK rejects DELETE (23503), replacement INSERT rejects duplicate key, new c choice rejects (22023); generation stays 3, historical pick stays configuration v1. Deliberately optimistic exploit assertions yielded 5 failed / 36 assertions, not a product-test failure. ROLLBACK; synthetic template count 0. |
| Additional delete/recreate window ABA probe | **6/6 counterexample/control assertions pass**; old version becomes valid again and cutoff extends. ROLLBACK; synthetic template count 0. |

## Original findings disposition

- **F2 immutable published snapshot: accepted within window-manifest scope.** Same-version manifest UPDATE, unsealing and DELETE reject; service TRUNCATE unavailable. Separate v2 publication retains v1. Explicit adoption moves only the adopting league, increases its generation and window version, and rejects after a successful prediction. Association guard prevents switching templates under an existing evaluation. Validation covers market identity, assignment and choices, not the full graph/scoring contract.
- **F3 semantic cutoff membership INSERT/UPDATE/DELETE: accepted for original paths.** DB29 includes an independent no-picks, no-membership-seal, no-sweep fixture: all three service commands reject solely due to elapsed cutoff. Owner-trigger paths also reject; window identity mutation rejects. First prediction seals membership before cutoff. Full manifest projection required before submission; advance preserves original pick mapping and locks the original pick.
- **F4 NULL expected version: accepted.** Actual service submission rejects NULL and zero with 40001, without generation change; valid version succeeds. Existing nonnull stale-version control passes. SQL explicitly rejects nonpositive versions; negative values were source-reviewed, not separately executed here. Runtime TypeScript validation was not independently rerun.
- **Generation correctness:** DB29 proves DELETE creates an obligation, revision adoption increments the league plus each changed window, unadopted league remains unchanged, and rejected operations remain atomic. ABA counterexample still records every generation increment; the remaining defect is optimistic-version reuse and deadline policy, not missing generation.

## WPR1 — Medium: allowed delete/recreate reuses an obsolete version and bypasses no-later-cutoff rule

Locations: `20261027000003_window_integrity_repair.sql`, `configure_event_window` DELETE/INSERT branches and `protect_event_window` UPDATE-only version/cutoff checks; initial version default in 00002. DB29 explicitly permits deletion/rebuild before seal but never checks version continuity across that transition.

Actual service-role sequence, before any predictions or cutoff:

1. Create open w1 with version 1, cutoff tomorrow.
2. Configure cutoff to one hour from now: version becomes 2.
3. Submit expected version 1: **40001 rejected**, positive control.
4. Delete w1 using expected version 2; recreate same logical key using create version 0, cutoff two days from now.
5. Recreated version is **1**, cutoff is later than the original.
6. Identical previously stale version-1 submission **succeeds**.
7. Generation is correctly 6: initial 1 + create + tighten + delete + recreate + submit.

This is a supported-command ABA defect, not owner bypass. No post-cutoff or post-prediction mutation is demonstrated: sealing controls still work. However an old client token is resurrected for a changed eligibility basis, and a command pair bypasses the stated monotonic cutoff rule. Severity Medium given service-only configuration authority and pre-seal timing.

Required repair: retain per-logical-window version/deadline history across deletion (tombstone or durable incarnation/version allocation), prohibit reusing removed logical identities, or eliminate deletion once eligibility has been published. Whichever policy is chosen, the previously rejected expected version must remain invalid after recreation and deadline-extension policy must be explicit. Add both assertions to DB29. Do not treat generation increments as equivalent to window expected-version validation.

### Exact additional rollback probe

Use the initial DB29 fixture only: from BEGIN through the first event_league_windows INSERT, stopping before the second league INSERT. Append:

```sql
SET LOCAL ROLE service_role;
SELECT configure_event_window('b2900000-0000-4000-8000-000000000002','w1',1,'open',clock_timestamp()+interval '1 hour',true,ARRAY['m1']);
SELECT is((SELECT version FROM event_league_windows WHERE league_id='b2900000-0000-4000-8000-000000000002'),2,'cutoff tightening bumps version');
SELECT throws_ok($$SELECT submit_event_window('b2900000-0000-4000-8000-000000000002','b2900000-0000-4000-8000-000000000004','w1',1,'{"m1":"a"}')$$,'40001','window unavailable or stale','control old version rejected before recreation');
SELECT configure_event_window('b2900000-0000-4000-8000-000000000002','w1',2,NULL,NULL,NULL,NULL,true);
SELECT configure_event_window('b2900000-0000-4000-8000-000000000002','w1',0,'open',clock_timestamp()+interval '2 days',true,ARRAY['m1']);
SELECT is((SELECT version FROM event_league_windows WHERE league_id='b2900000-0000-4000-8000-000000000002'),1,'COUNTEREXAMPLE recreation resets optimistic version');
SELECT ok((SELECT cutoff>clock_timestamp()+interval '1 day' FROM event_league_windows WHERE league_id='b2900000-0000-4000-8000-000000000002'),'COUNTEREXAMPLE recreation moves cutoff later');
SELECT lives_ok($$SELECT submit_event_window('b2900000-0000-4000-8000-000000000002','b2900000-0000-4000-8000-000000000004','w1',1,'{"m1":"a"}')$$,'COUNTEREXAMPLE previously stale version accepted after recreation');
SELECT is((SELECT generation FROM event_league_evaluations WHERE league_id='b2900000-0000-4000-8000-000000000002'),6::bigint,'generation still records update delete insert submit');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
SELECT count(*) AS fixture_residue FROM templates WHERE id='b2900000-0000-4000-8000-000000000001';
```

The assertions intentionally assert the bad behavior to prove it; regression acceptance must invert the counterexample expectations.

## Remaining transition / acceptance gaps

- **Fresh/populated upgrade and migration-history reconciliation unproven.** This review did not apply migrations or reset DB. 00003 validates existing sealed manifests but does not reconcile pre-existing malformed window projections, orphaned historical picks from F3, or missing configuration references. New guards can fail closed on such states; they do not repair history. Rehearsal needs fixtures representing prior defects and explicit hold/disposition outcomes.
- Immutable version lookup and service RPC integration must use composite template/version identity and ordered configuration/adoption commands; no full caller/UI/worker integration acceptance.
- Post-prediction rebasing, changed membership dispositions, graph/feasible-world/scoring validation and historical repair remain separate work.
- Builder cutoff barrier evidence is not independently rerun here; no new concurrency, token-rotation, freeze-race, F1/security, or full lifecycle acceptance.
- Ordinary service generation/evaluation worker writes remain trusted operations; no claim against arbitrary privileged corruption.

## Fingerprints and verdict

Reviewed migration SHA256: `93591a6c6aaf2fdb2c6a3f4380fd984935c0d442149f3ac90f3b4d6d34352346`.
Reviewed DB29 SHA256: `68a6bd10954765f3c4a2e28aad1caa880597059fcb5c974c9b0134e2557938ca`.
Both match builder report.

changed: this review only; unrelated concurrent source changes untouched.
matters: independent acceptance of original-path repairs, plus demonstrated remaining ABA transition gap.
checks: DB29 47/47; DB28 25/25; six ABA proof assertions; rejected alternate evaluation-reset attack; rollback/zero fixture residue.
risk: WPR1 and listed transition/integration gates.
verdict: **ITERATE on WPR1; scoped original F2/F3/F4 regression repair credited, no full transition acceptance.**
