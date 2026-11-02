# WPR1 independent ABA skeptic 2

Date: 2026-10-27. Scope: local installed SQL and independent rollback-only probes.

## Work item / done criteria

- [x] Inspect installed commands, privileges and contract.
- [x] Attempt to disprove ABA/deadline bypass with original probes and negative controls.
- [x] Report results, scoped exposure and smallest contract-preserving repair.

Evidence: local catalog SQL and synthetic transaction with explicit ROLLBACK; no source/schema changes.

## Verdict: WPR1 survives — Medium / ITERATE

Independent corrected probe: **28/28 assertions pass**, including three counterexample assertions (reuse with later cutoff, stale configuration token accepted, stale submission token accepted). Explicit ROLLBACK; synthetic template residue **0**. No code/schema/migration changes, retained fixtures, commits or network calls. Only this report written.

### Installed evidence and attempted disproof

- Actual local `supabase_db_bracket-fyi`, `psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres`. Retrieved installed `pg_get_functiondef` for configure/guard/membership helper. Compared installed `prosrc` to migration bodies for configure, guard, submit, membership helper and generation trigger: **all five exact matches after trimming**. Version column default is **1**.
- Source: `supabase/migrations/20261027000003_window_integrity_repair.sql:73–108,156–174,180–223`; SHA256 `93591a6c6aaf2fdb2c6a3f4380fd984935c0d442149f3ac90f3b4d6d34352346`.
- `configure_event_window` locks league → evaluation → window, requires exact version when present and zero when absent. DELETE physically forgets the row; INSERT omits version so default 1 returns. Guard returns OLD on DELETE before the UPDATE-only cutoff/version comparisons. Submission compares only current window version, not evaluation generation or an incarnation identifier.
- Cannot disprove via locking: the reproduction is sequential and fully supported; no race or owner DML required. Cannot disprove via generation: rejected operations preserved generation 4; accepted deletion/recreation generates work but does not participate in expected-window-token checks.
- Negative controls hold: wrong delete version fails 40001; absent window submission fails 22023; ordinary cutoff extension and erasure fail 23514; creation using former latest token fails 40001. First prediction blocks DELETE (23514). Separate expired-cutoff fixture blocks DELETE before sweep with membership_sealed=false and locked_at=NULL.
- Catalog ACL: anon/authenticated cannot EXECUTE configure; service can, but cannot directly DELETE windows. This is **service-only configuration exposure before any successful prediction / first cutoff**, not anonymous mutation, post-lock reopening, or a proven deployed UI exploit. Post-prediction and elapsed-cutoff barriers remain credited.

### Contract qualification

`docs/architecture/implementation/full-roadmap-execution-contract.md:44` and `docs/architecture/bracket-fyi-spec-v1.0.md:94` say **“never move a stored cutoff later automatically.”** They do not categorically prohibit every future explicit audited manual reschedule policy. Current command provides no actor/reason/override distinction authorizing that exception, and its ordinary UPDATE rejects *all* later cutoffs. Thus describe this as bypass of the implemented no-later-cutoff policy, rather than claiming the specification bans every conceivable manual reschedule. The optimistic-version ABA independently survives this wording qualification.

DB29 deliberately supports deleting/rebuilding an unopened, unscheduled draft. A blanket delete prohibition would remove supported behavior. A guard only against deleting currently-open rows is insufficient: this independent probe demonstrates legal open → unopened → open transitions before seal; historical eligibility cannot be inferred solely from current state.

### Smallest contract-preserving repair and regression

Keep the existing command signature and draft delete/rebuild behavior. Add durable per-`(league_id,window_key)` history holding last allocated version and earliest non-null stored cutoff. Under the existing league-first lock, retain it on deletion; on recreation allocate a strictly greater version and enforce retained cutoff (cannot erase it or move later). Update this history on **all** version/deadline changes, including configuration adoption and advancement, not only configure calls. Service must not mutate/delete the history directly. Seed from extant rows in the additive migration; previously deleted history cannot be reconstructed without evidence, so explicitly address that upgrade limitation.

This is smaller in contract surface than changing every expected-version caller to a compound incarnation token, and addresses both defects; generation-only allocation addresses ABA but not forgotten deadlines. A soft-delete/tombstone in the existing row is another implementation, but must keep deleted rows out of membership, advance, reads and submission, increasing query-change scope. Do not silently substitute “forbid deletion entirely” while claiming draft behavior preserved.

Regression acceptance: retain DB29 draft delete/rebuild; cache v1, change eligibility to v3, delete; reject recreated cutoff later than retained cutoff and null erasure; recreate at equal/earlier deadline with version >3; old v1 and v3 must reject both configure and submit with no picks/generation changes. Fresh token must succeed. Repeat deletion/recreation and include adoption-induced versions. Keep expired-cutoff, first-prediction, ACL, wrong-version and partial-projection controls. Tests asserting today’s counterexample behavior must be inverted, not retained as acceptance.

changed: this report only.
matters: independent supported-command reproduction confirms token resurrection and deadline-policy bypass.
checks: installed-body comparisons; 28/28 corrected independent assertions; ROLLBACK/residue 0.
risk: no concurrent race, hosted/UI integration or populated upgrade acceptance claimed.
verdict: **ITERATE; Medium WPR1 confirmed, scope limited as above.**

## Probe correction / negative finding

Initial probe attempted open + pairings_reviewed=false; installed row CHECK correctly rejected it (23514), so dependent ABA assertions were invalid (16/28 failed). Entire transaction rolled back, residue 0. Corrected the independent probe to transition to unopened while withdrawing review, then reopen with a tighter cutoff. This is a fixture correction, not a product fix; no schema changes.

## Original executed rollback probe (corrected)

All window mutations/submissions use actual service_role; bootstrap uses postgres.

```sql
BEGIN; SELECT no_plan();
INSERT INTO templates(id,name,type) VALUES('a6b20000-0000-4000-8000-000000000001','SYNTHETIC ABA skeptic2','bracket');
INSERT INTO event_template_configs(template_id,version,sealed,manifest) VALUES('a6b20000-0000-4000-8000-000000000001',1,true,'{"markets":[{"id":"game","windowId":"round","choices":["home","away"]}]}');
INSERT INTO leagues(id,name,template_id) VALUES('a6b20000-0000-4000-8000-000000000002','SYNTHETIC ABA skeptic2','a6b20000-0000-4000-8000-000000000001');
INSERT INTO event_league_evaluations(league_id,configuration_version) VALUES('a6b20000-0000-4000-8000-000000000002',1);
INSERT INTO leagues(id,name,template_id) VALUES('a6b20000-0000-4000-8000-000000000005','SYNTHETIC ABA skeptic2','a6b20000-0000-4000-8000-000000000001');
INSERT INTO event_league_evaluations(league_id,configuration_version) VALUES('a6b20000-0000-4000-8000-000000000005',1);
INSERT INTO participants(id,league_id,display_name,magic_token) VALUES('a6b20000-0000-4000-8000-000000000003','a6b20000-0000-4000-8000-000000000002','Synthetic','a6b20000-0000-4000-8000-000000000004');
SET LOCAL ROLE service_role;
SELECT lives_ok($q$SELECT configure_event_window('a6b20000-0000-4000-8000-000000000002','round',0,'open',now()+interval '8 hours',true,ARRAY['game'],false)$q$,'create through supported service command');
SELECT lives_ok($q$SELECT configure_event_window('a6b20000-0000-4000-8000-000000000002','round',1,'unopened',now()+interval '8 hours',false,ARRAY['game'],false)$q$,'invalidate eligibility by withdrawing pairing review');
SELECT lives_ok($q$SELECT configure_event_window('a6b20000-0000-4000-8000-000000000002','round',2,'open',now()+interval '4 hours',true,ARRAY['game'],false)$q$,'restore eligibility with tighter deadline');
SELECT throws_ok($q$SELECT submit_event_window('a6b20000-0000-4000-8000-000000000002','a6b20000-0000-4000-8000-000000000004','round',1,'{"game":"home"}')$q$,'40001','window unavailable or stale','cached v1 is stale before delete');
SELECT throws_ok($q$SELECT configure_event_window('a6b20000-0000-4000-8000-000000000002','round',3,'open',now()+interval '2 days',true,ARRAY['game'],false)$q$,'23514','cutoff cannot move later','ordinary update cannot extend deadline');
SELECT throws_ok($q$SELECT configure_event_window('a6b20000-0000-4000-8000-000000000002','round',3,'unopened',null,false,ARRAY['game'],false)$q$,'23514','cutoff cannot move later','ordinary update cannot erase deadline');
SELECT throws_ok($q$SELECT configure_event_window('a6b20000-0000-4000-8000-000000000002','round',1,'open',now()+interval '8 hours',true,ARRAY['game'],true)$q$,'40001','window unavailable or stale','stale delete cannot remove current incarnation');
SELECT ok((SELECT version=3 FROM event_league_windows WHERE league_id='a6b20000-0000-4000-8000-000000000002'),'rejected commands leave version unchanged');
SELECT ok((SELECT generation=4 FROM event_league_evaluations WHERE league_id='a6b20000-0000-4000-8000-000000000002'),'rejected commands leave generation unchanged');
SELECT lives_ok($q$SELECT configure_event_window('a6b20000-0000-4000-8000-000000000002','round',3,'open',now()+interval '8 hours',true,ARRAY['game'],true)$q$,'current version may delete published open window');
SELECT throws_ok($q$SELECT submit_event_window('a6b20000-0000-4000-8000-000000000002','a6b20000-0000-4000-8000-000000000004','round',1,'{"game":"home"}')$q$,'22023','unknown window','missing window blocks submission');
SELECT throws_ok($q$SELECT configure_event_window('a6b20000-0000-4000-8000-000000000002','round',3,'open',now()+interval '8 hours',true,ARRAY['game'],false)$q$,'40001','window unavailable or stale','recreate requires zero not former latest token');
SELECT lives_ok($q$SELECT configure_event_window('a6b20000-0000-4000-8000-000000000002','round',0,'open',now()+interval '2 days',true,ARRAY['game'],false)$q$,'zero creates later replacement');
SELECT ok((SELECT version=1 AND cutoff>now()+interval '1 day' FROM event_league_windows WHERE league_id='a6b20000-0000-4000-8000-000000000002'),'COUNTEREXAMPLE version reused with extended deadline');
SELECT lives_ok($q$SELECT configure_event_window('a6b20000-0000-4000-8000-000000000002','round',1,'open',now()+interval '1 day',true,ARRAY['game'],false)$q$,'COUNTEREXAMPLE cached v1 can configure replacement');
SELECT throws_ok($q$SELECT submit_event_window('a6b20000-0000-4000-8000-000000000002','a6b20000-0000-4000-8000-000000000004','round',1,'{"game":"home"}')$q$,'40001','window unavailable or stale','fresh update makes v1 stale again');
SELECT lives_ok($q$SELECT configure_event_window('a6b20000-0000-4000-8000-000000000002','round',2,'open',now()+interval '8 hours',true,ARRAY['game'],true)$q$,'second removal succeeds before predictions');
SELECT lives_ok($q$SELECT configure_event_window('a6b20000-0000-4000-8000-000000000002','round',0,'open',now()+interval '3 days',true,ARRAY['game'],false)$q$,'second replacement succeeds');
SELECT lives_ok($q$SELECT submit_event_window('a6b20000-0000-4000-8000-000000000002','a6b20000-0000-4000-8000-000000000004','round',1,'{"game":"home"}')$q$,'COUNTEREXAMPLE cached v1 submission succeeds on second replacement');
SELECT ok((SELECT count(*)=1 FROM picks WHERE league_id='a6b20000-0000-4000-8000-000000000002'),'accepted stale submission persists prediction inside transaction');
SELECT throws_ok($q$SELECT configure_event_window('a6b20000-0000-4000-8000-000000000002','round',1,'open',now()+interval '8 hours',true,ARRAY['game'],true)$q$,'23514','sealed market membership cannot change','prediction seals and blocks subsequent deletion');
SELECT lives_ok($q$SELECT configure_event_window('a6b20000-0000-4000-8000-000000000005','round',0,'open',now()-interval '1 second',true,ARRAY['game'],false)$q$,'separate fixture has elapsed semantic cutoff without predictions');
SELECT throws_ok($q$SELECT configure_event_window('a6b20000-0000-4000-8000-000000000005','round',1,'open',now()+interval '8 hours',true,ARRAY['game'],true)$q$,'23514','sealed market membership cannot change','elapsed cutoff alone blocks delete before sweep');
SELECT ok((SELECT NOT membership_sealed FROM event_league_evaluations WHERE league_id='a6b20000-0000-4000-8000-000000000005'),'elapsed-cutoff control has no membership seal');
SELECT ok((SELECT locked_at IS NULL FROM leagues WHERE id='a6b20000-0000-4000-8000-000000000005'),'elapsed-cutoff control has not been swept');
SELECT ok((NOT has_function_privilege('anon','configure_event_window(uuid,text,integer,text,timestamptz,boolean,text[],boolean)','EXECUTE')),'anon cannot call configuration');
SELECT ok((NOT has_function_privilege('authenticated','configure_event_window(uuid,text,integer,text,timestamptz,boolean,text[],boolean)','EXECUTE')),'authenticated cannot call configuration');
SELECT ok((NOT has_table_privilege('service_role','event_league_windows','DELETE')),'service cannot directly delete windows');
RESET ROLE; SELECT * FROM finish(); ROLLBACK;
SELECT count(*) AS fixture_residue FROM templates WHERE id='a6b20000-0000-4000-8000-000000000001';
```

### Captured corrected result

```text
BEGIN
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
SET
ok 1 - create through supported service command
ok 2 - invalidate eligibility by withdrawing pairing review
ok 3 - restore eligibility with tighter deadline
ok 4 - cached v1 is stale before delete
ok 5 - ordinary update cannot extend deadline
ok 6 - ordinary update cannot erase deadline
ok 7 - stale delete cannot remove current incarnation
ok 8 - rejected commands leave version unchanged
ok 9 - rejected commands leave generation unchanged
ok 10 - current version may delete published open window
ok 11 - missing window blocks submission
ok 12 - recreate requires zero not former latest token
ok 13 - zero creates later replacement
ok 14 - COUNTEREXAMPLE version reused with extended deadline
ok 15 - COUNTEREXAMPLE cached v1 can configure replacement
ok 16 - fresh update makes v1 stale again
ok 17 - second removal succeeds before predictions
ok 18 - second replacement succeeds
ok 19 - COUNTEREXAMPLE cached v1 submission succeeds on second replacement
ok 20 - accepted stale submission persists prediction inside transaction
ok 21 - prediction seals and blocks subsequent deletion
ok 22 - separate fixture has elapsed semantic cutoff without predictions
ok 23 - elapsed cutoff alone blocks delete before sweep
ok 24 - elapsed-cutoff control has no membership seal
ok 25 - elapsed-cutoff control has not been swept
ok 26 - anon cannot call configuration
ok 27 - authenticated cannot call configuration
ok 28 - service cannot directly delete windows
RESET
1..28
ROLLBACK
0
exit 0
```
