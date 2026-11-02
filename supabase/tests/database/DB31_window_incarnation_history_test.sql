-- Final schema expects PT409; historical-prefix runners explicitly set bracket.test_business_sqlstate.
begin; select no_plan();

insert into templates(id,name,type) values('b3100000-0000-4000-8000-000000000001','SYNTHETIC DB31','bracket');
insert into leagues(id,name,template_id) values('b3100000-0000-4000-8000-000000000002','SYNTHETIC DB31','b3100000-0000-4000-8000-000000000001');
insert into participants(id,league_id,display_name,magic_token) values('b3100000-0000-4000-8000-000000000003','b3100000-0000-4000-8000-000000000002','Synthetic','b3100000-0000-4000-8000-000000000004');
insert into event_template_configs(template_id,version,sealed,manifest)
select 'b3100000-0000-4000-8000-000000000001',v,true,'{"markets":[{"id":"m","windowId":"w","choices":["a","b"]}]}'::jsonb from generate_series(1,3) v;
insert into event_league_evaluations(league_id,configuration_version) values('b3100000-0000-4000-8000-000000000002',1);
set local role service_role;
select is(current_user::text,'service_role','actual service role');

select lives_ok('select configure_event_window(''b3100000-0000-4000-8000-000000000002'',''w'',0,''unopened'',null,true,array[''m''],false)','unscheduled draft create');
select lives_ok('select configure_event_window(''b3100000-0000-4000-8000-000000000002'',''w'',(select version from event_league_windows where league_id=''b3100000-0000-4000-8000-000000000002''),''open'',now()+interval ''2 hours'',true,array[''m''],true)','unscheduled draft delete');
select lives_ok('select configure_event_window(''b3100000-0000-4000-8000-000000000002'',''w'',0,''unopened'',null,true,array[''m''],false)','unscheduled draft rebuild');
select is((select version from event_league_windows where league_id='b3100000-0000-4000-8000-000000000002'),2,'draft rebuild allocates version 2');
select lives_ok('select configure_event_window(''b3100000-0000-4000-8000-000000000002'',''w'',(select version from event_league_windows where league_id=''b3100000-0000-4000-8000-000000000002''),''open'',now()+interval ''4 hours'',true,array[''m''],false)','open rebuilt window');
select lives_ok('select configure_event_window(''b3100000-0000-4000-8000-000000000002'',''w'',(select version from event_league_windows where league_id=''b3100000-0000-4000-8000-000000000002''),''open'',now()+interval ''3 hours'',true,array[''m''],false)','tighten version 4');
select lives_ok('select adopt_event_configuration(''b3100000-0000-4000-8000-000000000002'',1,2)','adoption increments allocated version');
select is((select version from event_league_windows where league_id='b3100000-0000-4000-8000-000000000002'),5,'adoption version 5');
select lives_ok('select configure_event_window(''b3100000-0000-4000-8000-000000000002'',''w'',(select version from event_league_windows where league_id=''b3100000-0000-4000-8000-000000000002''),''open'',now()+interval ''2 hours'',true,array[''m''],true)','delete adopted draft');
select throws_ok('select configure_event_window(''b3100000-0000-4000-8000-000000000002'',''w'',0,''open'',now()+interval ''5 hours'',true,array[''m''],false)','23514','cutoff cannot move later','history rejects later recreation');
select throws_ok('select configure_event_window(''b3100000-0000-4000-8000-000000000002'',''w'',0,''unopened'',null,true,array[''m''],false)','23514','cutoff cannot move later','history rejects null erasure');
select lives_ok('select configure_event_window(''b3100000-0000-4000-8000-000000000002'',''w'',0,''open'',now()+interval ''3 hours'',true,array[''m''],false)','equal cutoff recreation');
select is((select version from event_league_windows where league_id='b3100000-0000-4000-8000-000000000002'),6,'recreation after adoption allocates version 6');
select lives_ok('select configure_event_window(''b3100000-0000-4000-8000-000000000002'',''w'',(select version from event_league_windows where league_id=''b3100000-0000-4000-8000-000000000002''),''open'',now()+interval ''2 hours'',true,array[''m''],true)','repeat delete');
select lives_ok('select adopt_event_configuration(''b3100000-0000-4000-8000-000000000002'',2,3)','adopt while absent');
select lives_ok('select configure_event_window(''b3100000-0000-4000-8000-000000000002'',''w'',0,''open'',now()+interval ''2 hours'',true,array[''m''],false)','earlier cutoff recreation');
select is((select version from event_league_windows where league_id='b3100000-0000-4000-8000-000000000002'),7,'repeated recreation allocates version 7');
create temp table wpr1_before as select generation from event_league_evaluations where league_id='b3100000-0000-4000-8000-000000000002';
select throws_ok('select configure_event_window(''b3100000-0000-4000-8000-000000000002'',''w'',1,''open'',now()+interval ''2 hours'',true,array[''m''],false)',coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'window unavailable or stale','stale configure v1 rejected');
select throws_ok('select configure_event_window(''b3100000-0000-4000-8000-000000000002'',''w'',2,''open'',now()+interval ''2 hours'',true,array[''m''],false)',coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'window unavailable or stale','stale configure v2 rejected');
select throws_ok('select configure_event_window(''b3100000-0000-4000-8000-000000000002'',''w'',5,''open'',now()+interval ''2 hours'',true,array[''m''],false)',coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'window unavailable or stale','stale configure v5 rejected');
select throws_ok('select configure_event_window(''b3100000-0000-4000-8000-000000000002'',''w'',6,''open'',now()+interval ''2 hours'',true,array[''m''],false)',coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'window unavailable or stale','stale configure v6 rejected');
select throws_ok('select submit_event_window(''b3100000-0000-4000-8000-000000000002'',''b3100000-0000-4000-8000-000000000004'',''w'',2,''{"m":"a"}'')',coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'window unavailable or stale','stale submit v2 rejected');
select throws_ok('select submit_event_window(''b3100000-0000-4000-8000-000000000002'',''b3100000-0000-4000-8000-000000000004'',''w'',5,''{"m":"a"}'')',coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'window unavailable or stale','stale submit v5 rejected');
select throws_ok('select submit_event_window(''b3100000-0000-4000-8000-000000000002'',''b3100000-0000-4000-8000-000000000004'',''w'',6,''{"m":"a"}'')',coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'window unavailable or stale','stale submit v6 rejected');
select throws_ok('select submit_event_window(''b3100000-0000-4000-8000-000000000002'',''b3100000-0000-4000-8000-000000000004'',''w'',1,''{"m":"a"}'')',coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'window unavailable or stale','stale submit v1 rejected');
select is((select generation from event_league_evaluations where league_id='b3100000-0000-4000-8000-000000000002'),(select generation from wpr1_before),'rejected operations preserve generation');
select is((select count(*) from picks where league_id='b3100000-0000-4000-8000-000000000002'),0::bigint,'stale operations write no picks');
select throws_ok('select submit_event_window(''b3100000-0000-4000-8000-000000000002'',''b3100000-0000-4000-8000-000000000099'',''w'',(select version from event_league_windows where league_id=''b3100000-0000-4000-8000-000000000002''),''{"m":"a"}'')','42501','invalid participant credential','credential guard');
select throws_ok('select submit_event_window(''b3100000-0000-4000-8000-000000000002'',''b3100000-0000-4000-8000-000000000004'',''w'',(select version from event_league_windows where league_id=''b3100000-0000-4000-8000-000000000002''),''{"m":"invalid"}'')','22023','ineligible market choice','choice guard');
select lives_ok('select submit_event_window(''b3100000-0000-4000-8000-000000000002'',''b3100000-0000-4000-8000-000000000004'',''w'',(select version from event_league_windows where league_id=''b3100000-0000-4000-8000-000000000002''),''{"m":"a"}'')','fresh version submission succeeds');
select throws_ok('select configure_event_window(''b3100000-0000-4000-8000-000000000002'',''w'',(select version from event_league_windows where league_id=''b3100000-0000-4000-8000-000000000002''),''open'',now()+interval ''2 hours'',true,array[''m''],true)','23514','sealed market membership cannot change','first prediction forbids deletion');

-- Security boundary: actual DML, not ACL introspection alone.
select throws_ok($q$update event_window_incarnation_history set last_version=1$q$,'42501','permission denied for table event_window_incarnation_history','service history UPDATE denied');
select throws_ok($q$delete from event_window_incarnation_history$q$,'42501','permission denied for table event_window_incarnation_history','service history DELETE denied');
select throws_ok($q$truncate event_window_incarnation_history$q$,'42501','permission denied for table event_window_incarnation_history','service history TRUNCATE denied');
select throws_ok($q$insert into event_window_incarnation_history values('b3100000-0000-4000-8000-000000000002','fake',1,null)$q$,'42501','permission denied for table event_window_incarnation_history','service history INSERT denied');
select ok(not has_table_privilege('anon','event_window_incarnation_history','select'),'anonymous cannot read history');
select ok(not has_table_privilege('authenticated','event_window_incarnation_history','select'),'authenticated cannot read history');
select ok(not has_function_privilege('service_role','protect_event_window()','execute'),'service cannot call internal allocator');
select ok(not has_function_privilege('anon','configure_event_window(uuid,text,integer,text,timestamptz,boolean,text[],boolean)','execute'),'anonymous configure denied');
select ok(not has_function_privilege('authenticated','configure_event_window(uuid,text,integer,text,timestamptz,boolean,text[],boolean)','execute'),'authenticated configure denied');

-- Both version-bumping paths share the ledger.
select configure_event_window('b3100000-0000-4000-8000-000000000002','w',7,'open',now()-interval '1 minute',true,array['m']);
select is(advance_event_windows('b3100000-0000-4000-8000-000000000002'),1,'advancement locks one window');
select is((select last_version from event_window_incarnation_history where league_id='b3100000-0000-4000-8000-000000000002'),9,'advance records version 9');
select is((select earliest_cutoff from event_window_incarnation_history where league_id='b3100000-0000-4000-8000-000000000002'),now()-interval '1 minute','advance retains earliest cutoff');
select is((select count(*) from picks where league_id='b3100000-0000-4000-8000-000000000002' and locked),1::bigint,'advance locks original pick');

reset role;
insert into leagues(id,name,template_id) values('b3100000-0000-4000-8000-000000000005','SYNTHETIC DB31 expired','b3100000-0000-4000-8000-000000000001');
insert into event_league_evaluations(league_id,configuration_version) values('b3100000-0000-4000-8000-000000000005',1);
set local role service_role;
select configure_event_window('b3100000-0000-4000-8000-000000000005','w',0,'open',now()+interval '1 hour',true,array['m']);
-- SQL rollback must restore both allocator and ordinary generation.
savepoint allocation;
select configure_event_window('b3100000-0000-4000-8000-000000000005','w',1,null,null,null,null,true);
select configure_event_window('b3100000-0000-4000-8000-000000000005','w',0,'open',now()+interval '30 minutes',true,array['m']);
rollback to allocation;
select is((select last_version from event_window_incarnation_history where league_id='b3100000-0000-4000-8000-000000000005'),1,'transaction rollback restores allocator');
select is((select generation from event_league_evaluations where league_id='b3100000-0000-4000-8000-000000000005'),2::bigint,'transaction rollback restores generation');
select is((select earliest_cutoff from event_window_incarnation_history where league_id='b3100000-0000-4000-8000-000000000005'),now()+interval '1 hour','transaction rollback restores earliest deadline');
select configure_event_window('b3100000-0000-4000-8000-000000000005','w',1,'open',now()-interval '1 minute',true,array['m']);
select throws_ok($q$select configure_event_window('b3100000-0000-4000-8000-000000000005','w',2,null,null,null,null,true)$q$,'23514','sealed market membership cannot change','elapsed cutoff no picks rejects deletion');
select is((select count(*) from picks where league_id='b3100000-0000-4000-8000-000000000005'),0::bigint,'elapsed control has zero picks');
select is((select generation from event_league_evaluations where league_id='b3100000-0000-4000-8000-000000000005'),3::bigint,'elapsed rejection leaves generation');

-- Removing a scheduled draft does not erase semantic expiry.
reset role;
insert into leagues(id,name,template_id) values('b3100000-0000-4000-8000-000000000006','SYNTHETIC DB31 absent expiry','b3100000-0000-4000-8000-000000000001');
insert into event_league_evaluations(league_id,configuration_version) values('b3100000-0000-4000-8000-000000000006',1);
set local role service_role;
select configure_event_window('b3100000-0000-4000-8000-000000000006','w',0,'open',clock_timestamp()+interval '2 seconds',true,array['m']);
select configure_event_window('b3100000-0000-4000-8000-000000000006','w',1,null,null,null,null,true);
-- A bounded clock boundary, not a concurrency ordering sleep.
do $q$ declare deadline timestamptz; begin
 select earliest_cutoff into deadline from event_window_incarnation_history where league_id='b3100000-0000-4000-8000-000000000006';
 while clock_timestamp()<=deadline loop perform pg_sleep(0.01); end loop;
end $q$;
select ok(event_membership_closed('b3100000-0000-4000-8000-000000000006'),'absent historical deadline closes membership');
select throws_ok($q$select configure_event_window('b3100000-0000-4000-8000-000000000006','w',0,'unopened',null,false,array['m'])$q$,'23514','sealed market membership cannot change','expired deleted identity cannot return unscheduled');
select throws_ok($q$select adopt_event_configuration('b3100000-0000-4000-8000-000000000006',1,2)$q$,'23514','sealed configuration basis cannot change','expired absent deadline blocks adoption');
select is((select generation from event_league_evaluations where league_id='b3100000-0000-4000-8000-000000000006'),3::bigint,'expired absent rejection leaves generation');

-- Higher-version ABA: the old v2 must not reappear after recreation + update.
reset role;
insert into leagues(id,name,template_id) values('b3100000-0000-4000-8000-000000000007','SYNTHETIC DB31 v2 ABA','b3100000-0000-4000-8000-000000000001');
insert into event_league_evaluations(league_id,configuration_version) values('b3100000-0000-4000-8000-000000000007',1);
insert into participants(id,league_id,display_name,magic_token) values('b3100000-0000-4000-8000-000000000008','b3100000-0000-4000-8000-000000000007','Synthetic','b3100000-0000-4000-8000-000000000009');
set local role service_role;
select configure_event_window('b3100000-0000-4000-8000-000000000007','w',0,'open',now()+interval '4 hours',true,array['m']);
select configure_event_window('b3100000-0000-4000-8000-000000000007','w',1,'open',now()+interval '3 hours',true,array['m']);
select configure_event_window('b3100000-0000-4000-8000-000000000007','w',2,'open',now()+interval '2 hours',true,array['m']);
select throws_ok($q$select submit_event_window('b3100000-0000-4000-8000-000000000007','b3100000-0000-4000-8000-000000000009','w',2,'{"m":"a"}')$q$,coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'window unavailable or stale','v2 stale before rebuild');
select configure_event_window('b3100000-0000-4000-8000-000000000007','w',3,null,null,null,null,true);
select configure_event_window('b3100000-0000-4000-8000-000000000007','w',0,'unopened',now()+interval '2 hours',true,array['m']);
select configure_event_window('b3100000-0000-4000-8000-000000000007','w',4,'open',now()+interval '1 hour',true,array['m']);
select is((select version from event_league_windows where league_id='b3100000-0000-4000-8000-000000000007'),5,'recreation and state update continue past original v3');
select throws_ok($q$select submit_event_window('b3100000-0000-4000-8000-000000000007','b3100000-0000-4000-8000-000000000009','w',2,'{"m":"a"}')$q$,coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'window unavailable or stale','same v2 stale after rebuild and reopen');
select throws_ok($q$select configure_event_window('b3100000-0000-4000-8000-000000000007','w',2,'open',now()+interval '1 hour',true,array['m'])$q$,coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),'window unavailable or stale','same v2 configure stale after reopen');
select is((select generation from event_league_evaluations where league_id='b3100000-0000-4000-8000-000000000007'),7::bigint,'higher ABA rejections leave generation');
select is((select count(*) from picks where league_id='b3100000-0000-4000-8000-000000000007'),0::bigint,'higher ABA writes no picks');
select configure_event_window('b3100000-0000-4000-8000-000000000007','w',5,'open',now()+interval '1 hour',true,array['m']);
select is((select last_version from event_window_incarnation_history where league_id='b3100000-0000-4000-8000-000000000007'),5,'no-op configuration does not allocate');
select is((select generation from event_league_evaluations where league_id='b3100000-0000-4000-8000-000000000007'),7::bigint,'no-op configuration does not generate');
select throws_ok($q$select configure_event_window('b3100000-0000-4000-8000-000000000007','w',5,'open',now()+interval '30 minutes',false,array['m'])$q$,'23514',null,'constraint failure after trigger rolls back allocation');
select is((select last_version from event_window_incarnation_history where league_id='b3100000-0000-4000-8000-000000000007'),5,'failed row CHECK restores history version');
select is((select earliest_cutoff from event_window_incarnation_history where league_id='b3100000-0000-4000-8000-000000000007'),now()+interval '1 hour','failed row CHECK restores history cutoff');
select is((select generation from event_league_evaluations where league_id='b3100000-0000-4000-8000-000000000007'),7::bigint,'failed row CHECK restores generation');
select lives_ok($q$select submit_event_window('b3100000-0000-4000-8000-000000000007','b3100000-0000-4000-8000-000000000009','w',5,'{"m":"a"}')$q$,'fresh higher incarnation succeeds');
reset role;
select * from finish();
rollback;
select count(*) as fixture_residue from templates where id='b3100000-0000-4000-8000-000000000001';
