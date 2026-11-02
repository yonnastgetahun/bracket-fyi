-- P8: fake-only durable delivery. Existing legacy rows remain readable.
begin;
create table public.event_runtime_control (
 singleton boolean primary key default true check(singleton),
 global_stopped boolean not null default true,
 notifications_enabled boolean not null default false,
 real_sends_enabled boolean not null default false check(not real_sends_enabled),
 changed_at timestamptz not null default clock_timestamp()
);
insert into event_runtime_control default values;
create table public.event_notification_policies (
 kind text primary key, audience text not null check(audience in ('participant','organizer')),
 ttl_seconds integer not null check(ttl_seconds>0), target text not null check(target in ('picks','leaderboard','admin'))
);
insert into event_notification_policies values
 ('lock_reminder','participant',3600,'picks'),('contest_live','participant',3600,'leaderboard'),
 ('result_final','participant',86400,'leaderboard'),('score_change','participant',21600,'leaderboard'),
 ('schedule_change','participant',86400,'picks'),('result_correction','participant',86400,'leaderboard'),
 ('provider_stale','organizer',3600,'admin'),('league_complete','participant',604800,'leaderboard'),
 ('broadcast','participant',86400,'leaderboard');
create table public.event_notification_subscriptions (
 id uuid primary key default gen_random_uuid(), league_id uuid not null references leagues(id),
 participant_id uuid references participants(id), audience text not null check(audience in ('participant','organizer')),
 endpoint_fingerprint text not null check(endpoint_fingerprint ~ '^[a-f0-9]{64}$'),
 kinds text[] not null, enabled boolean not null default true, revision bigint not null default 1,
 created_at timestamptz not null default clock_timestamp(),
 check((audience='participant' and participant_id is not null) or (audience='organizer' and participant_id is null)),
 unique(league_id,endpoint_fingerprint)
);
-- Legacy audit FK remains; typed lifecycle notices carry the alternative immutable audit.
alter table notification_outbox alter column audit_event_id drop not null, alter column event_edition_id drop not null;
alter table notification_outbox
 add column lifecycle_audit_id uuid references event_lifecycle_audit(id),
 add column subscription_id uuid references event_notification_subscriptions(id),
 add column notification_basis text,
 add column binding_id uuid references provider_bindings(id),
 add constraint notification_audit_source check(audit_event_id is not null or lifecycle_audit_id is not null),
 add constraint notification_legacy_edition check(event_edition_id is not null or lifecycle_audit_id is not null);
alter table notification_outbox drop constraint notification_outbox_intent_type_valid;
alter table notification_outbox add constraint notification_outbox_intent_type_valid check(intent_type in (
 'result_final','result_correction','league_complete','league_reopened','provider_stale','provider_recovered','broadcast',
 'lock_reminder','contest_live','score_change','schedule_change'));
create or replace function public.validate_notification_audience() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if new.league_id is not null and not exists(select 1 from leagues l join templates t on t.id=l.template_id
 where l.id=new.league_id and t.event_edition_id is not distinct from new.event_edition_id) then
 raise exception 'notification league must belong to the intent event edition' using errcode='23514'; end if;
 if new.participant_id is not null and not exists(select 1 from participants where id=new.participant_id and league_id=new.league_id) then
 raise exception 'notification participant must belong to the target league' using errcode='23514'; end if;
 return new;
end $$;
alter table notification_attempts
 add column worker_incarnation uuid,
 add column start_deadline timestamptz,
 add column issued_at timestamptz,
 add column disposition text check(disposition in ('authorized','issued','uncertain','finished','canceled')),
 add column basis_token text;
create table public.event_notification_snapshots (
 league_id uuid primary key references leagues(id), effective jsonb not null, leaderboard jsonb not null
);

create function public.set_event_notification_consent(p_league uuid,p_actor uuid,p_participant uuid,p_endpoint text,p_kinds text[],p_enabled boolean)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare audience_name text; sid uuid;
begin
 perform 1 from leagues where id=p_league for update;
 if p_participant is null then
  if not exists(select 1 from leagues where id=p_league and organizer_token=p_actor) then raise exception 'invalid credential' using errcode='42501'; end if;
  audience_name:='organizer';
 else
  if not exists(select 1 from participants where id=p_participant and league_id=p_league and magic_token=p_actor) then raise exception 'invalid credential' using errcode='42501'; end if;
  audience_name:='participant';
 end if;
 if p_endpoint is null or p_endpoint !~ '^fake://[a-zA-Z0-9._/-]{1,160}$' or p_enabled is null or p_kinds is null
 or exists(select 1 from unnest(p_kinds) k where not exists(select 1 from event_notification_policies where kind=k and audience=audience_name)) then
 raise exception 'invalid fake subscription' using errcode='22023'; end if;
 select id into sid from event_notification_subscriptions where league_id=p_league and endpoint_fingerprint=event_lifecycle_hash(to_jsonb(p_endpoint));
 if sid is not null and not exists(select 1 from event_notification_subscriptions where id=sid and participant_id is not distinct from p_participant and audience=audience_name) then
 raise exception 'subscription belongs to another recipient' using errcode='42501'; end if;
 insert into event_notification_subscriptions(league_id,participant_id,audience,endpoint_fingerprint,kinds,enabled)
 values(p_league,p_participant,audience_name,event_lifecycle_hash(to_jsonb(p_endpoint)),p_kinds,p_enabled)
 on conflict(league_id,endpoint_fingerprint) do update set kinds=excluded.kinds,enabled=excluded.enabled,revision=event_notification_subscriptions.revision+1
 returning id into sid;
 return sid;
end $$;

-- Internal enqueue only. No control locks here: lifecycle already owns league;
-- controls are checked only at admission, preserving global->binding->league order.
create function public.enqueue_event_notification(p_audit uuid,p_kind text,p_logical_key text,p_expiry timestamptz default null,p_body text default null)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare a event_lifecycle_audit%rowtype; policy event_notification_policies%rowtype; edition uuid; binding uuid; n integer;
begin
 select * into strict a from event_lifecycle_audit where id=p_audit;
 select * into strict policy from event_notification_policies where kind=p_kind;
 if a.basis_token is null or p_logical_key is null or length(p_logical_key) not between 1 and 200 then
 raise exception 'evaluated notification basis required' using errcode='22023'; end if;
 select t.event_edition_id into edition from leagues l join templates t on t.id=l.template_id where l.id=a.league_id;
 select id into binding from provider_bindings where event_edition_id=edition and role='primary';
 insert into notification_outbox(event_edition_id,league_id,participant_id,lifecycle_audit_id,intent_type,audience_kind,payload,
 destination_path,idempotency_key,expires_at,subscription_id,notification_basis,binding_id,created_at,available_at)
 select edition,a.league_id,s.participant_id,a.id,p_kind,case when s.participant_id is null then 'league' else 'participant' end,
 jsonb_build_object('kind',p_kind,'leagueId',a.league_id)||case when p_body is null then '{}'::jsonb else jsonb_build_object('body',p_body) end,
 '/l/'||a.league_id||case when policy.target='admin' then '/admin' else '' end,
 'event:'||a.league_id||':'||p_kind||':'||p_logical_key||':'||s.id,
 least(coalesce(p_expiry,'infinity'::timestamptz),clock_timestamp()+make_interval(secs=>policy.ttl_seconds)),s.id,a.basis_token,binding,clock_timestamp(),clock_timestamp()
 from event_notification_subscriptions s where s.league_id=a.league_id and s.enabled and s.audience=policy.audience and p_kind=any(s.kinds)
 and (p_expiry is null or p_expiry>clock_timestamp())
 on conflict(idempotency_key) do nothing;
 get diagnostics n=row_count;
 return n;
end $$;

create function public.event_notification_audit_hook() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare effective jsonb; board jsonb; old event_notification_snapshots%rowtype; m record; prior jsonb;
begin
 if new.kind='coronation' then
  perform enqueue_event_notification(new.id,'league_complete','coronation'); return new;
 end if;
 if new.kind<>'evaluated' then return new; end if;
 effective:=event_lifecycle_effective(new.league_id,clock_timestamp());
 select leaderboard into board from event_league_evaluations where league_id=new.league_id;
 select * into old from event_notification_snapshots where league_id=new.league_id;
 for m in select * from jsonb_each(effective) loop
  prior:=old.effective->m.key;
  if m.value->'outcome'->>'kind' not in ('unresolved','no-contest')
   and (prior is null or prior->'outcome'->>'kind' in ('unresolved','no-contest')) then
   perform enqueue_event_notification(new.id,'result_final',new.basis_token||':'||m.key);
  elsif prior is not null and prior->>'provenanceToken' is distinct from m.value->>'provenanceToken' then
   perform enqueue_event_notification(new.id,'result_correction',new.basis_token||':'||m.key);
  end if;
 end loop;
 if old.league_id is not null and board is distinct from old.leaderboard then
  perform enqueue_event_notification(new.id,'score_change',new.basis_token);
 end if;
 insert into event_notification_snapshots values(new.league_id,effective,board)
 on conflict(league_id) do update set effective=excluded.effective,leaderboard=excluded.leaderboard;
 return new;
end $$;
create trigger event_notification_lifecycle after insert on event_lifecycle_audit
 for each row execute function event_notification_audit_hook();

-- Scheduled/provider/broadcast producer seam. Trusted service supplies a stable
-- logical event key and current evaluated basis; broadcasts additionally authenticate.
create unique index event_notification_producer_identity on event_lifecycle_audit
 (league_id,(details->>'trigger'),(details->>'key')) where kind='notification';

create function public.emit_event_notification(p_league uuid,p_kind text,p_key text,p_basis text,p_expiry timestamptz,p_organizer uuid default null,p_message text default null)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare audit_id uuid; snap jsonb;
begin
 perform 1 from leagues where id=p_league for update;
 if p_kind not in ('lock_reminder','contest_live','schedule_change','provider_stale','broadcast') or p_kind is null then
 raise exception 'unsupported producer trigger' using errcode='22023'; end if;
 if p_kind='broadcast' and not exists(select 1 from leagues where id=p_league and organizer_token=p_organizer) then
 raise exception 'invalid credential' using errcode='42501'; end if;
 perform 1 from event_league_evaluations where league_id=p_league for update;
 snap:=event_lifecycle_basis(p_league);
 if snap->>'basisToken' is distinct from p_basis or not exists(select 1 from event_league_evaluations
 where league_id=p_league and basis_token=p_basis and generation=evaluated_generation and not lifecycle_disabled) then
 raise exception 'notification basis changed' using errcode='40001'; end if;
 if p_message is not null and (p_kind<>'broadcast' or length(p_message)>500 or length(btrim(p_message))=0) then
 raise exception 'invalid broadcast message' using errcode='22023'; end if;
 if p_key is null or length(p_key) not between 1 and 200 then raise exception 'invalid logical event key' using errcode='22023'; end if;
 select id into audit_id from event_lifecycle_audit where league_id=p_league and kind='notification'
 and details->>'trigger'=p_kind and details->>'key'=p_key;
 if audit_id is not null then
  if exists(select 1 from event_lifecycle_audit where id=audit_id and details->>'message' is distinct from p_message) then
   raise exception 'notification idempotency conflict' using errcode='40001'; end if;
  return 0;
 end if;
 if p_kind='broadcast' and p_message is not null then update leagues set announcement_text=p_message where id=p_league; end if;
 insert into event_lifecycle_audit(league_id,generation,kind,basis_token,details)
 values(p_league,(snap->>'generation')::bigint,'notification',p_basis,
 jsonb_build_object('trigger',p_kind,'key',p_key,'message',p_message,
 'actor',case when p_kind='broadcast' then event_lifecycle_hash(to_jsonb(p_organizer)) else null end))
 returning id into audit_id;
 return enqueue_event_notification(audit_id,p_kind,p_key,p_expiry,p_message);
end $$;

-- All worker mutations acquire global then binding then league then attempt.
create function public.lock_event_notification(p_outbox uuid) returns notification_outbox
language plpgsql security definer set search_path=public,pg_temp as $$
declare o notification_outbox%rowtype;
begin
 perform 1 from event_runtime_control where singleton for update;
 select * into strict o from notification_outbox where id=p_outbox and subscription_id is not null;
 if o.binding_id is not null then perform 1 from provider_bindings where id=o.binding_id for update; end if;
 perform 1 from leagues where id=o.league_id for update;
 perform 1 from event_league_evaluations where league_id=o.league_id for update;
 select * into o from notification_outbox where id=p_outbox for update;
 return o;
end $$;

create function public.admit_event_notification(p_outbox uuid,p_worker uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare o notification_outbox%rowtype; s event_notification_subscriptions%rowtype; a notification_attempts%rowtype;
 snap jsonb; reason text; t timestamptz; aid uuid;
begin
 o:=lock_event_notification(p_outbox); t:=clock_timestamp();
 if p_worker is null then raise exception 'worker incarnation required' using errcode='22023'; end if;
 if not exists(select 1 from event_runtime_control where not global_stopped and notifications_enabled) then return jsonb_build_object('admitted',false,'reason','stopped'); end if;
 if o.binding_id is not null and not exists(select 1 from provider_bindings where id=o.binding_id and mode='write') then
 return jsonb_build_object('admitted',false,'reason','binding-disabled'); end if;
 select * into a from notification_attempts where outbox_id=o.id order by attempt_number desc limit 1 for update;
 if a.disposition in ('authorized','issued') then
  if t < a.start_deadline+interval '10 seconds' then return jsonb_build_object('admitted',false,'reason','outstanding'); end if;
  update notification_attempts set disposition='uncertain',status='transient_failure',finished_at=t,retry_at=t where id=a.id;
  update notification_outbox set status='pending',claimed_at=null,claimed_by=null,processed_at=null where id=o.id;
  o.status:='pending';
 end if;
 if o.status<>'pending' or o.available_at>t then return jsonb_build_object('admitted',false,'reason','not-due'); end if;
 select * into s from event_notification_subscriptions where id=o.subscription_id;
 snap:=event_lifecycle_basis(o.league_id);
 if not s.enabled or not(o.intent_type=any(s.kinds)) then reason:='consent';
 elsif o.expires_at<=t then reason:='expired';
 elsif snap->>'basisToken' is distinct from o.notification_basis or not exists(select 1 from event_league_evaluations
 where league_id=o.league_id and generation=evaluated_generation and basis_token=o.notification_basis and not lifecycle_disabled) then reason:='superseded';
 elsif o.attempt_count>=3 then reason:='dead-letter'; end if;
 if reason is not null then
  update notification_outbox set status=case when reason='dead-letter' then 'failed' else 'canceled' end,processed_at=t,last_error_class=reason where id=o.id;
  return jsonb_build_object('admitted',false,'reason',reason);
 end if;
 if exists(select 1 from notification_attempts prior join notification_outbox other on other.id=prior.outbox_id
 where other.league_id=o.league_id and other.id<>o.id and prior.disposition in ('authorized','issued')
 and prior.start_deadline+interval '10 seconds'>t) then
 return jsonb_build_object('admitted',false,'reason','prior-outstanding'); end if;
 -- Earlier authorized/issued/uncertain attempts on this league remain recorded;
 -- uncertainty does not pretend to recall transport. Every retry gets a new permit.
 insert into notification_attempts(outbox_id,participant_id,endpoint_fingerprint,attempt_number,idempotency_key,
 worker_incarnation,start_deadline,disposition,basis_token)
 values(o.id,o.participant_id,s.endpoint_fingerprint,o.attempt_count+1,o.idempotency_key||':attempt:'||(o.attempt_count+1),
 p_worker,t+interval '5 seconds','authorized',o.notification_basis) returning id into aid;
 update notification_outbox set status='processing',claimed_at=t,claimed_by=p_worker::text,attempt_count=attempt_count+1 where id=o.id;
 return jsonb_build_object('admitted',true,'attemptId',aid,'outboxId',o.id,'worker',p_worker,'dedupId',o.idempotency_key,'startDeadline',t+interval '5 seconds','basis',o.notification_basis);
end $$;

create function public.start_event_notification(p_attempt uuid,p_worker uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare o notification_outbox%rowtype; a notification_attempts%rowtype; oid uuid; t timestamptz;
begin
 select outbox_id into strict oid from notification_attempts where id=p_attempt;
 o:=lock_event_notification(oid);
 select * into a from notification_attempts where id=p_attempt for update;
 t:=clock_timestamp();
 if a.worker_incarnation is distinct from p_worker or a.disposition<>'authorized' then return jsonb_build_object('started',false); end if;
 if t>a.start_deadline or not exists(select 1 from event_runtime_control where not global_stopped and notifications_enabled)
 or (o.binding_id is not null and not exists(select 1 from provider_bindings where id=o.binding_id and mode='write'))
 or not exists(select 1 from event_notification_subscriptions where id=o.subscription_id and enabled and o.intent_type=any(kinds))
 or o.expires_at<=t then
  update notification_attempts set disposition='canceled',status='skipped',finished_at=t where id=a.id;
  update notification_outbox set status='pending',claimed_at=null,claimed_by=null,processed_at=null where id=o.id;
  return jsonb_build_object('started',false);
 end if;
 update notification_attempts set disposition='issued',issued_at=t where id=a.id;
 return jsonb_build_object('started',true,'dedupId',o.idempotency_key,'payload',o.payload,'route',o.destination_path,'timeoutMs',10000,'startBudgetMs',extract(epoch from (a.start_deadline-t))*1000);
end $$;

create function public.finish_event_notification(p_attempt uuid,p_worker uuid,p_http integer,p_uncertain boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare oid uuid; o notification_outbox%rowtype; a notification_attempts%rowtype; t timestamptz; outcome text; retry timestamptz;
begin
 select outbox_id into strict oid from notification_attempts where id=p_attempt;
 o:=lock_event_notification(oid);
 select * into a from notification_attempts where id=p_attempt for update; t:=clock_timestamp();
 if a.worker_incarnation is distinct from p_worker or a.disposition<>'issued' then return jsonb_build_object('accepted',false); end if;
 if p_uncertain is null or (not p_uncertain and (p_http is null or p_http not between 100 and 599)) then raise exception 'invalid transport outcome' using errcode='22023'; end if;
 outcome:=case when p_uncertain then 'transient_failure' when p_http between 200 and 299 then 'sent'
 when p_http in (404,410) then 'pruned' when p_http in (408,429) or p_http>=500 then 'transient_failure' else 'permanent_failure' end;
 if outcome='transient_failure' then retry:=t+make_interval(secs=>least(300,5*(2^a.attempt_number)::integer)); end if;
 update notification_attempts set status=outcome,disposition=case when p_uncertain then 'uncertain' else 'finished' end,
 http_status=p_http,finished_at=t,retry_at=retry where id=a.id;
 if outcome='pruned' then update event_notification_subscriptions set enabled=false,revision=revision+1 where id=o.subscription_id; end if;
 if outcome='transient_failure' and o.attempt_count<3 then
  update notification_outbox set status='pending',claimed_at=null,claimed_by=null,processed_at=null,available_at=retry,last_error_class=case when p_uncertain then 'uncertain' else 'transient' end where id=o.id;
 else
  update notification_outbox set status=case when outcome='sent' then 'sent' else 'failed' end,processed_at=t,last_error_class=case when outcome='sent' then null else outcome end where id=o.id;
 end if;
 return jsonb_build_object('accepted',true,'outcome',outcome);
end $$;

create function public.set_event_notification_control(p_stop boolean,p_enabled boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare outstanding jsonb;
begin
 update event_runtime_control set global_stopped=p_stop,notifications_enabled=p_enabled,changed_at=clock_timestamp() where singleton;
 select coalesce(jsonb_agg(jsonb_build_object('attemptId',id,'state',disposition,'startDeadline',start_deadline) order by id),'[]') into outstanding
 from notification_attempts where disposition in ('authorized','issued','uncertain');
 return jsonb_build_object('stopped',p_stop,'outstanding',outstanding,'drained',jsonb_array_length(outstanding)=0);
end $$;

create function public.scan_event_notifications(p_limit integer default 100) returns setof uuid
language sql security definer set search_path=public,pg_temp as $$
 select id from notification_outbox where subscription_id is not null and
 (status='pending' and available_at<=clock_timestamp() or status='processing' and claimed_at<clock_timestamp()-interval '15 seconds')
 order by available_at,id limit greatest(1,least(500,p_limit))
$$;

alter table event_runtime_control enable row level security;
alter table event_notification_policies enable row level security;
alter table event_notification_subscriptions enable row level security;
alter table event_notification_snapshots enable row level security;
revoke all on event_runtime_control,event_notification_policies,event_notification_subscriptions,event_notification_snapshots from public,anon,authenticated,service_role;
grant select on event_runtime_control,event_notification_policies,event_notification_subscriptions,event_notification_snapshots to service_role;
-- Preserve legacy writer grants, but reject direct service writes to P8 rows.
-- Internal SECURITY DEFINER RPCs run as the owning role, not service_role.
create function public.guard_event_notification_write() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare protected boolean;
begin
 if current_user='service_role' then
  if tg_table_name='notification_outbox' then
   protected:=new.subscription_id is not null or old.subscription_id is not null
    or new.lifecycle_audit_id is not null or old.lifecycle_audit_id is not null;
  else
   protected:=new.worker_incarnation is not null or old.worker_incarnation is not null
    or exists(select 1 from notification_outbox where id in (new.outbox_id,old.outbox_id) and subscription_id is not null);
  end if;
  if protected then raise exception 'durable notification RPC required' using errcode='42501'; end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger event_notification_outbox_write before insert or update or delete on notification_outbox
 for each row execute function guard_event_notification_write();
create trigger event_notification_attempt_write before insert or update or delete on notification_attempts
 for each row execute function guard_event_notification_write();
revoke all on function guard_event_notification_write() from public,anon,authenticated,service_role;
do $$ declare f record; begin
 for f in select oid::regprocedure as signature,proname as name from pg_proc where pronamespace='public'::regnamespace and proname in (
 'set_event_notification_consent','enqueue_event_notification','event_notification_audit_hook','emit_event_notification','lock_event_notification',
 'admit_event_notification','start_event_notification','finish_event_notification','set_event_notification_control','scan_event_notifications') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 if f.name not in ('enqueue_event_notification','event_notification_audit_hook','lock_event_notification') then
 execute format('grant execute on function %s to service_role',f.signature); end if;
 end loop;
end $$;
commit;
