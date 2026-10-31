-- Final schema expects PT409; historical-prefix runners explicitly set bracket.test_business_sqlstate.
-- Original synthetic three-league fixture. Rollback leaves existing data untouched.
begin;
select no_plan();
select has_function('public','capture_event_lifecycle',array['uuid'],'DB32 durable capture exists');
insert into organizations(id,organization_key,name,kind) values('a3200000-0000-4000-8000-000000000001','db32-unit-org','Synthetic DB32','governing_body');
insert into competitions(id,organization_id,competition_key,name,domain,sport_code) values('a3200000-0000-4000-8000-000000000002','a3200000-0000-4000-8000-000000000001','db32-unit-cup','Synthetic DB32','sport','soccer');
insert into event_editions(id,competition_id,edition_key,name,season_label) values('a3200000-0000-4000-8000-000000000003','a3200000-0000-4000-8000-000000000002','db32','Synthetic DB32','2026');
insert into stages(id,event_edition_id,stage_key,name,kind,ordinal) values('a3200000-0000-4000-8000-000000000009','a3200000-0000-4000-8000-000000000003','db32-stage','Synthetic DB32','knockout',1);
insert into contests(id,event_edition_id,stage_id,contest_key,name,kind) values('a3200000-0000-4000-8000-000000000004','a3200000-0000-4000-8000-000000000003','a3200000-0000-4000-8000-000000000009','db32-match','Synthetic DB32','match');
insert into competitors(id,competitor_key,kind,canonical_name) values
 ('a3200000-0000-4000-8000-000000000005','db32-unit-a','team','Synthetic A'),('a3200000-0000-4000-8000-000000000006','db32-unit-b','team','Synthetic B');
insert into event_entries(id,event_edition_id,competitor_id,role) values
 ('a3200000-0000-4000-8000-000000000007','a3200000-0000-4000-8000-000000000003','a3200000-0000-4000-8000-000000000005','team'),
 ('a3200000-0000-4000-8000-000000000008','a3200000-0000-4000-8000-000000000003','a3200000-0000-4000-8000-000000000006','team');
insert into contest_entries(event_edition_id,contest_id,event_entry_id,role,side,ordinal) values
 ('a3200000-0000-4000-8000-000000000003','a3200000-0000-4000-8000-000000000004','a3200000-0000-4000-8000-000000000007','competitor','home',1),
 ('a3200000-0000-4000-8000-000000000003','a3200000-0000-4000-8000-000000000004','a3200000-0000-4000-8000-000000000008','competitor','away',2);
insert into templates(id,name,type,event_edition_id) values('a3200000-0000-4000-8000-000000000010','Synthetic DB32','bracket','a3200000-0000-4000-8000-000000000003');
insert into event_template_configs(template_id,version,sealed,manifest) values('a3200000-0000-4000-8000-000000000010',1,true,
'{"markets":[{"id":"m","windowId":"w","choices":["home","draw","away"],"required":true,"scored":true,"outcomeDomain":"regulation-home-draw-away","contestId":"a3200000-0000-4000-8000-000000000004"}],
"lifecycle":{"binding":{"reviewed":true,"graphVersion":1,"markets":[{"marketId":"m","eligibleEntrantIds":["a3200000-0000-4000-8000-000000000007","a3200000-0000-4000-8000-000000000008"],"orientation":["a3200000-0000-4000-8000-000000000007","a3200000-0000-4000-8000-000000000008"]}]}}}');
insert into leagues(id,name,template_id,organizer_token) values
 ('a3200000-0000-4000-8000-000000000011','Synthetic A','a3200000-0000-4000-8000-000000000010','a3200000-0000-4000-8000-000000000021'),
 ('a3200000-0000-4000-8000-000000000012','Synthetic B','a3200000-0000-4000-8000-000000000010','a3200000-0000-4000-8000-000000000022'),
 ('a3200000-0000-4000-8000-000000000013','Synthetic C','a3200000-0000-4000-8000-000000000010','a3200000-0000-4000-8000-000000000023');
insert into event_league_evaluations(league_id,configuration_version) select id,1 from leagues where template_id='a3200000-0000-4000-8000-000000000010';
select configure_event_window(id,'w',0,'open',clock_timestamp()-interval '1 second',true,array['m']) from leagues where template_id='a3200000-0000-4000-8000-000000000010';
select advance_event_windows(id) from leagues where template_id='a3200000-0000-4000-8000-000000000010';
create temp table db32_capture(lid uuid primary key, snap jsonb);
grant all on db32_capture to service_role;
set local role service_role;
insert into db32_capture select league_id,capture_event_lifecycle(league_id) from event_league_evaluations where league_id::text like 'a320%';
select is(read_event_lifecycle('a3200000-0000-4000-8000-000000000011')->>'state','reconciliation-pending','never claims final lifecycle before reconciliation');
select throws_ok($$select mutate_event_lifecycle('a3200000-0000-4000-8000-000000000012','a3200000-0000-4000-8000-000000000021','m','override','{"outcome":{"kind":"draw"}}','reason','x',null,'cross')$$,'42501','invalid organizer credential','exact credential scoped to league');
select throws_ok($$update event_league_evaluations set evaluated_generation=generation$$,'42501',null,'service cannot clear work directly');
select throws_ok($$insert into event_lifecycle_revisions(league_id,market_id) values('a3200000-0000-4000-8000-000000000011','m')$$,'42501',null,'service cannot forge revisions');
select lives_ok($$select mutate_event_lifecycle(lid,'a3200000-0000-4000-8000-000000000022','m','override','{"outcome":{"kind":"draw"}}','Synthetic override',snap->'basis'->'effective'->'m'->>'effectiveToken',null,'B-override') from db32_capture where lid='a3200000-0000-4000-8000-000000000012'$$,'typed override writes');
select is((select count(*)::integer from event_lifecycle_revisions where league_id::text like 'a320%'),1,'one revision');
select lives_ok($$select mutate_event_lifecycle(lid,'a3200000-0000-4000-8000-000000000022','m','override','{"outcome":{"kind":"draw"}}','Synthetic override',snap->'basis'->'effective'->'m'->>'effectiveToken',null,'B-override') from db32_capture where lid='a3200000-0000-4000-8000-000000000012'$$,'identical retry accepted despite stale token');
select is((select count(*)::integer from event_lifecycle_revisions where league_id::text like 'a320%'),1,'retry creates no revision');
select throws_ok($$select commit_event_lifecycle(lid,(snap->>'generation')::bigint,snap->>'basisToken','[]') from db32_capture where lid='a3200000-0000-4000-8000-000000000012'$$,coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'lifecycle basis changed','stale worker cannot clear newer override');
select lives_ok($$select mutate_event_lifecycle(lid,'a3200000-0000-4000-8000-000000000023','m','override','{"outcome":{"kind":"draw"}}','Synthetic override',snap->'basis'->'effective'->'m'->>'effectiveToken',null,'C-override') from db32_capture where lid='a3200000-0000-4000-8000-000000000013'$$,'C override independent');
update db32_capture set snap=capture_event_lifecycle(lid);
select lives_ok($$select mutate_event_lifecycle(lid,'a3200000-0000-4000-8000-000000000023','m','release','{}','Synthetic release',snap->'basis'->'effective'->'m'->>'effectiveToken',snap->'basis'->'effective'->'m'->>'canonicalToken','C-release') from db32_capture where lid='a3200000-0000-4000-8000-000000000013'$$,'C releases to latest canonical');
reset role;
insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,source_type,idempotency_key)
values('a3200000-0000-4000-8000-000000000030','a3200000-0000-4000-8000-000000000004','a3200000-0000-4000-8000-000000000003',1,'final','winner','a3200000-0000-4000-8000-000000000007','operator','db32-result-1');
set local role service_role;
select is((capture_event_lifecycle('a3200000-0000-4000-8000-000000000011')->'basis'->'effective'->'m'->'outcome'->>'kind'),'winner','A follows canonical');
select is((capture_event_lifecycle('a3200000-0000-4000-8000-000000000012')->'basis'->'effective'->'m'->'outcome'->>'kind'),'draw','B remains override');
select is((capture_event_lifecycle('a3200000-0000-4000-8000-000000000013')->'basis'->'effective'->'m'->'outcome'->>'kind'),'winner','released C follows canonical');
select is((capture_event_lifecycle(lid)->'basis'->'effective'->'m'->>'effectiveToken'),snap->'basis'->'effective'->'m'->>'effectiveToken','masked canonical preserves effective token') from db32_capture where lid='a3200000-0000-4000-8000-000000000012';
select isnt((capture_event_lifecycle(lid)->'basis'->'effective'->'m'->>'provenanceToken'),snap->'basis'->'effective'->'m'->>'provenanceToken','masked canonical changes provenance') from db32_capture where lid='a3200000-0000-4000-8000-000000000012';
select is((select count(*)::integer from event_lifecycle_audit where kind='canonical' and canonical_result_id='a3200000-0000-4000-8000-000000000030'),3,'canonical commit fans out all three leagues');
select throws_ok($$select mutate_event_lifecycle(lid,'a3200000-0000-4000-8000-000000000022','m','release','{}','Synthetic stale release',snap->'basis'->'effective'->'m'->>'effectiveToken',snap->'basis'->'effective'->'m'->>'canonicalToken','B-stale-release') from db32_capture where lid='a3200000-0000-4000-8000-000000000012'$$,coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'effective result changed','release compares underlying canonical token');
update db32_capture set snap=capture_event_lifecycle(lid);
select is(commit_event_lifecycle(lid,(snap->>'generation')::bigint,snap->>'basisToken','[]')->>'state','complete','settled and locked completes') from db32_capture;
select is((select count(*)::integer from event_lifecycle_audit where kind='coronation' and league_id::text like 'a320%'),3,'exactly one coronation each');
select is(commit_event_lifecycle(lid,(snap->>'generation')::bigint,snap->>'basisToken','[]')->>'replayed','true','postcommit lost acknowledgment retry no-op') from db32_capture;
select lives_ok($$select mutate_event_lifecycle(lid,'a3200000-0000-4000-8000-000000000022','m','hold','{"held":true}','Synthetic hold',snap->'basis'->'effective'->'m'->>'effectiveToken',null,'B-hold') from db32_capture where lid='a3200000-0000-4000-8000-000000000012'$$,'hold durable');
select is(read_event_lifecycle('a3200000-0000-4000-8000-000000000012')->>'state','reconciliation-pending','hold immediately hides stale complete');
update db32_capture set snap=capture_event_lifecycle(lid);
select is(commit_event_lifecycle(lid,(snap->>'generation')::bigint,snap->>'basisToken','[]')->>'state','held','hold prevents completion') from db32_capture where lid='a3200000-0000-4000-8000-000000000012';
select throws_ok($$select mutate_event_lifecycle(lid,'a3200000-0000-4000-8000-000000000022','m','override','{"outcome":{"kind":"winner","entrant":"alien"}}','invalid',snap->'basis'->'effective'->'m'->>'effectiveToken',null,'B-alien') from db32_capture where lid='a3200000-0000-4000-8000-000000000012'$$,'22023','ineligible winner','manual entry rejects membership forgery');
select throws_ok($$select mutate_event_lifecycle(lid,'a3200000-0000-4000-8000-000000000022','m','hold','{"held":false}',' ',snap->'basis'->'effective'->'m'->>'effectiveToken',null,'B-blank') from db32_capture where lid='a3200000-0000-4000-8000-000000000012'$$,'22023','invalid lifecycle command','reason mandatory');
reset role;
insert into contest_results(contest_id,event_edition_id,version,result_status,outcome_type,source_type,idempotency_key,supersedes_result_id,correction_reason)
values('a3200000-0000-4000-8000-000000000004','a3200000-0000-4000-8000-000000000003',2,'unresolved','pending','operator','db32-result-2','a3200000-0000-4000-8000-000000000030','Synthetic invalidation');
set local role service_role;
update db32_capture set snap=capture_event_lifecycle(lid);
select is(commit_event_lifecycle(lid,(snap->>'generation')::bigint,snap->>'basisToken','[]')->>'state','locked','invalidation reopens A not picks') from db32_capture where lid='a3200000-0000-4000-8000-000000000011';
select is((select state from event_league_windows where league_id='a3200000-0000-4000-8000-000000000011'),'locked','pick window remains locked');
select is((select count(*)::integer from event_lifecycle_audit where kind='coronation' and league_id::text like 'a320%'),3,'no additional coronation');
-- Typed nomination overrides use the same immutable membership as canonical results.
reset role;
insert into contests(id,event_edition_id,stage_id,contest_key,name,kind) values
 ('a3200000-0000-4000-8000-000000000044','a3200000-0000-4000-8000-000000000003','a3200000-0000-4000-8000-000000000009','db32-category','Synthetic Category','category'),
 ('a3200000-0000-4000-8000-000000000045','a3200000-0000-4000-8000-000000000003','a3200000-0000-4000-8000-000000000009','db32-other-category','Synthetic Other Category','category');
insert into award_nominations(id,contest_id,event_edition_id,nomination_key,name,eligible) values
 ('a3200000-0000-4000-8000-000000000051','a3200000-0000-4000-8000-000000000044','a3200000-0000-4000-8000-000000000003','n1','Synthetic N1',true),
 ('a3200000-0000-4000-8000-000000000052','a3200000-0000-4000-8000-000000000044','a3200000-0000-4000-8000-000000000003','n2','Synthetic N2',true),
 ('a3200000-0000-4000-8000-000000000053','a3200000-0000-4000-8000-000000000045','a3200000-0000-4000-8000-000000000003','n3','Synthetic N3',true),
 ('a3200000-0000-4000-8000-000000000054','a3200000-0000-4000-8000-000000000044','a3200000-0000-4000-8000-000000000003','n4','Synthetic N4',false);
insert into templates(id,name,type,event_edition_id) values('a3200000-0000-4000-8000-000000000040','Synthetic DB32 Awards','pickem','a3200000-0000-4000-8000-000000000003');
insert into event_template_configs(template_id,version,sealed,manifest) values('a3200000-0000-4000-8000-000000000040',1,true,
'{"markets":[{"id":"c","windowId":"cw","choices":["a3200000-0000-4000-8000-000000000051","a3200000-0000-4000-8000-000000000052"],"scored":true,"outcomeDomain":"nomination-winner-set","contestId":"a3200000-0000-4000-8000-000000000044"}],
"lifecycle":{"binding":{"reviewed":true,"graphVersion":1,"markets":[{"marketId":"c","eligibleEntrantIds":["a3200000-0000-4000-8000-000000000051","a3200000-0000-4000-8000-000000000052","a3200000-0000-4000-8000-000000000053","a3200000-0000-4000-8000-000000000054"],"orientation":null}]}}}');
insert into leagues(id,name,template_id,organizer_token) values('a3200000-0000-4000-8000-000000000041','Synthetic awards','a3200000-0000-4000-8000-000000000040','a3200000-0000-4000-8000-000000000042');
insert into event_league_evaluations(league_id,configuration_version) values('a3200000-0000-4000-8000-000000000041',1);
select configure_event_window('a3200000-0000-4000-8000-000000000041','cw',0,'open',clock_timestamp()-interval '1 second',true,array['c']);
select advance_event_windows('a3200000-0000-4000-8000-000000000041');
set local role service_role;
insert into db32_capture values('a3200000-0000-4000-8000-000000000041',capture_event_lifecycle('a3200000-0000-4000-8000-000000000041'));
select throws_ok($$select mutate_event_lifecycle(lid,'a3200000-0000-4000-8000-000000000042','c','override','{"outcome":{"kind":"winner-set","entrants":[]}}','Synthetic invalid set',snap->'basis'->'effective'->'c'->>'effectiveToken',null,'invalid-set-0') from db32_capture where lid='a3200000-0000-4000-8000-000000000041'$$,'22023','invalid nomination set','override rejects empty set');
select throws_ok($$select mutate_event_lifecycle(lid,'a3200000-0000-4000-8000-000000000042','c','override','{"outcome":{"kind":"winner-set","entrants":["a3200000-0000-4000-8000-000000000051","a3200000-0000-4000-8000-000000000051"]}}','Synthetic invalid set',snap->'basis'->'effective'->'c'->>'effectiveToken',null,'invalid-set-1') from db32_capture where lid='a3200000-0000-4000-8000-000000000041'$$,'22023','invalid nomination set','override rejects duplicate set');
select throws_ok($$select mutate_event_lifecycle(lid,'a3200000-0000-4000-8000-000000000042','c','override','{"outcome":{"kind":"winner-set","entrants":["a3200000-0000-4000-8000-000000000053"]}}','Synthetic invalid set',snap->'basis'->'effective'->'c'->>'effectiveToken',null,'invalid-set-2') from db32_capture where lid='a3200000-0000-4000-8000-000000000041'$$,'22023','ineligible nomination','override rejects cross-category membership');
select throws_ok($$select mutate_event_lifecycle(lid,'a3200000-0000-4000-8000-000000000042','c','override','{"outcome":{"kind":"winner-set","entrants":["a3200000-0000-4000-8000-000000000054"]}}','Synthetic invalid set',snap->'basis'->'effective'->'c'->>'effectiveToken',null,'invalid-set-3') from db32_capture where lid='a3200000-0000-4000-8000-000000000041'$$,'22023','ineligible nomination','override rejects ineligible nomination');
select throws_ok($$select mutate_event_lifecycle(lid,'a3200000-0000-4000-8000-000000000042','c','override','{"outcome":{"kind":"winner","entrant":"a3200000-0000-4000-8000-000000000051"}}','Synthetic invalid set',snap->'basis'->'effective'->'c'->>'effectiveToken',null,'invalid-set-4') from db32_capture where lid='a3200000-0000-4000-8000-000000000041'$$,'22023','unsupported outcome domain','override rejects scalar winner in category');
select throws_ok($$select mutate_event_lifecycle(lid,'a3200000-0000-4000-8000-000000000042','c','override','{"outcome":{"kind":"draw"}}','Synthetic invalid set',snap->'basis'->'effective'->'c'->>'effectiveToken',null,'invalid-set-5') from db32_capture where lid='a3200000-0000-4000-8000-000000000041'$$,'22023','unsupported outcome domain','override rejects category draw');
select is((capture_event_lifecycle(lid)->>'generation'),snap->>'generation','rejected typed mutations record no generation') from db32_capture where lid='a3200000-0000-4000-8000-000000000041';
select lives_ok($$select mutate_event_lifecycle(lid,'a3200000-0000-4000-8000-000000000042','c','override','{"outcome":{"kind":"winner-set","entrants":["a3200000-0000-4000-8000-000000000052","a3200000-0000-4000-8000-000000000051"]}}','Synthetic tied award',snap->'basis'->'effective'->'c'->>'effectiveToken',null,'valid-set') from db32_capture where lid='a3200000-0000-4000-8000-000000000041'$$,'scoped winner set accepted');
select is(capture_event_lifecycle(lid)->'basis'->'effective'->'c'->'outcome'->'entrants','["a3200000-0000-4000-8000-000000000051","a3200000-0000-4000-8000-000000000052"]'::jsonb,'nomination set canonical order') from db32_capture where lid='a3200000-0000-4000-8000-000000000041';
update db32_capture set snap=capture_event_lifecycle(lid);
select is(commit_event_lifecycle(lid,(snap->>'generation')::bigint,snap->>'basisToken','[]')->>'state','complete','tied awards complete using full typed set') from db32_capture where lid='a3200000-0000-4000-8000-000000000041';

reset role;
set local role anon;
select throws_ok($$select capture_event_lifecycle('a3200000-0000-4000-8000-000000000011')$$,'42501',null,'anonymous capture denied');
select throws_ok($$select read_event_lifecycle('a3200000-0000-4000-8000-000000000011')$$,'42501',null,'RPC reader service only');
reset role;
select * from finish();
rollback;
