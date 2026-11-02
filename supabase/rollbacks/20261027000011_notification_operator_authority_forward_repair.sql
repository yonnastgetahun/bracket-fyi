-- NO01/NO02: additive authority repair; no data rewrite or external effects.
-- Authority boundary is final function validation, not a delayed caller COMMIT.
begin;
-- GRANT is additive; remove inherited default ALL's table-level erasure path.
revoke truncate on public.notification_outbox,public.notification_attempts
 from public,anon,authenticated,service_role;
-- Do not silently call a direct REVOKE effective if a group role still grants it.
-- Such an installation fails closed and needs its owning group ACL repaired.
do $$
declare app_role text; history_table text;
begin
 foreach app_role in array array['anon','authenticated','service_role'] loop
  foreach history_table in array array['public.notification_outbox','public.notification_attempts'] loop
   if has_table_privilege(app_role,history_table,'TRUNCATE') then
    raise exception 'notification history TRUNCATE remains inherited for % on %',app_role,history_table using errcode='42501';
   end if;
  end loop;
 end loop;
end $$;

create or replace function public.assert_event_operator(p_credential text,p_environment text,p_event_id uuid,p_action text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare c event_operator_credentials%rowtype; p event_operator_principals%rowtype;
 grant_row event_operator_grants%rowtype; grant_deadline timestamptz; checked_at timestamptz;
begin
 if length(coalesce(p_credential,'')) < 24 then raise exception 'operator unauthorized' using errcode='42501'; end if;
 -- Stable identity only: WHERE expiry predicates can run BEFORE LockRows waits.
 select * into c from event_operator_credentials
 where credential_hash=encode(extensions.digest(p_credential,'sha256'),'hex') for share;
 if not found then raise exception 'operator unauthorized' using errcode='42501'; end if;
 select * into p from event_operator_principals where id=c.principal_id for share;
 if not found then raise exception 'operator unauthorized' using errcode='42501'; end if;
 -- Lock every exact-scope candidate in a stable order, including expired rows.
 -- A fresh query must not accidentally accept a newly inserted, unlocked grant.
 for grant_row in select * from event_operator_grants
 where principal_id=p.id and environment=p_environment
 and event_edition_id is not distinct from p_event_id and action=p_action
 order by id for share
 loop
  if grant_row.active and (grant_deadline is null or grant_row.expires_at>grant_deadline) then
   grant_deadline:=grant_row.expires_at;
  end if;
 end loop;
 checked_at:=clock_timestamp();
 if not c.active or not p.active or c.expires_at<=checked_at
 or grant_deadline is null or grant_deadline<=checked_at then
  raise exception 'operator unauthorized' using errcode='42501';
 end if;
 if not exists(select 1 from event_runtime_control where singleton and environment=p_environment) then
  raise exception 'operator unauthorized' using errcode='42501';
 end if;
 return p.id;
end $$;

create or replace function public.event_operator_command(p_credential text,p_environment text,p_event_id uuid,p_action text,
 p_expected_version bigint,p_reason text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; g event_runtime_control%rowtype; b provider_bindings%rowtype;
 previous contest_results%rowtype; version_now bigint; response jsonb; target text; row_result record;
 result_id uuid; allowed_keys text[]; outstanding jsonb; notification_outstanding jsonb; key_value text;
begin
 -- Serialize commands with provider admission and projection before any narrower lock.
 select * into g from event_runtime_control where singleton for update;
 actor:=assert_event_operator(p_credential,p_environment,p_event_id,p_action);
 -- Even accidental reflection in a reason/manifest must not persist a bearer.
 if strpos(coalesce(p_reason,''),p_credential)>0 or
 strpos(coalesce(p_payload::text,''),substring(to_jsonb(p_credential)::text from 2 for length(to_jsonb(p_credential)::text)-2))>0 then
  raise exception 'invalid operator command' using errcode='22023'; end if;
 if p_expected_version is null or p_expected_version<0 or length(btrim(coalesce(p_reason,''))) not between 1 and 500
 or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid operator command' using errcode='22023'; end if;
 allowed_keys:=case p_action
 when 'global.stop' then array['stopped']
 when 'notification.control' then array['enabled']
 when 'binding.mode' then array['bindingId','mode','fetchEnabled']
 when 'health.read' then array['bindingId']
 when 'mapping.review' then array['bindingId','entityKind','externalId','canonicalId','status']
 when 'result.record' then array['contestId','status','outcome','winnerEntryId','winningNominationIds']
 when 'manifest.review' then array['manifestKey','manifest']
 when 'replay.project' then array['bindingId','observationId','kind'] end;
 if allowed_keys is null or exists(select 1 from jsonb_object_keys(p_payload) k where not k=any(allowed_keys)) then
 raise exception 'invalid operator command' using errcode='22023'; end if;
 if p_action in ('global.stop','notification.control') then
  version_now:=g.version; target:='global';
 elsif p_action in ('binding.mode','health.read','mapping.review','replay.project') then
  select * into b from provider_bindings where id=(p_payload->>'bindingId')::uuid and event_edition_id=p_event_id for update;
  if not found then raise exception 'operator unauthorized' using errcode='42501'; end if;
  version_now:=b.operator_version; target:=b.id::text;
 elsif p_action='result.record' then
  perform 1 from contests where id=(p_payload->>'contestId')::uuid and event_edition_id=p_event_id for update;
  if not found then raise exception 'operator unauthorized' using errcode='42501'; end if;
  select * into previous from contest_results where contest_id=(p_payload->>'contestId')::uuid order by version desc limit 1;
  version_now:=coalesce(previous.version,0); target:=p_payload->>'contestId';
 elsif p_action='manifest.review' then
  key_value:=p_payload->>'manifestKey';
  if key_value is null or key_value !~ '^[a-z0-9._-]{1,100}$' or jsonb_typeof(p_payload->'manifest') is distinct from 'object' then
   raise exception 'invalid manifest' using errcode='22023'; end if;
  select coalesce(max(version),0) into version_now from event_operator_manifests where event_edition_id=p_event_id and event_operator_manifests.manifest_key=key_value;
  target:=key_value;
 end if;
 -- Resource locks can outlive the initial authority check.
 perform assert_event_operator(p_credential,p_environment,p_event_id,p_action);
 if p_action<>'health.read' and version_now<>p_expected_version then raise exception 'operator version conflict' using errcode='40001'; end if;
 if p_action='global.stop' then
  if jsonb_typeof(p_payload->'stopped') is distinct from 'boolean' then raise exception 'invalid stop' using errcode='22023'; end if;
  update event_runtime_control set global_stopped=(p_payload->>'stopped')::boolean,version=version+1 where singleton;
  select coalesce(jsonb_agg(jsonb_build_object('permitId',id,'state',state,'startDeadline',start_deadline) order by id),'[]') into outstanding
   from event_provider_attempts where state in ('authorized','issued','uncertain');
  select coalesce(jsonb_agg(jsonb_build_object('attemptId',id,'state',disposition,'startDeadline',start_deadline) order by id),'[]')
   into notification_outstanding from notification_attempts where disposition in ('authorized','issued','uncertain');
  response:=jsonb_build_object('version',version_now+1,'stopped',(p_payload->>'stopped')::boolean,'providerOutstanding',outstanding,
   'providerDrained',jsonb_array_length(outstanding)=0,'notificationOutstanding',notification_outstanding,'drained',jsonb_array_length(outstanding)=0 and jsonb_array_length(notification_outstanding)=0);
 elsif p_action='notification.control' then
  if jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then raise exception 'invalid notification control' using errcode='22023'; end if;
  -- Delegate all notification behavior to 00007; the gateway supplies only
  -- credential/grant/version/audit authority and cannot enable real transports.
  response:=set_event_notification_control(g.global_stopped,(p_payload->>'enabled')::boolean);
  update event_runtime_control set version=version+1 where singleton;
  response:=response||jsonb_build_object('version',version_now+1);
 elsif p_action='binding.mode' then
  if p_payload->>'mode' is null or p_payload->>'mode' not in ('disabled','shadow','write') or jsonb_typeof(p_payload->'fetchEnabled') is distinct from 'boolean' then
   raise exception 'invalid binding controls' using errcode='22023'; end if;
  update provider_bindings set mode=p_payload->>'mode',fetch_enabled=(p_payload->>'fetchEnabled')::boolean,operator_version=operator_version+1,
   next_poll_at=case when p_payload->>'mode'<>'disabled' and (p_payload->>'fetchEnabled')::boolean then clock_timestamp() else null end where id=b.id;
  select coalesce(jsonb_agg(jsonb_build_object('permitId',id,'state',state,'startDeadline',start_deadline) order by id),'[]') into outstanding
   from event_provider_attempts where binding_id=b.id and state in ('authorized','issued','uncertain');
  response:=jsonb_build_object('version',version_now+1,'mode',p_payload->>'mode','fetchEnabled',(p_payload->>'fetchEnabled')::boolean,
   'providerOutstanding',outstanding,'providerDrained',jsonb_array_length(outstanding)=0);
 elsif p_action='health.read' then
  response:=jsonb_build_object('version',version_now,'bindingId',b.id,'mode',b.mode,'fetchEnabled',b.fetch_enabled,
   'globalStopped',g.global_stopped,'globalVersion',g.version,'healthStatus',b.health_status,'lastPollAt',b.last_attempt_at,
   'lastSuccessAt',b.last_success_at,'lastDataAt',b.last_data_at,'nextPollAt',b.next_poll_at,
   'pollAgeSeconds',case when b.last_attempt_at is not null then greatest(0,extract(epoch from clock_timestamp()-b.last_attempt_at)) end,
   'dataAgeSeconds',case when b.last_data_at is not null then greatest(0,extract(epoch from clock_timestamp()-b.last_data_at)) end);
 elsif p_action='mapping.review' then
  if p_payload->>'status' is null or p_payload->>'status' not in ('reviewed','rejected') then raise exception 'review status required' using errcode='22023'; end if;
  select * into row_result from operator_upsert_provider_entity_mapping(b.id,p_payload->>'entityKind',p_payload->>'externalId',
   (p_payload->>'canonicalId')::uuid,p_payload->>'status',null,actor::text,clock_timestamp(),
   jsonb_build_object('provenance','operator_review','reason',p_reason));
  if row_result.outcome='conflict' then raise exception 'mapping conflict' using errcode='40001'; end if;
  update provider_bindings set operator_version=operator_version+1 where id=b.id;
  response:=jsonb_build_object('version',version_now+1,'mappingId',row_result.ref_id,'outcome',row_result.outcome);
 elsif p_action='result.record' then
  if g.global_stopped then raise exception 'global stop active' using errcode='55000'; end if;
  insert into contest_results(event_edition_id,contest_id,version,result_status,outcome_type,winner_event_entry_id,
   winner_nomination_ids,source_type,supersedes_result_id,correction_reason,idempotency_key,result_data)
  values(p_event_id,target::uuid,version_now+1,case p_payload->>'status' when 'pending' then 'unresolved' else p_payload->>'status' end,
   replace(p_payload->>'outcome','-','_'),(p_payload->>'winnerEntryId')::uuid,
   case when p_payload->>'outcome'='winner-set' then array(select jsonb_array_elements_text(p_payload->'winningNominationIds')::uuid) end,
   'operator',previous.id,p_reason,'operator-result:'||target||':'||(version_now+1),jsonb_build_object('operatorPrincipal',actor))
  returning id into result_id;
  response:=jsonb_build_object('version',version_now+1,'resultId',result_id);
 elsif p_action='manifest.review' then
  insert into event_operator_manifests values(p_event_id,key_value,version_now+1,p_payload->'manifest',actor,p_reason,clock_timestamp());
  response:=jsonb_build_object('version',version_now+1,'manifestKey',key_value,'state','reviewed-source','materialized',false);
 elsif p_action='replay.project' then
  perform 1 from provider_observations where id=(p_payload->>'observationId')::uuid and binding_id=b.id and event_edition_id=p_event_id;
  if not found then raise exception 'operator unauthorized' using errcode='42501'; end if;
  if p_payload->>'kind'='result' then
   select to_jsonb(r) into response from project_provider_result((p_payload->>'observationId')::uuid,null) r;
  elsif p_payload->>'kind'='structural' then
   select to_jsonb(r) into response from project_structural_observation((p_payload->>'observationId')::uuid) r;
  else raise exception 'invalid replay kind' using errcode='22023'; end if;
  response:=jsonb_build_object('version',version_now,'projection',response);
 end if;
 insert into event_operator_audit(principal_id,environment,event_edition_id,action,reason,expected_version,resource_id,result)
 values(actor,p_environment,p_event_id,p_action,p_reason,p_expected_version,target,response);
 -- Nested writes, triggers, constraints and audit insertion may also wait.
 -- Failure propagates: all business writes and the audit roll back together.
 perform assert_event_operator(p_credential,p_environment,p_event_id,p_action);
 return response;
end $$;

-- CREATE OR REPLACE preserves existing owner/ACL; reassert private helper boundary.
revoke all on function public.assert_event_operator(text,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.event_operator_command(text,text,uuid,text,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.event_operator_command(text,text,uuid,text,bigint,text,jsonb) to service_role;
commit;
