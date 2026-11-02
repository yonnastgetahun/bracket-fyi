-- Final schema expects PT409; historical-prefix runners explicitly set bracket.test_business_sqlstate.
begin;
select no_plan();
update event_runtime_control set global_stopped=false;
insert into data_providers(id,adapter_key,display_name) values('b3400000-0000-4000-8000-000000000001','op34','Synthetic operator');
insert into organizations(id,organization_key,name,kind) values('b3400000-0000-4000-8000-000000000002','op34','Synthetic','league');
insert into competitions(id,organization_id,competition_key,name,domain,sport_code)
values('b3400000-0000-4000-8000-000000000003','b3400000-0000-4000-8000-000000000002','op34','Synthetic','sport','synthetic');
insert into event_editions(id,competition_id,edition_key,name,season_label)
values('b3400000-0000-4000-8000-000000000004','b3400000-0000-4000-8000-000000000003','2026','Synthetic','2026');
insert into stages(id,event_edition_id,stage_key,name,kind,ordinal)
values('b3400000-0000-4000-8000-000000000005','b3400000-0000-4000-8000-000000000004','final','Final','knockout',1);
insert into contests(id,event_edition_id,stage_id,contest_key,name,kind)
values('b3400000-0000-4000-8000-000000000006','b3400000-0000-4000-8000-000000000004','b3400000-0000-4000-8000-000000000005','final','Final','match');
insert into provider_bindings(id,provider_id,event_edition_id,binding_key,mode)
values('b3400000-0000-4000-8000-000000000007','b3400000-0000-4000-8000-000000000001','b3400000-0000-4000-8000-000000000004','primary','write');
insert into ingestion_runs(id,binding_id,provider_id,event_edition_id,claim_key,trigger_kind,claimed_by,lease_expires_at,lease_token,status)
values('b3400000-0000-4000-8000-000000000008','b3400000-0000-4000-8000-000000000007','b3400000-0000-4000-8000-000000000001',
'b3400000-0000-4000-8000-000000000004','operator34','replay','synthetic',now()+interval '1 hour','synthetic-lease','running');
insert into event_operator_principals(id) values('b3400000-0000-4000-8000-000000000009');
insert into event_operator_credentials values(encode(extensions.digest('synthetic-operator-credential-34','sha256'),'hex'),'b3400000-0000-4000-8000-000000000009',true,now()+interval '1 hour');
insert into event_operator_grants(principal_id,environment,event_edition_id,action)
select 'b3400000-0000-4000-8000-000000000009','local','b3400000-0000-4000-8000-000000000004',a
from unnest(array['binding.mode','health.read','mapping.review','manifest.review','result.record','replay.project']) a;
insert into event_operator_grants(principal_id,environment,action)
values('b3400000-0000-4000-8000-000000000009','local','global.stop');
create function pg_temp.op34(action text,version bigint,payload jsonb,credential text default 'synthetic-operator-credential-34',environment text default 'local')
returns jsonb language sql as $$
 select event_operator_command(credential,environment,case when action in ('global.stop','notification.control') then null else 'b3400000-0000-4000-8000-000000000004'::uuid end,
 action,version,'Synthetic reason',payload);
$$;
create function pg_temp.op34_key() returns text language sql as $$
 select 'v1:request:b3400000-0000-4000-8000-000000000008:0:'||slice_2c_page_key(id,checkpoint_generation,provider_cursor,provider_etag)
 from provider_bindings where id='b3400000-0000-4000-8000-000000000007';
$$;
set local role anon;
select throws_ok($q$select event_operator_command('synthetic-operator-credential-34','local',null,'global.stop',0,'reason','{"stopped":true}')$q$,'42501',null,'anonymous cannot invoke operator RPC');
reset role;
set local role service_role;
select throws_ok($q$select upsert_provider_entity_mapping('b3400000-0000-4000-8000-000000000007','contest','forged','b3400000-0000-4000-8000-000000000006','reviewed',1,'forged',now(),'{}')$q$,'42501',null,'service cannot forge reviewed mapping through old RPC');
select ok(not has_table_privilege('service_role','provider_entity_refs','INSERT') and not has_table_privilege('service_role','provider_entity_refs','UPDATE'),'service cannot forge reviewed mapping by direct table writes');
select ok(not has_table_privilege('service_role','contest_results','INSERT'),'service cannot forge direct operator shared result');
select throws_ok('select * from event_operator_credentials','42501',null,'service cannot select credentials');
select throws_ok($q$select assert_event_operator('synthetic-operator-credential-34','local',null,'global.stop')$q$,'42501',null,'service cannot invoke verifier separately');
select throws_ok($q$select pg_temp.op34('health.read',0,'{"bindingId":"b3400000-0000-4000-8000-000000000007"}','forged-operator-credential-34')$q$,'42501',null,'forged credential rejected');
select throws_ok($q$select pg_temp.op34('health.read',0,'{"bindingId":"b3400000-0000-4000-8000-000000000007"}','synthetic-operator-credential-34','production')$q$,'42501',null,'wrong environment rejected');
select throws_ok($q$select pg_temp.op34('global.stop',0,'{"stopped":true,"actor":"forged"}')$q$,'22023',null,'caller actor rejected');
select throws_ok($q$select event_operator_command('synthetic-operator-credential-34','local',null,'global.stop',0,'synthetic-operator-credential-34','{"stopped":true}')$q$,'22023',null,'bearer cannot be persisted as audit reason');
select throws_ok($q$select pg_temp.op34('manifest.review',0,'{"manifestKey":"oops","manifest":{"note":"synthetic-operator-credential-34"}}')$q$,'22023',null,'bearer cannot be retained in manifest');
select is((pg_temp.op34('health.read',0,'{"bindingId":"b3400000-0000-4000-8000-000000000007"}')->>'mode'),'write','valid scoped health read');
select throws_ok($q$select event_operator_command('synthetic-operator-credential-34','local','b3400000-0000-4000-8000-000000000099','health.read',0,'reason','{"bindingId":"b3400000-0000-4000-8000-000000000007"}')$q$,'42501',null,'cross-event denied');
select throws_ok($q$select pg_temp.op34('binding.mode',9,'{"bindingId":"b3400000-0000-4000-8000-000000000007","mode":"shadow","fetchEnabled":true}')$q$,coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),null,'stale version rejected');
select is((pg_temp.op34('binding.mode',0,'{"bindingId":"b3400000-0000-4000-8000-000000000007","mode":"shadow","fetchEnabled":true}')->>'version'),'1','binding command increments version');
select is((pg_temp.op34('mapping.review',1,'{"bindingId":"b3400000-0000-4000-8000-000000000007","entityKind":"contest","externalId":"final","canonicalId":"b3400000-0000-4000-8000-000000000006","status":"reviewed"}')->>'outcome'),'created','reviewed mapping records registry actor');
select is((pg_temp.op34('manifest.review',0,'{"manifestKey":"official-field","manifest":{"source":"synthetic","slots":[]}}')->>'state'),'reviewed-source','official manifest explicitly stages source without false materialization claim');
select throws_ok($q$select pg_temp.op34('manifest.review',0,'{"manifestKey":"official-field","manifest":{}}')$q$,coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),null,'manifest revision enforced');
select is((pg_temp.op34('result.record',0,'{"contestId":"b3400000-0000-4000-8000-000000000006","status":"final","outcome":"draw","winnerEntryId":null,"winningNominationIds":[]}')->>'version'),'1','shared typed draw recorded');
select throws_ok($q$select pg_temp.op34('result.record',0,'{"contestId":"b3400000-0000-4000-8000-000000000006","status":"final","outcome":"draw","winnerEntryId":null,"winningNominationIds":[]}')$q$,coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409'),null,'duplicate result version does not create new correction');
reset role;
select is((select reviewed_by from provider_entity_refs where binding_id='b3400000-0000-4000-8000-000000000007'),'b3400000-0000-4000-8000-000000000009','mapping reviewer derives from registry');
select ok(not exists(select 1 from event_operator_audit where principal_id<>'b3400000-0000-4000-8000-000000000009'),'all audits derive stable principal');
select ok(not exists(select 1 from event_operator_audit where row_to_json(event_operator_audit)::text like '%synthetic-operator-credential-34%'),'audit contains no bearer');
update event_operator_credentials set active=false;
set local role service_role;
select throws_ok($q$select pg_temp.op34('health.read',2,'{"bindingId":"b3400000-0000-4000-8000-000000000007"}')$q$,'42501',null,'revoked credential denied');
reset role;
update event_operator_credentials set active=true,expires_at=now()-interval '1 second';
set local role service_role;
select throws_ok($q$select pg_temp.op34('health.read',2,'{"bindingId":"b3400000-0000-4000-8000-000000000007"}')$q$,'42501',null,'expired credential denied');
reset role;
update event_operator_credentials set expires_at=now()+interval '1 hour';
update event_operator_grants set active=false where action='health.read';
set local role service_role;
select throws_ok($q$select pg_temp.op34('health.read',2,'{"bindingId":"b3400000-0000-4000-8000-000000000007"}')$q$,'42501',null,'revoked action grant denied');
reset role;
update event_operator_grants set active=true,expires_at=now()-interval '1 second' where action='health.read';
set local role service_role;
select throws_ok($q$select pg_temp.op34('health.read',2,'{"bindingId":"b3400000-0000-4000-8000-000000000007"}')$q$,'42501',null,'expired action grant denied');
reset role;
update event_operator_grants set active=true,expires_at='infinity';
update event_operator_credentials set credential_hash=encode(extensions.digest('synthetic-rotated-credential-34','sha256'),'hex');
set local role service_role;
select throws_ok($q$select pg_temp.op34('health.read',2,'{"bindingId":"b3400000-0000-4000-8000-000000000007"}')$q$,'42501',null,'rotation invalidates old credential');
select is(pg_temp.op34('health.read',2,'{"bindingId":"b3400000-0000-4000-8000-000000000007"}','synthetic-rotated-credential-34')->>'version','2','rotation keeps stable principal/grants');
reset role;
update event_operator_credentials set credential_hash=encode(extensions.digest('synthetic-operator-credential-34','sha256'),'hex');
-- budget admission: no reservation -> deny; one reservation -> at most one permit
select throws_ok($q$select admit_event_provider_attempt('b3400000-0000-4000-8000-000000000008','synthetic-lease',pg_temp.op34_key())$q$,'42501',null,'admission cannot bypass account-wide reservation');
insert into provider_rate_budgets(provider_id,scope_key,configured_limit_count,configured_window_seconds,available_count,trusted_reset_at)
values('b3400000-0000-4000-8000-000000000001','provider',3,60,2,now()+interval '1 hour');
select is((select outcome from reserve_provider_budget('b3400000-0000-4000-8000-000000000008','synthetic-lease',pg_temp.op34_key(),1)),'reserved','real shared-budget RPC reserves attempt');
select is((select available_count from provider_rate_budgets where provider_id='b3400000-0000-4000-8000-000000000001'),1,'one actual attempt consumes one shared unit');
create temp table op34_permit as select admit_event_provider_attempt('b3400000-0000-4000-8000-000000000008','synthetic-lease',pg_temp.op34_key()) as value;
select is((select value->>'allowed' from op34_permit),'true','shadow allows fetch admission');
select is(admit_event_provider_attempt('b3400000-0000-4000-8000-000000000008','synthetic-lease',pg_temp.op34_key())->>'allowed','false','reservation cannot authorize duplicate attempt');
select is(pg_temp.op34('global.stop',0,'{"stopped":true}')->>'providerDrained','false','stop reports preauthorized outstanding work');
select is((select outcome from project_provider_result('b3400000-0000-4000-8000-000000000099')),'skipped_non_write','global stop dominates projection before narrower reads');
select is((select outcome from project_structural_observation('b3400000-0000-4000-8000-000000000099')),'skipped_non_write','global stop dominates structural projection');
select is(start_event_provider_attempt((select (value->>'permitId')::uuid from op34_permit),'b3400000-0000-4000-8000-000000000008','synthetic-lease'),false,'stop between permit and start cancels unsent attempt');
select is(pg_temp.op34('global.stop',1,'{"stopped":true}')->>'providerDrained','true','explicit canceled attempt now drained');
select is(admit_event_provider_attempt('b3400000-0000-4000-8000-000000000008','synthetic-lease',pg_temp.op34_key())->>'allowed','false','stop before admission denies');
select throws_ok($q$select pg_temp.op34('result.record',1,'{"contestId":"b3400000-0000-4000-8000-000000000006","status":"final","outcome":"draw","winnerEntryId":null,"winningNominationIds":[]}')$q$,'55000',null,'global stop blocks manual shared result');
set local role service_role;
select throws_ok('select set_event_notification_control(false,true)','42501',null,'uncredentialed notification toggle is private');
select throws_ok($q$select pg_temp.op34('notification.control',2,'{"enabled":true}')$q$,'42501',null,'global stop grant cannot imply notification authority');
reset role;
insert into event_operator_grants(principal_id,environment,action) values('b3400000-0000-4000-8000-000000000009','local','notification.control');
set local role service_role;
select is(pg_temp.op34('notification.control',2,'{"enabled":true}')->>'version','3','explicit credentialed notification command delegates existing setter');
reset role;
select ok((select global_stopped and notifications_enabled and not real_sends_enabled from event_runtime_control),'notification command preserves global stop and fake-only transport');
select * from finish();
rollback;
