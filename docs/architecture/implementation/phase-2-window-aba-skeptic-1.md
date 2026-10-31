# WPR1 independent skeptic 1

Work item: disprove pre-seal version ABA and deadline extension.
Done when:
- [x] Installed SQL and supported commands inspected against contract.
- [x] Independent rollback-only counterexamples and negative controls executed.
- [x] Scope, repair and regression recommendation recorded.
Evidence: local PostgreSQL pgTAP transcript summarized below.


## Verdict: WPR1 survives — Medium, ITERATE

2026-10-27. Independent attempt to disprove the finding failed. **26/26 assertions passed across two rollback-only synthetic probes** (22 counterexample/control, 4 elapsed-cutoff controls); both psql processes exited 0, both explicitly ROLLBACK, both fixture-residue counts 0. Counterexample assertions intentionally describe undesirable behavior; they are not repair acceptance tests.

Read project AGENTS.md, window packet, relevant spec and installed SQL. Review skill was read for standards/spec framing; its branch-baseline/delegation workflow is superseded by this explicit bounded independent-skeptic assignment. Only this report was written. No schema/migration application, code edits, commits, network calls, or retained fixtures.

### Attempted falsification and surviving counterexample

Original fixture, identities, market names and command sequence differ from the reported reproduction. Actual `service_role` uses only supported `configure_event_window` and `submit_event_window` commands after postgres fixture bootstrap:

1. Create stage-x open at +4h, tighten to +3h (v2), then +2h (v3).
2. Complete valid submission with v2 rejects `40001`. Stale v2 DELETE also rejects. Direct +5h extension at v3 rejects `23514 cutoff cannot move later`.
3. Valid v3 DELETE succeeds. Submission while absent rejects `22023 unknown window`; recreate with old v3 rejects `40001`, so this is not a missing-version check.
4. Recreate same key using required create token 0, **unopened/null cutoff**, obtains v1. Open it at +5h, obtains v2.
5. **The exact v2 request previously rejected now succeeds and persists one pick.** Deadline is later than even the original +4h, not merely later than its tightened +2h. This proves both version-2 ABA and cutoff erasure followed by extension, not only initial version-1 reuse.
6. Generation advances correctly to 7 before submission and 8 after it. Generation does not participate in the submission expected-version predicate and does not prevent this defect.

### Negative controls / exposure boundary

- `anon` and `authenticated` lack configure EXECUTE; service lacks direct window DELETE. No privileged owner-only mutation used to induce the defect.
- Invalid participant credential still rejects `42501`; invalid market choice still rejects `22023`. No credential or choice-validation bypass.
- First successful prediction seals membership; subsequent DELETE rejects `23514 sealed market membership cannot change`.
- Separate no-picks fixture: tighten cutoff into past, then DELETE rejects without sweep; generation stays 3 and picks remain zero. Thus elapsed cutoff alone still protects the original row.
- Defect requires service configuration authority **before first prediction / membership seal and before an extant cutoff has elapsed**. Does not demonstrate participant-driven configuration, reopening an already locked window, post-prediction deletion, or a deployed public exploit. New-format activation/integration remains separate.

### Actual installed SQL and contract

`pg_get_functiondef` confirmed installed `configure_event_window`, `protect_event_window` and `submit_event_window` match the relevant source behavior. Enabled window guard/generation triggers were read from `pg_trigger`; version column default read from `information_schema` is 1.

- `20261027000003_window_integrity_repair.sql`: configure compares expected token only against currently present row; absence requires 0. DELETE removes the row; INSERT omits version, invoking default 1. No incarnation/deadline history is consulted.
- Same migration: guard returns OLD on DELETE after membership check. No-later-cutoff and version increment checks occur only on UPDATE. INSERT validates current manifest membership, not historical deadline or version.
- Same migration: submit checks integer expected version against current window version; league evaluation generation is neither supplied nor compared as a request concurrency token.
- `20261027000002_prediction_windows.sql:23`: `version integer not null default 1 check(version>0)`.
- `docs/architecture/bracket-fyi-spec-v1.0.md:94`: “Each window has unopened/open/locked state, immutable logical slot IDs, UTC cutoff and version” and “Never move a cutoff later automatically”. Window packet additionally requires complete eligible submission and graph/config version.
- **Qualification:** spec says no later cutoff *automatically*, not an absolute ban on every explicitly reviewed organizer reschedule. The current command has no reviewed override/reason distinction and its UPDATE policy prohibits later cutoffs. Deletion/recreation bypasses that existing policy. Treat deadline extension as an API policy hole; the stale-request ABA is independently concrete even if a future explicit rescheduling policy is approved.
- DB29 explicitly expects draft unopened deletion/rebuild to work. Removing all deletion would change that existing supported behavior and should not be called contract-preserving without deliberate reconciliation.

### Smallest contract-preserving repair recommendation

Retain durable per-`(league_id, window_key)` lifecycle metadata across physical deletion: last allocated version and tightest nonnull cutoff. Under the existing league/evaluation lock order, allocate recreation strictly above the previous incarnation's last version; enforce new cutoff no later than remembered cutoff (and do not forget remembered cutoff on an unopened/null transition). Atomically update metadata on every version-changing path, including configuration adoption and cutoff/state changes, with transaction rollback preserving both metadata and generation. A tombstone/history row is sufficient; no public submission signature change is necessary. Seed metadata from extant rows during the additive migration. Already-deleted histories cannot be reconstructed from current rows alone: explicitly inventory/dispose that upgrade gap rather than claiming retroactive protection.

Simpler “reject deletion after any window creation” would close this command path but break DB29 draft rebuild support. Rejecting deletion only while state=open is insufficient unless durable prior-open identity is also remembered: a state detour to unopened can otherwise lose that restriction. A new UUID token or generation-only allocator without retained cutoff history fixes only half the finding.

Regression requirements:

1. Preserve allowed draft remove/rebuild, but never reuse a window version previously exposed for the same logical key.
2. Replay both v1 and higher-version ABA sequences; formerly stale submissions must remain `40001`, with zero picks/generation changes on rejection.
3. Reject direct later cutoff, delete/recreate with later cutoff, and delete/recreate unopened/null then open-later. A valid equal/earlier deadline recreation must succeed with a fresh version.
4. Exercise adoption-bumped versions and repeated rebuilds to prevent independent allocators colliding; assert transaction rollback and generation accounting.
5. Keep service-only grants, credential/choice validation, first-prediction seal, and elapsed-cutoff no-picks controls. Future regression must assert desired behavior, reversing this report's counterexample assertions.

changed: this report only.
matters: original finding independently reproduced with a different higher-version and null-cutoff transition.
checks: 22/22 plus 4/4; explicit rollback; zero fixture residue; installed definitions/privileges/trigger checks.
risk: repair not implemented; migration-history recovery and public integration not tested.
verdict: **ITERATE on WPR1; Medium remains proportionate to service-only pre-prediction exposure.**

## Independent probe (exact SQL)

```sql
begin;
select no_plan();
insert into templates(id,name,type) values('a8a10000-0000-4000-8000-000000000001','SYNTHETIC WPR1 skeptic1','bracket');
insert into leagues(id,name,template_id) values('a8a10000-0000-4000-8000-000000000002','SYNTHETIC WPR1 skeptic1','a8a10000-0000-4000-8000-000000000001');
insert into participants(id,league_id,display_name,magic_token) values('a8a10000-0000-4000-8000-000000000003','a8a10000-0000-4000-8000-000000000002','Synthetic','a8a10000-0000-4000-8000-000000000004');
insert into event_template_configs(template_id,version,sealed,manifest) values('a8a10000-0000-4000-8000-000000000001',1,true,'{"markets":[{"id":"slot-x","windowId":"stage-x","choices":["yes","no"]}]}');
insert into event_league_evaluations(league_id,configuration_version) values('a8a10000-0000-4000-8000-000000000002',1);
set local role service_role;
select is(current_user::text,'service_role','actual service role');
select ok(not has_function_privilege('anon','configure_event_window(uuid,text,integer,text,timestamptz,boolean,text[],boolean)','execute'),'anon cannot configure');
select ok(not has_function_privilege('authenticated','configure_event_window(uuid,text,integer,text,timestamptz,boolean,text[],boolean)','execute'),'authenticated cannot configure');
select ok(not has_table_privilege('service_role','event_league_windows','delete'),'direct service DELETE denied');
select configure_event_window('a8a10000-0000-4000-8000-000000000002','stage-x',0,'open',now()+interval '4 hours',true,array['slot-x']);
select configure_event_window('a8a10000-0000-4000-8000-000000000002','stage-x',1,'open',now()+interval '3 hours',true,array['slot-x']);
select configure_event_window('a8a10000-0000-4000-8000-000000000002','stage-x',2,'open',now()+interval '2 hours',true,array['slot-x']);
select is((select version from event_league_windows where league_id='a8a10000-0000-4000-8000-000000000002'),3,'initial incarnation version 3');
select throws_ok($$select submit_event_window('a8a10000-0000-4000-8000-000000000002','a8a10000-0000-4000-8000-000000000004','stage-x',2,'{"slot-x":"yes"}')$$,'40001','window unavailable or stale','v2 stale in original incarnation');
select throws_ok($$select configure_event_window('a8a10000-0000-4000-8000-000000000002','stage-x',2,null,null,null,null,true)$$,'40001','window unavailable or stale','stale delete rejected');
select throws_ok($$select configure_event_window('a8a10000-0000-4000-8000-000000000002','stage-x',3,'open',now()+interval '5 hours',true,array['slot-x'])$$,'23514','cutoff cannot move later','direct extension rejected');
select configure_event_window('a8a10000-0000-4000-8000-000000000002','stage-x',3,null,null,null,null,true);
select throws_ok($$select submit_event_window('a8a10000-0000-4000-8000-000000000002','a8a10000-0000-4000-8000-000000000004','stage-x',2,'{"slot-x":"yes"}')$$,'22023','unknown window','absence does not accept stale request');
select throws_ok($$select configure_event_window('a8a10000-0000-4000-8000-000000000002','stage-x',3,'open',now()+interval '6 hours',true,array['slot-x'])$$,'40001','window unavailable or stale','recreation requires create token zero');
select configure_event_window('a8a10000-0000-4000-8000-000000000002','stage-x',0,'unopened',null,false,array['slot-x']);
select is((select version from event_league_windows where league_id='a8a10000-0000-4000-8000-000000000002'),1,'COUNTEREXAMPLE incarnation resets to 1');
select ok((select cutoff is null from event_league_windows where league_id='a8a10000-0000-4000-8000-000000000002'),'COUNTEREXAMPLE prior cutoff erased through unopened recreation');
select configure_event_window('a8a10000-0000-4000-8000-000000000002','stage-x',1,'open',now()+interval '5 hours',true,array['slot-x']);
select is((select version from event_league_windows where league_id='a8a10000-0000-4000-8000-000000000002'),2,'COUNTEREXAMPLE original stale v2 resurrected');
select ok((select cutoff>now()+interval '4 hours' from event_league_windows where league_id='a8a10000-0000-4000-8000-000000000002'),'COUNTEREXAMPLE beyond even original deadline');
select ok(not event_membership_closed('a8a10000-0000-4000-8000-000000000002'),'pre-prediction and pre-cutoff');
select is((select generation from event_league_evaluations where league_id='a8a10000-0000-4000-8000-000000000002'),7::bigint,'generation tracks every create update delete recreation');
select throws_ok($$select submit_event_window('a8a10000-0000-4000-8000-000000000002','a8a10000-0000-4000-8000-000000000099','stage-x',2,'{"slot-x":"yes"}')$$,'42501','invalid participant credential','bad credential still rejected');
select throws_ok($$select submit_event_window('a8a10000-0000-4000-8000-000000000002','a8a10000-0000-4000-8000-000000000004','stage-x',2,'{"slot-x":"invalid"}')$$,'22023','ineligible market choice','bad choice still rejected');
select lives_ok($$select submit_event_window('a8a10000-0000-4000-8000-000000000002','a8a10000-0000-4000-8000-000000000004','stage-x',2,'{"slot-x":"yes"}')$$,'COUNTEREXAMPLE identical formerly stale request accepted');
select is((select count(*) from picks where league_id='a8a10000-0000-4000-8000-000000000002'),1::bigint,'accepted stale request persisted one pick');
select is((select generation from event_league_evaluations where league_id='a8a10000-0000-4000-8000-000000000002'),8::bigint,'successful submit increments generation');
select throws_ok($$select configure_event_window('a8a10000-0000-4000-8000-000000000002','stage-x',2,null,null,null,null,true)$$,'23514','sealed market membership cannot change','after prediction DELETE blocked');
reset role;
select * from finish();
rollback;
select count(*) as residue from templates where id='a8a10000-0000-4000-8000-000000000001';
```

## Actual output

```text
BEGIN
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
SET
ok 1 - actual service role
ok 2 - anon cannot configure
ok 3 - authenticated cannot configure
ok 4 - direct service DELETE denied



ok 5 - initial incarnation version 3
ok 6 - v2 stale in original incarnation
ok 7 - stale delete rejected
ok 8 - direct extension rejected

ok 9 - absence does not accept stale request
ok 10 - recreation requires create token zero

ok 11 - COUNTEREXAMPLE incarnation resets to 1
ok 12 - COUNTEREXAMPLE prior cutoff erased through unopened recreation

ok 13 - COUNTEREXAMPLE original stale v2 resurrected
ok 14 - COUNTEREXAMPLE beyond even original deadline
ok 15 - pre-prediction and pre-cutoff
ok 16 - generation tracks every create update delete recreation
ok 17 - bad credential still rejected
ok 18 - bad choice still rejected
ok 19 - COUNTEREXAMPLE identical formerly stale request accepted
ok 20 - accepted stale request persisted one pick
ok 21 - successful submit increments generation
ok 22 - after prediction DELETE blocked
RESET
1..22
ROLLBACK
0
exit 0
```

## Independent elapsed-cutoff negative control

```sql
begin;
select no_plan();
insert into templates(id,name,type) values('a8a10000-0000-4000-8000-000000000001','SYNTHETIC WPR1 skeptic1','bracket');
insert into leagues(id,name,template_id) values('a8a10000-0000-4000-8000-000000000002','SYNTHETIC WPR1 skeptic1','a8a10000-0000-4000-8000-000000000001');
insert into participants(id,league_id,display_name,magic_token) values('a8a10000-0000-4000-8000-000000000003','a8a10000-0000-4000-8000-000000000002','Synthetic','a8a10000-0000-4000-8000-000000000004');
insert into event_template_configs(template_id,version,sealed,manifest) values('a8a10000-0000-4000-8000-000000000001',1,true,'{"markets":[{"id":"slot-x","windowId":"stage-x","choices":["yes","no"]}]}');
insert into event_league_evaluations(league_id,configuration_version) values('a8a10000-0000-4000-8000-000000000002',1);
set local role service_role;
select configure_event_window('a8a10000-0000-4000-8000-000000000002','stage-x',0,'open',now()+interval '1 hour',true,array['slot-x']);
select configure_event_window('a8a10000-0000-4000-8000-000000000002','stage-x',1,'open',now()-interval '1 minute',true,array['slot-x']);
select ok(event_membership_closed('a8a10000-0000-4000-8000-000000000002'),'elapsed cutoff closes membership without prediction or sweep');
select throws_ok($$select configure_event_window('a8a10000-0000-4000-8000-000000000002','stage-x',2,null,null,null,null,true)$$,'23514','sealed market membership cannot change','elapsed cutoff blocks deletion');
select is((select generation from event_league_evaluations where league_id='a8a10000-0000-4000-8000-000000000002'),3::bigint,'rejected deletion leaves generation unchanged');
select is((select count(*) from picks where league_id='a8a10000-0000-4000-8000-000000000002'),0::bigint,'cutoff-only control has zero picks');
reset role;
select * from finish();
rollback;
select count(*) as residue from templates where id='a8a10000-0000-4000-8000-000000000001';
```

```text
BEGIN
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
SET


ok 1 - elapsed cutoff closes membership without prediction or sweep
ok 2 - elapsed cutoff blocks deletion
ok 3 - rejected deletion leaves generation unchanged
ok 4 - cutoff-only control has zero picks
RESET
1..4
ROLLBACK
0
exit 0
```

## Installed definition fingerprints and enabled triggers

`pg_proc.prosrc` MD5; inspected using `pg_get_functiondef`, not inferred from migration file.

```text
configure_event_window|f02262800d71b3f29644d2dd99aac7ac
event_membership_closed|de21ce332417ba431d12301839d6ec55
protect_event_window|0d0f57d019dafe49c95bfebec582249a
submit_event_window|07009817a3c048c7dbc7a609701572ef
event_window_generation|O
event_window_guard|O
```

20261027000002_prediction_windows.sql SHA256: `9f19ac4ecf24db0cf3d4030f62d974d8cdf776b309640bbc7a794daf2a277ec3`.

20261027000003_window_integrity_repair.sql SHA256: `93591a6c6aaf2fdb2c6a3f4380fd984935c0d442149f3ac90f3b4d6d34352346`.
