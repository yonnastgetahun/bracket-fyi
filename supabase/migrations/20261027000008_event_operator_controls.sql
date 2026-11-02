-- P6/P9: local bootstrap is owner SQL only. No bearer values in audit or argv.
begin;
create table public.event_operator_principals (
 id uuid primary key default gen_random_uuid(), active boolean not null default true
);
create table public.event_operator_credentials (
 credential_hash text primary key check(credential_hash ~ '^[0-9a-f]{64}$'),
 principal_id uuid not null references event_operator_principals(id),
 active boolean not null default true, expires_at timestamptz not null
);
create table public.event_operator_grants (
 id uuid primary key default gen_random_uuid(), principal_id uuid not null references event_operator_principals(id),
 environment text not null, event_edition_id uuid references event_editions(id),
 action text not null check(action in ('global.stop','notification.control','binding.mode','health.read','mapping.review','result.record','manifest.review','replay.project')),
 active boolean not null default true, expires_at timestamptz not null default 'infinity',
 check((action in ('global.stop','notification.control'))=(event_edition_id is null))
);
-- Shared singleton is owned by 00007; never create a second global stop.
alter table public.event_runtime_control add column environment text not null default 'local';
alter table public.event_runtime_control add column version bigint not null default 0;
alter table public.provider_bindings add column operator_version bigint not null default 0;
alter table public.provider_bindings add column fetch_enabled boolean not null default true;
create table public.event_operator_audit (
 id uuid primary key default gen_random_uuid(), principal_id uuid not null references event_operator_principals(id),
 environment text not null, event_edition_id uuid references event_editions(id), action text not null,
 reason text not null check(length(btrim(reason)) between 1 and 500), expected_version bigint not null,
 resource_id text, result jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create trigger event_operator_audit_immutable before update or delete on event_operator_audit
for each row execute function reject_immutable_evidence_change();
create table public.event_operator_manifests (
 event_edition_id uuid not null references event_editions(id), manifest_key text not null,
 version bigint not null, manifest jsonb not null check(jsonb_typeof(manifest)='object'),
 principal_id uuid not null references event_operator_principals(id), reason text not null,
 created_at timestamptz not null default clock_timestamp(), primary key(event_edition_id,manifest_key,version)
);
create trigger event_operator_manifests_immutable before update or delete on event_operator_manifests
for each row execute function reject_immutable_evidence_change();
create table public.event_provider_attempts (
 id uuid primary key default gen_random_uuid(), run_id uuid not null references ingestion_runs(id),
 binding_id uuid not null references provider_bindings(id), attempt_key text not null unique,
 state text not null check(state in ('authorized','issued','completed','canceled','uncertain')),
 authorized_at timestamptz not null, start_deadline timestamptz not null,
 started_at timestamptz, finished_at timestamptz
);
-- Locking contract consumed by provider wrappers and notification 00007 integration:
-- global row -> binding row -> run / league basis -> attempt. Stop takes UPDATE;
-- work takes SHARE. Expired permits remain outstanding until explicitly canceled.
create function public.assert_event_operator(p_credential text,p_environment text,p_event_id uuid,p_action text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid;
begin
 if length(coalesce(p_credential,'')) < 24 then raise exception 'operator unauthorized' using errcode='42501'; end if;
 select c.principal_id into actor from event_operator_credentials c join event_operator_principals p on p.id=c.principal_id
 where c.credential_hash=encode(extensions.digest(p_credential,'sha256'),'hex') and c.active and p.active
 and c.expires_at>clock_timestamp() for share of c,p;
 if actor is null then raise exception 'operator unauthorized' using errcode='42501'; end if;
 perform 1 from event_operator_grants g where g.principal_id=actor and g.active and g.expires_at>clock_timestamp() and g.environment=p_environment
 and g.event_edition_id is not distinct from p_event_id and g.action=p_action for share;
 if not found then raise exception 'operator unauthorized' using errcode='42501'; end if;
 if not exists(select 1 from event_runtime_control where singleton and environment=p_environment) then
 raise exception 'operator unauthorized' using errcode='42501'; end if;
 return actor;
end $$;

create function public.event_operator_command(p_credential text,p_environment text,p_event_id uuid,p_action text,
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
 return response;
end $$;

create function public.admit_event_provider_attempt(p_run_id uuid,p_lease_token text,p_attempt_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare g event_runtime_control%rowtype; b provider_bindings%rowtype; r ingestion_runs%rowtype;
 permit event_provider_attempts%rowtype; now_at timestamptz;
begin
 select * into g from event_runtime_control where singleton for share;
 select pb.* into b from provider_bindings pb join ingestion_runs ir on ir.binding_id=pb.id where ir.id=p_run_id for update of pb;
 select * into r from ingestion_runs where id=p_run_id for update;
 now_at:=clock_timestamp();
 if r.id is null or btrim(coalesce(p_lease_token,''))='' or r.lease_expires_at is null or r.lease_token is distinct from p_lease_token or r.status<>'running' or r.lease_expires_at<=now_at then
  raise exception 'lease_lost' using errcode='P0001'; end if;
 if g.singleton is null or g.global_stopped or b.mode='disabled' or not b.fetch_enabled then return '{"allowed":false}'::jsonb; end if;
 -- Existing provider-wide budget deliberately shares across all credentials/events
 -- (more conservative than per-account). Every page/retry needs its own reservation.
 if not exists(select 1 from provider_rate_budget_reservations where provider_id=b.provider_id and attempt_key=p_attempt_key and cost=1)
 or p_attempt_key <> 'v1:request:'||r.id::text||':'||r.retry_index::text||':'||
 slice_2c_page_key(b.id,b.checkpoint_generation,b.provider_cursor,b.provider_etag) then
  raise exception 'attempt reservation required' using errcode='42501'; end if;
 if exists(select 1 from event_provider_attempts where attempt_key=p_attempt_key) then return '{"allowed":false}'::jsonb; end if;
 insert into event_provider_attempts(run_id,binding_id,attempt_key,state,authorized_at,start_deadline)
 values(r.id,b.id,p_attempt_key,'authorized',now_at,now_at+interval '5 seconds') returning * into permit;
 return jsonb_build_object('allowed',true,'permitId',permit.id,'startDeadline',permit.start_deadline);
end $$;

create function public.start_event_provider_attempt(p_permit_id uuid,p_run_id uuid,p_lease_token text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare g event_runtime_control%rowtype; b provider_bindings%rowtype; r ingestion_runs%rowtype; a event_provider_attempts%rowtype; t timestamptz;
begin
 select * into g from event_runtime_control where singleton for share;
 select pb.* into b from provider_bindings pb join ingestion_runs ir on ir.binding_id=pb.id where ir.id=p_run_id for update of pb;
 select * into r from ingestion_runs where id=p_run_id for update;
 select * into a from event_provider_attempts where id=p_permit_id and run_id=p_run_id for update;
 t:=clock_timestamp();
 if r.id is null or btrim(coalesce(p_lease_token,''))='' or r.lease_expires_at is null or r.lease_token is distinct from p_lease_token or r.lease_expires_at<=t or r.status<>'running' then raise exception 'lease_lost' using errcode='P0001'; end if;
 if a.id is null or a.state<>'authorized' then return false; end if;
 if g.singleton is null or g.global_stopped or b.mode='disabled' or not b.fetch_enabled or a.start_deadline<=t then
  update event_provider_attempts set state='canceled',finished_at=t where id=a.id; return false;
 end if;
 update event_provider_attempts set state='issued',started_at=t where id=a.id;
 return true;
end $$;

create function public.complete_event_provider_attempt(p_permit_id uuid,p_run_id uuid,p_lease_token text,p_uncertain boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 -- Completion cannot authorize anything; no control locks needed. Expired run may
 -- confirm completion, but a rotated lease cannot mutate someone else's attempt.
 if p_uncertain is null or btrim(coalesce(p_lease_token,''))='' then raise exception 'invalid completion' using errcode='22023'; end if;
 perform 1 from ingestion_runs where id=p_run_id and lease_token=p_lease_token for share;
 if not found then raise exception 'lease_lost' using errcode='P0001'; end if;
 update event_provider_attempts set state=case when p_uncertain then 'uncertain' else 'completed' end,finished_at=clock_timestamp()
 where id=p_permit_id and run_id=p_run_id and state='issued';
end $$;

-- Shared reviews must not be forgeable through the older infrastructure RPC.
alter function upsert_provider_entity_mapping(uuid,text,text,uuid,text,numeric,text,timestamptz,jsonb)
 rename to operator_upsert_provider_entity_mapping;
create function upsert_provider_entity_mapping(p_binding_id uuid,p_entity_kind text,p_external_id text,p_canonical_id uuid,
 p_resolution_status text,p_confidence numeric,p_reviewed_by text,p_reviewed_at timestamptz,p_metadata jsonb)
returns table(outcome text,ref_id uuid,binding_id uuid,provider_id uuid,event_edition_id uuid,entity_kind text,external_id text,
 canonical_id uuid,resolution_status text,confidence numeric,reviewed_by text,reviewed_at timestamptz,metadata jsonb)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_resolution_status not in ('automatic','unresolved') or p_reviewed_by is not null or p_reviewed_at is not null then
  raise exception 'operator review requires scoped credential' using errcode='42501'; end if;
 return query select * from operator_upsert_provider_entity_mapping(p_binding_id,p_entity_kind,p_external_id,p_canonical_id,
  p_resolution_status,p_confidence,null,null,p_metadata);
end $$;
revoke all on function operator_upsert_provider_entity_mapping(uuid,text,text,uuid,text,numeric,text,timestamptz,jsonb)
 from public,anon,authenticated,service_role;
revoke all on function upsert_provider_entity_mapping(uuid,text,text,uuid,text,numeric,text,timestamptz,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function upsert_provider_entity_mapping(uuid,text,text,uuid,text,numeric,text,timestamptz,jsonb) to service_role;
-- Provider/projector RPCs run as owner; service infrastructure cannot forge
-- an operator-originated shared result by bypassing the scoped command.
revoke insert on public.contest_results from service_role;
revoke insert,update,delete,truncate on public.provider_entity_refs from service_role;

-- Wrap ALL service-callable projection entries; helper functions remain private.
alter function public.project_provider_result(uuid,text) rename to project_provider_result_before_operator_controls;
alter function public.project_structural_observation(uuid) rename to project_structural_observation_before_operator_controls;
create function public.project_provider_result(p_observation_id uuid,p_result_idempotency_key text default null)
returns table(outcome text,contest_result_id uuid,result_version integer,audit_event_id uuid,outbox_id uuid,quarantine_id uuid,prior_outcome text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare stopped_now boolean;
begin
 select global_stopped into stopped_now from event_runtime_control where singleton for share;
 if stopped_now is distinct from false then
 return query select 'skipped_non_write'::text,null::uuid,null::integer,null::uuid,null::uuid,null::uuid,null::text; return; end if;
 return query select * from project_provider_result_before_operator_controls(p_observation_id,p_result_idempotency_key);
end $$;
-- Structural return type copied exactly from the existing reviewed-only wrapper.
create function public.project_structural_observation(p_observation_id uuid)
returns table(outcome text,canonical_id uuid,quarantine_id uuid)
language plpgsql security definer set search_path=public,pg_temp as $$
declare stopped_now boolean;
begin
 select global_stopped into stopped_now from event_runtime_control where singleton for share;
 if stopped_now is distinct from false then
 return query select 'skipped_non_write'::text,null::uuid,null::uuid; return; end if;
 return query select * from project_structural_observation_before_operator_controls(p_observation_id);
end $$;

do $$
declare t text; f regprocedure;
begin
 foreach t in array array['event_operator_principals','event_operator_credentials','event_operator_grants','event_runtime_control',
 'event_operator_audit','event_operator_manifests','event_provider_attempts'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
 -- No registry reads or writes by service role. Functions return bounded DTOs.
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('assert_event_operator','event_operator_command','admit_event_provider_attempt',
 'start_event_provider_attempt','complete_event_provider_attempt','project_provider_result','project_structural_observation',
 'project_provider_result_before_operator_controls','project_structural_observation_before_operator_controls') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
 end loop;
end $$;
grant execute on function public.event_operator_command(text,text,uuid,text,bigint,text,jsonb),
 public.admit_event_provider_attempt(uuid,text,text),public.start_event_provider_attempt(uuid,uuid,text),
 public.complete_event_provider_attempt(uuid,uuid,text,boolean),
 public.project_provider_result(uuid,text),public.project_structural_observation(uuid) to service_role;
revoke all on function public.set_event_notification_control(boolean,boolean) from public,anon,authenticated,service_role;
-- Existing service-role infra can manage a run, but not forge an operator principal.
commit;
