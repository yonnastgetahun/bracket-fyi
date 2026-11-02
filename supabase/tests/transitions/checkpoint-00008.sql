-- Owner-only synthetic bootstrap; review command creates real manifest/audit rows.
begin;
insert into event_operator_principals(id) values(md5('transition-history-operator')::uuid);
insert into event_operator_credentials(credential_hash,principal_id,expires_at)
values(encode(extensions.digest('synthetic-transition-operator-credential','sha256'),'hex'),
 md5('transition-history-operator')::uuid,'infinity');
insert into event_operator_grants(principal_id,environment,event_edition_id,action)
values(md5('transition-history-operator')::uuid,'local',md5('transition-edition')::uuid,'manifest.review');
insert into data_providers(id,adapter_key,display_name)
values(md5('transition-history-provider')::uuid,'transition-history','Synthetic history provider');
insert into provider_bindings(id,provider_id,event_edition_id,binding_key)
values(md5('transition-history-binding')::uuid,md5('transition-history-provider')::uuid,
 md5('transition-edition')::uuid,'synthetic');
insert into ingestion_runs(id,binding_id,provider_id,event_edition_id,claim_key,trigger_kind,status,claimed_by,finished_at)
values(md5('transition-history-run')::uuid,md5('transition-history-binding')::uuid,md5('transition-history-provider')::uuid,
 md5('transition-edition')::uuid,'transition-history-run','manual','succeeded','synthetic-fixture',clock_timestamp());
insert into event_provider_attempts(id,run_id,binding_id,attempt_key,state,authorized_at,start_deadline,started_at,finished_at)
values(md5('transition-history-provider-attempt')::uuid,md5('transition-history-run')::uuid,
 md5('transition-history-binding')::uuid,'transition-history-provider-attempt','completed',
 now(),now()+interval '1 minute',now(),clock_timestamp());
set local role service_role;
select event_operator_command('synthetic-transition-operator-credential','local',md5('transition-edition')::uuid,
 'manifest.review',0,'Synthetic historical manifest','{"manifestKey":"transition-history","manifest":{"synthetic":true,"reviewed":true}}');
commit;
