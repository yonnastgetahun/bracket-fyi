# Window skeptic 1 — independent disproof attempt

Date: 2026-10-27. **Verdict: ITERATE; F2 High, F3 High and F4 Medium survive.**

## Scope and binary evidence

Assigned read-only review; only this report written. No code/schema fixes, migration application, provider calls, or real-data reads. Catalog inspection plus synthetic local transaction. Existing unrelated dirty tree preserved.

- [x] Inspect actual installed constraints, triggers, grants and submission function.
- [x] Attempt counterexamples under actual service_role, with rejection controls.
- [x] Roll back fixture and verify synthetic template absent.

Command: absolute guarded wrapper `/Users/yonnasgetahun/clawd/bin/exec --`, invoking `docker exec -i supabase_db_bracket-fyi psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres`; SQL below. **23/23 pgTAP assertions passed; ROLLBACK; synthetic template count 0.** Fixture bootstrap uses postgres; all defect reproductions and controls execute after SET LOCAL ROLE service_role. This is ordinary granted DML, not superuser trigger disabling.

## Disposition

| Finding | Strongest attempted rebuttal | Actual result / disposition |
|---|---|---|
| F2 High | RLS/service-only access or sealed/version gate might enforce immutability | Service role changes sealed manifest choices a/b → c/d at version 1; generation stays 3. New c choice accepted, persisted configuration version still 1. No config user triggers in actual catalog; object-shape/positive-version constraints are not immutable publication. **Confirmed.** |
| F3 High | Membership guard and physical advancement might seal the set | After past cutoff but before advancement, UPDATE m1 → renamed succeeds at window version 1; own mapped read drops to zero. Advancement succeeds but original persisted m1 pick remains unlocked. After physical lock, UPDATE is rejected (control), yet INSERT extra window succeeds and DELETE locked original window succeeds. INSERT/UPDATE increment generation; DELETE leaves it at 9. **Confirmed, with INSERT/UPDATE generation support explicitly credited.** |
| F4 Medium | SQL strictness, type declaration, or availability checks might reject NULL | Actual function is not STRICT; stale integer 99 rejected, NULL accepted and changed pick c → d. NULL still fails during freeze and after cutoff. **Confirmed as optimistic-concurrency bypass only, not credential/cutoff/freeze bypass.** |

### Authorization and impact boundaries

New tables grant service_role DML, not anon/authenticated access; submit RPC execution is only postgres/service_role. Thus F2/F3 are a broken trusted persistence contract, not demonstrated anonymous table mutation. F4 needs an authorized service call and valid participant credential. Repository `lib/events/repository.ts` forwards submission.version without runtime validation; TypeScript does not enforce RPC input at runtime. No public HTTP route exploit is claimed.

This narrowing does **not** disprove the findings: the packet explicitly promises stable logical IDs, configuration version preservation, and generation recording for window/scoring basis changes. Contract lines 44, 56, 93, 103 require full logical-set sealing, versioned manifests, preserved prediction basis, and atomic durable reconciliation obligations. Service authority does not make two different manifests under the same persisted version an immutable basis. Activation-off bounds current user exposure, not correctness acceptance.

Actual local window triggers fire only on INSERT/UPDATE. No DELETE trigger or sealed-config trigger exists. Constraints enforce nonempty membership, positive version, state values and open-window prerequisites, not semantic-cutoff immutability. Post-lock membership UPDATE protection works but leaves the proven other paths.

F1 was not independently executed here. Catalog inspection confirms retained anon picks_read organizer access and picks_update participant/unlocked predicate without window checks; therefore no catalog evidence disproves the original report. Do not count this as an independent F1 reproduction.

## Required acceptance evidence

Reject same-version sealed mutation/unsealing; permit revisions only through coherent immutable snapshots and atomic affected-league obligations. Seal full logical membership by semantic first cutoff and cover INSERT/UPDATE/DELETE plus identity changes. Explicitly reject NULL expected version before any writes. Preserve current working freeze/cutoff/authentication protections. Independent two-session race and public-route verification remain outside this report.

changed: report only.
matters: independently reproduced all three assigned findings under granted service authority.
checks: 23/23 synthetic assertions, rollback and zero fixture residue.
risk: local point-in-time evidence; no production, HTTP, concurrency or migration-history acceptance.
verdict: iterate.

## Exact rollback-only probe

```sql
BEGIN;
SELECT no_plan();
INSERT INTO templates(id,name,type) VALUES('a9170000-0000-4000-8000-000000000001','Skeptic1 synthetic','bracket');
INSERT INTO leagues(id,name,template_id) VALUES('a9170000-0000-4000-8000-000000000002','Skeptic1 synthetic','a9170000-0000-4000-8000-000000000001');
INSERT INTO participants(id,league_id,display_name,magic_token) VALUES('a9170000-0000-4000-8000-000000000003','a9170000-0000-4000-8000-000000000002','Synthetic','a9170000-0000-4000-8000-000000000004');
INSERT INTO event_template_configs(template_id,version,sealed,manifest) VALUES('a9170000-0000-4000-8000-000000000001',1,true,'{"markets":[{"id":"m1","windowId":"w1","choices":["a","b"]}]}');
INSERT INTO event_league_evaluations(league_id,configuration_version) VALUES('a9170000-0000-4000-8000-000000000002',1);
INSERT INTO event_league_windows(league_id,window_key,state,cutoff,pairings_reviewed,market_ids) VALUES('a9170000-0000-4000-8000-000000000002','w1','open',clock_timestamp()+interval '1 day',true,ARRAY['m1']);
SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT submit_event_window('a9170000-0000-4000-8000-000000000002','a9170000-0000-4000-8000-000000000004','w1',1,'{"m1":"a"}')$$,'valid service-role initial submission');
SELECT is((SELECT generation FROM event_league_evaluations WHERE league_id='a9170000-0000-4000-8000-000000000002'),3::bigint,'initial generation 3');
SELECT lives_ok($$UPDATE event_template_configs SET manifest='{"markets":[{"id":"m1","windowId":"w1","choices":["c","d"]}]}' WHERE template_id='a9170000-0000-4000-8000-000000000001'$$,'F2 service role mutates sealed manifest');
SELECT is((SELECT generation FROM event_league_evaluations WHERE league_id='a9170000-0000-4000-8000-000000000002'),3::bigint,'F2 configuration write does not bump generation');
SELECT is((SELECT version FROM event_template_configs WHERE template_id='a9170000-0000-4000-8000-000000000001'),1,'F2 unchanged configuration version');
SELECT lives_ok($$SELECT submit_event_window('a9170000-0000-4000-8000-000000000002','a9170000-0000-4000-8000-000000000004','w1',1,'{"m1":"c"}')$$,'F2 new choices accepted against same version');
SELECT is((SELECT event_configuration_version FROM picks WHERE participant_id='a9170000-0000-4000-8000-000000000003'),1,'F2 pick records same configuration version');
SELECT throws_ok($$SELECT submit_event_window('a9170000-0000-4000-8000-000000000002','a9170000-0000-4000-8000-000000000004','w1',99,'{"m1":"d"}')$$,'40001','window unavailable or stale','control nonnull stale expected version rejected');
SELECT lives_ok($$SELECT submit_event_window('a9170000-0000-4000-8000-000000000002','a9170000-0000-4000-8000-000000000004','w1',NULL,'{"m1":"d"}')$$,'F4 NULL expected version accepted');
SELECT is((SELECT team_id FROM picks WHERE participant_id='a9170000-0000-4000-8000-000000000003'),'d','F4 NULL command changes choice');
UPDATE event_league_evaluations SET frozen=true WHERE league_id='a9170000-0000-4000-8000-000000000002';
SELECT throws_ok($$SELECT submit_event_window('a9170000-0000-4000-8000-000000000002','a9170000-0000-4000-8000-000000000004','w1',NULL,'{"m1":"c"}')$$,'40001','window unavailable or stale','control NULL does not bypass freeze');
UPDATE event_league_evaluations SET frozen=false WHERE league_id='a9170000-0000-4000-8000-000000000002';
UPDATE event_league_windows SET cutoff=clock_timestamp()-interval '1 second' WHERE league_id='a9170000-0000-4000-8000-000000000002';
SELECT throws_ok($$SELECT submit_event_window('a9170000-0000-4000-8000-000000000002','a9170000-0000-4000-8000-000000000004','w1',NULL,'{"m1":"c"}')$$,'40001','window unavailable or stale','control NULL does not bypass cutoff');
SELECT is((SELECT locked_at IS NULL FROM leagues WHERE id='a9170000-0000-4000-8000-000000000002'),true,'semantic cutoff before physical advancement');
SELECT lives_ok($$UPDATE event_league_windows SET market_ids=ARRAY['renamed'] WHERE league_id='a9170000-0000-4000-8000-000000000002'$$,'F3 membership UPDATE after semantic cutoff accepted');
SELECT is((SELECT version FROM event_league_windows WHERE league_id='a9170000-0000-4000-8000-000000000002'),1,'F3 membership change keeps window version');
SELECT is((SELECT count(*) FROM read_event_picks('a9170000-0000-4000-8000-000000000002','a9170000-0000-4000-8000-000000000004')),0::bigint,'F3 persisted pick disappears from mapped read');
SELECT is(advance_event_windows('a9170000-0000-4000-8000-000000000002'),1,'physical advance runs');
SELECT is((SELECT locked FROM picks WHERE participant_id='a9170000-0000-4000-8000-000000000003'),false,'F3 original pick was not locked by advance');
SELECT throws_ok($$UPDATE event_league_windows SET market_ids=ARRAY['blocked'] WHERE league_id='a9170000-0000-4000-8000-000000000002'$$,'23514','sealed market membership cannot change','control UPDATE blocked after physical league lock');
SELECT lives_ok($$INSERT INTO event_league_windows(league_id,window_key,market_ids) VALUES('a9170000-0000-4000-8000-000000000002','added',ARRAY['extra'])$$,'F3 INSERT new membership after physical lock accepted');
SELECT is((SELECT generation FROM event_league_evaluations WHERE league_id='a9170000-0000-4000-8000-000000000002'),9::bigint,'INSERT and UPDATE do bump generation');
SELECT lives_ok($$DELETE FROM event_league_windows WHERE league_id='a9170000-0000-4000-8000-000000000002' AND window_key='w1'$$,'F3 DELETE locked original window accepted');
SELECT is((SELECT generation FROM event_league_evaluations WHERE league_id='a9170000-0000-4000-8000-000000000002'),9::bigint,'F3 DELETE does not bump generation');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
SELECT count(*) AS synthetic_templates_after_rollback FROM templates WHERE id='a9170000-0000-4000-8000-000000000001';
```

