-- Final schema expects PT409; historical-prefix runners explicitly set bracket.test_business_sqlstate.
begin;
select plan(25);
select has_table('public','event_template_configs','typed template configuration exists');
select has_table('public','event_league_windows','durable per-league windows exist');
select has_table('public','event_league_evaluations','evaluated generations stored');
select has_function('public','submit_event_window',array['uuid','uuid','text','integer','jsonb'],'scoped atomic submission function exists');
select has_function('public','read_event_picks',array['uuid','uuid'],'safe window read exists');
select ok(not has_function_privilege('anon','submit_event_window(uuid,uuid,text,integer,jsonb)','execute'),'anon cannot invoke privileged submission');
select ok(not has_table_privilege('authenticated','event_league_windows','select'),'authenticated cannot bypass window embargo');
insert into templates(id,name,type) values('b2800000-0000-4000-8000-000000000001','Synthetic window fixture','bracket');
insert into leagues(id,name,template_id,organizer_token,join_token) values
('b2800000-0000-4000-8000-000000000002','Synthetic window league','b2800000-0000-4000-8000-000000000001','b2800000-0000-4000-8000-000000000003','b2800000-0000-4000-8000-000000000004');
insert into event_template_configs(template_id,version,sealed,manifest) values
('b2800000-0000-4000-8000-000000000001',1,true,'{"markets":[{"id":"m1","windowId":"w1","choices":["home","draw","away"]},{"id":"m2","windowId":"w1","choices":["home","away"]}]}');
insert into event_league_evaluations(league_id,configuration_version) values('b2800000-0000-4000-8000-000000000002',1);
insert into event_league_windows(league_id,window_key,state,cutoff,pairings_reviewed,market_ids)
values('b2800000-0000-4000-8000-000000000002','w1','open',now()+interval '1 day',true,array['m1','m2']);
insert into participants(id,league_id,display_name,magic_token) values
('b2800000-0000-4000-8000-000000000005','b2800000-0000-4000-8000-000000000002','P','b2800000-0000-4000-8000-000000000006'),
('b2800000-0000-4000-8000-000000000007','b2800000-0000-4000-8000-000000000002','Q','b2800000-0000-4000-8000-000000000008');
select throws_ok($$select submit_event_window('b2800000-0000-4000-8000-000000000002','b2800000-0000-4000-8000-000000000009','w1',1,'{"m1":"draw","m2":"home"}')$$,'42501','invalid participant credential','invalid credential rejected before writes');
select throws_ok($$select submit_event_window('b2800000-0000-4000-8000-000000000002','b2800000-0000-4000-8000-000000000006','w1',2,'{"m1":"draw","m2":"home"}')$$,coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'window unavailable or stale','stale version rejected');
select throws_ok($$select submit_event_window('b2800000-0000-4000-8000-000000000002','b2800000-0000-4000-8000-000000000006','w1',1,'{"m1":"draw"}')$$,'22023','complete window required','partial submission rejected');
select is((select count(*) from picks where league_id='b2800000-0000-4000-8000-000000000002'),0::bigint,'failed submissions wrote zero picks');
select lives_ok($$select submit_event_window('b2800000-0000-4000-8000-000000000002','b2800000-0000-4000-8000-000000000006','w1',1,'{"m1":"draw","m2":"home"}')$$,'complete eligible submission succeeds');
select is((select count(*) from read_event_picks('b2800000-0000-4000-8000-000000000002',null)),0::bigint,'anonymous sees no open picks');
select is((select count(*) from read_event_picks('b2800000-0000-4000-8000-000000000002','b2800000-0000-4000-8000-000000000008')),0::bigint,'another participant sees no open picks');
select is((select count(*) from read_event_picks('b2800000-0000-4000-8000-000000000002','b2800000-0000-4000-8000-000000000006')),2::bigint,'own credential reveals only own picks');
select freeze_event_league('b2800000-0000-4000-8000-000000000002','b2800000-0000-4000-8000-000000000003',true);
select throws_ok($$select submit_event_window('b2800000-0000-4000-8000-000000000002','b2800000-0000-4000-8000-000000000006','w1',1,'{"m1":"home","m2":"home"}')$$,coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'window unavailable or stale','freeze blocks edits');
select freeze_event_league('b2800000-0000-4000-8000-000000000002','b2800000-0000-4000-8000-000000000003',false);
select throws_ok($$update event_league_windows set cutoff=now()+interval '2 days' where league_id='b2800000-0000-4000-8000-000000000002'$$,'23514','cutoff cannot move later','postponement cannot extend cutoff');
update event_league_windows set cutoff=now()-interval '1 second' where league_id='b2800000-0000-4000-8000-000000000002';
select throws_ok($$select submit_event_window('b2800000-0000-4000-8000-000000000002','b2800000-0000-4000-8000-000000000006','w1',1,'{"m1":"home","m2":"home"}')$$,coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'window unavailable or stale','database time forbids post-cutoff submission');
select is((select count(*) from read_event_picks('b2800000-0000-4000-8000-000000000002',null)),2::bigint,'cutoff reveals locked picks safely');
select throws_ok($$select * from join_event_league('b2800000-0000-4000-8000-000000000002','b2800000-0000-4000-8000-000000000004','late')$$,coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'entry closed','first cutoff rejects new entrants');
select is(legacy_event_format_supported('b2800000-0000-4000-8000-000000000002'),false,'legacy compatibility explicitly rejects typed format');
select is(advance_event_windows('b2800000-0000-4000-8000-000000000002'),1,'due window advances once');
select is(advance_event_windows('b2800000-0000-4000-8000-000000000002'),0,'window advance replay is idempotent');
select is((select status::text from leagues where id='b2800000-0000-4000-8000-000000000002'),'locked','overall league locks at first cutoff');
select throws_ok($$update leagues set status='active',locked_at=null where id='b2800000-0000-4000-8000-000000000002'$$,'23514','event picks cannot reopen','legacy unlock cannot reopen event picks');
select * from finish();
rollback;
