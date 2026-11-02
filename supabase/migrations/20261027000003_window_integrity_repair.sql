-- F2/F3/F4 additive repair. Existing sealed rows become immutable snapshots.
-- No historical migration edits or data deletion. Activation remains off.
alter table public.event_template_configs drop constraint event_template_configs_pkey;
alter table public.event_template_configs add primary key(template_id,version);
alter table public.event_league_evaluations add column membership_sealed boolean not null default false;

create function public.validate_event_window_manifest(p_manifest jsonb) returns void
language plpgsql set search_path=public,pg_temp as $$
declare m jsonb; c jsonb;
begin
 if jsonb_typeof(p_manifest->'markets') is distinct from 'array' then
  raise exception 'invalid window manifest' using errcode='23514';
 end if;
 if jsonb_array_length(p_manifest->'markets')=0 then raise exception 'invalid window manifest' using errcode='23514'; end if;
 for m in select value from jsonb_array_elements(p_manifest->'markets') loop
  if jsonb_typeof(m->'id') is distinct from 'string' or btrim(m->>'id')=''
   or jsonb_typeof(m->'windowId') is distinct from 'string' or btrim(m->>'windowId')=''
   or jsonb_typeof(m->'choices') is distinct from 'array' then
   raise exception 'invalid window manifest' using errcode='23514';
  end if;
  if jsonb_array_length(m->'choices')=0 then raise exception 'invalid window manifest' using errcode='23514'; end if;
  for c in select value from jsonb_array_elements(m->'choices') loop
   if jsonb_typeof(c) is distinct from 'string' or btrim(c #>> '{}')='' then raise exception 'invalid window manifest' using errcode='23514'; end if;
  end loop;
  if (select count(*)<>count(distinct value) from jsonb_array_elements(m->'choices')) then raise exception 'invalid window manifest' using errcode='23514'; end if;
 end loop;
 if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p_manifest->'markets')) then raise exception 'invalid window manifest' using errcode='23514'; end if;
end $$;
create function public.protect_event_configuration() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op<>'INSERT' then
  if old.sealed then raise exception 'sealed configuration is immutable' using errcode='23514'; end if;
  if tg_op='DELETE' then return old; end if;
  if (new.template_id,new.version) is distinct from (old.template_id,old.version) then raise exception 'configuration identity is immutable' using errcode='23514'; end if;
 end if;
 if new.sealed then perform validate_event_window_manifest(new.manifest); end if;
 return new;
end $$;
create trigger event_configuration_guard before insert or update or delete on public.event_template_configs
for each row execute function public.protect_event_configuration();

-- Fail closed if an existing published snapshot is malformed, without rewriting it.
do $$ declare c record; begin
 for c in select manifest from public.event_template_configs where sealed loop
  perform public.validate_event_window_manifest(c.manifest);
 end loop;
end $$;

create function public.event_membership_closed(p_league_id uuid) returns boolean
language sql volatile set search_path=public,pg_temp as $$
 select exists(select 1 from leagues where id=p_league_id and locked_at is not null)
 or exists(select 1 from event_league_evaluations where league_id=p_league_id and membership_sealed)
 or exists(select 1 from event_league_windows where league_id=p_league_id and (state='locked' or cutoff<=clock_timestamp()))
 or exists(select 1 from picks where league_id=p_league_id)
$$;
create function public.assert_event_membership(p_league_id uuid) returns void
language plpgsql set search_path=public,pg_temp as $$
declare cfg jsonb;
begin
 select c.manifest into cfg from leagues l join event_league_evaluations e on e.league_id=l.id
 join event_template_configs c on c.template_id=l.template_id and c.version=e.configuration_version and c.sealed where l.id=p_league_id;
 if cfg is null then raise exception 'configuration unavailable' using errcode='40001'; end if;
 if exists(
  (select value->>'id',value->>'windowId' from jsonb_array_elements(cfg->'markets')
   except select unnest(market_ids),window_key from event_league_windows where league_id=p_league_id)
  union all
  (select unnest(market_ids),window_key from event_league_windows where league_id=p_league_id
   except select value->>'id',value->>'windowId' from jsonb_array_elements(cfg->'markets'))
 ) then raise exception 'complete logical membership required' using errcode='23514'; end if;
end $$;

create or replace function public.protect_event_window() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare lid uuid; cfg jsonb; expected text[];
begin
 lid:=case when tg_op='DELETE' then old.league_id else new.league_id end;
 -- Service writes enter via configure_event_window, which locks league first.
 -- Trigger also protects owner maintenance; deadlock victims roll back atomically.
 perform 1 from leagues where id=lid for update;
 perform 1 from event_league_evaluations where league_id=lid for update;
 if tg_op='UPDATE' and (new.league_id,new.window_key) is distinct from (old.league_id,old.window_key) then
  raise exception 'window identity is immutable' using errcode='23514';
 end if;
 if (tg_op in ('INSERT','DELETE') or (tg_op='UPDATE' and new.market_ids is distinct from old.market_ids)) and event_membership_closed(lid) then
  raise exception 'sealed market membership cannot change' using errcode='23514';
 end if;
 if tg_op='DELETE' then return old; end if;
 if tg_op='UPDATE' then
  if old.state='locked' and new.state<>'locked' then raise exception 'locked window cannot reopen' using errcode='23514'; end if;
  if old.cutoff is not null and (new.cutoff is null or new.cutoff>old.cutoff) then raise exception 'cutoff cannot move later' using errcode='23514'; end if;
  if (new.state,new.cutoff,new.pairings_reviewed,new.market_ids) is distinct from (old.state,old.cutoff,old.pairings_reviewed,old.market_ids) then
   new.version:=old.version+1;
  elsif new.version is distinct from old.version and new.version<>old.version+1 then
   raise exception 'invalid window version' using errcode='23514';
  end if;
 end if;
 if cardinality(new.market_ids)<>(select count(distinct x) from unnest(new.market_ids) x) then raise exception 'duplicate window market' using errcode='23514'; end if;
 select c.manifest into cfg from leagues l join event_league_evaluations e on e.league_id=l.id
 join event_template_configs c on c.template_id=l.template_id and c.version=e.configuration_version and c.sealed where l.id=lid;
 if cfg is null then raise exception 'configuration unavailable' using errcode='40001'; end if;
 select array_agg(value->>'id' order by value->>'id') into expected from jsonb_array_elements(cfg->'markets') where value->>'windowId'=new.window_key;
 if expected is distinct from (select array_agg(x order by x) from unnest(new.market_ids) x) then
  raise exception 'window membership differs from configuration' using errcode='23514';
 end if;
 return new;
end $$;
drop trigger event_window_guard on public.event_league_windows;
create trigger event_window_guard before insert or update or delete on public.event_league_windows for each row execute function public.protect_event_window();
create or replace function public.record_event_window_change() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and new is not distinct from old then return new; end if;
 update event_league_evaluations set generation=generation+1 where league_id=case when tg_op='DELETE' then old.league_id else new.league_id end;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
drop trigger event_window_generation on public.event_league_windows;
create trigger event_window_generation after insert or update or delete on public.event_league_windows for each row execute function public.record_event_window_change();

create function public.protect_event_evaluation_basis() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare cfg jsonb;
begin
 if tg_op='UPDATE' then
  if new.league_id<>old.league_id or (old.membership_sealed and not new.membership_sealed) then raise exception 'sealed evaluation identity is immutable' using errcode='23514'; end if;
  if new.configuration_version=old.configuration_version then return new; end if;
  perform 1 from leagues where id=new.league_id for update;
  if event_membership_closed(new.league_id) then raise exception 'sealed configuration basis cannot change' using errcode='23514'; end if;
 end if;
 select c.manifest into cfg from leagues l join event_template_configs c on c.template_id=l.template_id and c.version=new.configuration_version and c.sealed where l.id=new.league_id;
 if cfg is null then raise exception 'configuration unavailable' using errcode='40001'; end if;
 if tg_op='UPDATE' then
  -- Revisions may change choices/scoring before predictions; membership stays stable.
  if exists(select 1 from event_league_windows w where w.league_id=new.league_id and
    (select array_agg(x order by x) from unnest(w.market_ids) x) is distinct from
    (select array_agg(value->>'id' order by value->>'id') from jsonb_array_elements(cfg->'markets') where value->>'windowId'=w.window_key)) then
   raise exception 'revision changes configured membership' using errcode='23514';
  end if;
  new.generation:=old.generation+1;
 end if;
 return new;
end $$;
create trigger event_evaluation_basis_guard before insert or update on public.event_league_evaluations for each row execute function public.protect_event_evaluation_basis();

create function public.adopt_event_configuration(p_league_id uuid,p_expected_version integer,p_version integer) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare current_version integer;
begin
 perform 1 from leagues where id=p_league_id for update;
 select configuration_version into current_version from event_league_evaluations where league_id=p_league_id for update;
 if not found or p_expected_version is null or current_version is distinct from p_expected_version then raise exception 'configuration unavailable or stale' using errcode='40001'; end if;
 if p_version=current_version then return; end if;
 update event_league_evaluations set configuration_version=p_version where league_id=p_league_id;
 update event_league_windows set version=version+1 where league_id=p_league_id;
end $$;

-- One command serializes all service window DML with submission/freeze/advance.
create function public.configure_event_window(p_league_id uuid,p_window_key text,p_expected_version integer,p_state text,p_cutoff timestamptz,p_pairings_reviewed boolean,p_market_ids text[],p_delete boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v integer;
begin
 perform 1 from leagues where id=p_league_id for update;
 perform 1 from event_league_evaluations where league_id=p_league_id for update;
 if not found then raise exception 'unsupported event format' using errcode='22023'; end if;
 select version into v from event_league_windows where league_id=p_league_id and window_key=p_window_key for update;
 if p_expected_version is null or (v is null and p_expected_version<>0) or (v is not null and v is distinct from p_expected_version) then raise exception 'window unavailable or stale' using errcode='40001'; end if;
 if p_delete then
  if v is null then raise exception 'unknown window' using errcode='22023'; end if;
  delete from event_league_windows where league_id=p_league_id and window_key=p_window_key;
 elsif v is null then
  insert into event_league_windows(league_id,window_key,state,cutoff,pairings_reviewed,market_ids) values(p_league_id,p_window_key,p_state,p_cutoff,p_pairings_reviewed,p_market_ids);
 else
  update event_league_windows set state=p_state,cutoff=p_cutoff,pairings_reviewed=p_pairings_reviewed,market_ids=p_market_ids where league_id=p_league_id and window_key=p_window_key;
 end if;
end $$;
revoke insert,update,delete,truncate,references,trigger on public.event_league_windows from service_role;
revoke truncate on public.event_template_configs,public.event_league_evaluations from service_role;
-- Basis changes must use the league-first adoption command; worker fields retain their grants.
revoke update on public.event_league_evaluations from service_role;
grant update(generation,evaluated_generation,frozen,basis_token,leaderboard,evaluated_at,coronation_recorded) on public.event_league_evaluations to service_role;

create or replace function submit_event_window(p_league_id uuid,p_magic_token uuid,p_window_key text,p_expected_version integer,p_picks jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
 participant_uuid uuid;
 league_row leagues%rowtype;
 window_row event_league_windows%rowtype;
 evaluation event_league_evaluations%rowtype;
 config event_template_configs%rowtype;
 submitted record;
 market jsonb;
 now_utc timestamptz;
begin
 -- Exact scoped credential before private pick/config reads.
 select id into participant_uuid from participants where league_id=p_league_id and magic_token=p_magic_token;
 if participant_uuid is null then raise exception 'invalid participant credential' using errcode='42501'; end if;
 select * into league_row from leagues where id=p_league_id for update;
 select * into evaluation from event_league_evaluations where league_id=p_league_id for update;
 if not found then raise exception 'unsupported event format' using errcode='22023'; end if;
 select * into window_row from event_league_windows where league_id=p_league_id and window_key=p_window_key for update;
 if not found then raise exception 'unknown window' using errcode='22023'; end if;
 now_utc:=clock_timestamp(); -- Evaluate after row-lock acquisition, never before a wait.
 if evaluation.frozen or window_row.state<>'open' or not window_row.pairings_reviewed or window_row.cutoff is null or now_utc>=window_row.cutoff
    or p_expected_version is null or p_expected_version<=0 or window_row.version is distinct from p_expected_version then raise exception 'window unavailable or stale' using errcode='40001'; end if;
 select * into config from event_template_configs where template_id=league_row.template_id and version=evaluation.configuration_version;
 if not found or not config.sealed or config.version<>evaluation.configuration_version then raise exception 'configuration unavailable' using errcode='40001'; end if;
 if jsonb_typeof(p_picks) is distinct from 'object' then raise exception 'complete window required' using errcode='22023'; end if;
 if (select count(*) from jsonb_object_keys(p_picks))<>cardinality(window_row.market_ids)
    or exists(select 1 from unnest(window_row.market_ids) k where not p_picks ? k) then raise exception 'complete window required' using errcode='22023'; end if;
 for submitted in select key,value from jsonb_each(p_picks) loop
  select value into market from jsonb_array_elements(config.manifest->'markets') where value->>'id'=submitted.key;
  if market is null or market->>'windowId'<>p_window_key or jsonb_typeof(submitted.value)<>'string'
    or not coalesce((market->'choices') ? (submitted.value #>> '{}'),false) then raise exception 'ineligible market choice' using errcode='22023'; end if;
 end loop;
 perform assert_event_membership(p_league_id);
 -- No write until the complete submitted window has validated.
 for submitted in select key,value from jsonb_each_text(p_picks) loop
  insert into picks(league_id,participant_id,slot_id,team_id,locked,event_configuration_version)
  values(p_league_id,participant_uuid,submitted.key,submitted.value,false,config.version)
  on conflict(participant_id,slot_id) do update set team_id=excluded.team_id,submitted_at=now_utc,event_configuration_version=excluded.event_configuration_version
  where not picks.locked and picks.league_id=p_league_id;
  if not found then raise exception 'pick already locked' using errcode='40001'; end if;
 end loop;
 update event_league_evaluations set generation=generation+1,membership_sealed=true where league_id=p_league_id;
end $$;
revoke all on function submit_event_window(uuid,uuid,text,integer,jsonb) from public,anon,authenticated;
grant execute on function submit_event_window(uuid,uuid,text,integer,jsonb) to service_role;


create or replace function advance_event_windows(p_league_id uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare due record; changed integer:=0; first_cutoff timestamptz;
begin
 perform 1 from leagues where id=p_league_id for update;
 if not found then raise exception 'unknown league' using errcode='22023'; end if;
 perform 1 from event_league_evaluations where league_id=p_league_id for update;
 if not found then raise exception 'unsupported event format' using errcode='22023'; end if;
 perform assert_event_membership(p_league_id);
 for due in select * from event_league_windows where league_id=p_league_id and state<>'locked' and cutoff<=clock_timestamp() order by cutoff,window_key for update loop
  update event_league_windows set state='locked',version=version+1 where league_id=p_league_id and window_key=due.window_key;
  update picks set locked=true where league_id=p_league_id and slot_id=any(due.market_ids) and not locked;
  changed:=changed+1;
 end loop;
 select min(cutoff) into first_cutoff from event_league_windows where league_id=p_league_id and state='locked';
 if first_cutoff is not null then
  update leagues set locked_at=first_cutoff where id=p_league_id and locked_at is null;
 end if;
 return changed;
end $$;
revoke all on function advance_event_windows(uuid) from public,anon,authenticated;
grant execute on function advance_event_windows(uuid) to service_role;

revoke all on function validate_event_window_manifest(jsonb),protect_event_configuration(),event_membership_closed(uuid),assert_event_membership(uuid),protect_event_evaluation_basis(),adopt_event_configuration(uuid,integer,integer),configure_event_window(uuid,text,integer,text,timestamptz,boolean,text[],boolean) from public,anon,authenticated;
grant execute on function adopt_event_configuration(uuid,integer,integer),configure_event_window(uuid,text,integer,text,timestamptz,boolean,text[],boolean) to service_role;
-- Invoker triggers need these helpers; they reveal no credential values.
grant execute on function validate_event_window_manifest(jsonb),event_membership_closed(uuid) to service_role;

-- A league cannot reinterpret its immutable version by changing the template.
create function public.protect_event_template_association() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.template_id is distinct from old.template_id and exists(select 1 from event_league_evaluations where league_id=old.id) then
  raise exception 'event template association is immutable' using errcode='23514';
 end if;
 return new;
end $$;
create trigger event_template_association_guard before update of template_id on public.leagues for each row execute function public.protect_event_template_association();
revoke all on function public.protect_event_template_association() from public,anon,authenticated;
