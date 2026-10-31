-- Additive window persistence; legacy templates are untouched and activation stays off.
create table event_template_configs (
 template_id uuid primary key references templates(id) on delete restrict,
 version integer not null check(version > 0),
 sealed boolean not null default false,
 manifest jsonb not null check(jsonb_typeof(manifest)='object'),
 created_at timestamptz not null default now()
);
create table event_league_evaluations (
 league_id uuid primary key references leagues(id) on delete restrict,
 configuration_version integer not null check(configuration_version>0),
 generation bigint not null default 1 check(generation>0),
 evaluated_generation bigint not null default 0 check(evaluated_generation>=0 and evaluated_generation<=generation),
 frozen boolean not null default false,
 basis_token text,
 leaderboard jsonb not null default '[]' check(jsonb_typeof(leaderboard)='array'),
 evaluated_at timestamptz,
 coronation_recorded boolean not null default false
);
create table event_league_windows (
 league_id uuid not null references event_league_evaluations(league_id) on delete restrict,
 window_key text not null check(btrim(window_key)<>''),
 version integer not null default 1 check(version>0),
 state text not null default 'unopened' check(state in ('unopened','open','locked')),
 cutoff timestamptz,
 pairings_reviewed boolean not null default false,
 market_ids text[] not null check(cardinality(market_ids)>0),
 primary key(league_id,window_key),
 check(state<>'open' or (cutoff is not null and pairings_reviewed))
);
alter table picks add column event_configuration_version integer check(event_configuration_version>0);
alter table event_template_configs enable row level security;
alter table event_league_evaluations enable row level security;
alter table event_league_windows enable row level security;
revoke all on event_template_configs,event_league_evaluations,event_league_windows from public,anon,authenticated;
grant all on event_template_configs,event_league_evaluations,event_league_windows to service_role;

create function protect_event_window() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' then
  if old.state='locked' and new.state<>'locked' then raise exception 'locked window cannot reopen' using errcode='23514'; end if;
  if old.cutoff is not null and (new.cutoff is null or new.cutoff>old.cutoff) then raise exception 'cutoff cannot move later' using errcode='23514'; end if;
  if exists(select 1 from leagues where id=old.league_id and locked_at is not null)
     and new.market_ids is distinct from old.market_ids then raise exception 'sealed market membership cannot change' using errcode='23514'; end if;
 end if;
 if cardinality(new.market_ids)<>(select count(distinct x) from unnest(new.market_ids) x) then raise exception 'duplicate window market' using errcode='23514'; end if;
 if exists(select 1 from event_league_windows w where w.league_id=new.league_id and w.window_key<>new.window_key and w.market_ids && new.market_ids) then raise exception 'market belongs to another window' using errcode='23514'; end if;
 return new;
end $$;
create trigger event_window_guard before insert or update on event_league_windows for each row execute function protect_event_window();

create function record_event_window_change() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 update event_league_evaluations set generation=generation+1 where league_id=new.league_id;
 return new;
end $$;
create trigger event_window_generation after insert or update on event_league_windows for each row execute function record_event_window_change();

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
    or window_row.version<>p_expected_version then raise exception 'window unavailable or stale' using errcode='40001'; end if;
 select * into config from event_template_configs where template_id=league_row.template_id;
 if not found or not config.sealed or config.version<>evaluation.configuration_version then raise exception 'configuration unavailable' using errcode='40001'; end if;
 if jsonb_typeof(p_picks) is distinct from 'object' then raise exception 'complete window required' using errcode='22023'; end if;
 if (select count(*) from jsonb_object_keys(p_picks))<>cardinality(window_row.market_ids)
    or exists(select 1 from unnest(window_row.market_ids) k where not p_picks ? k) then raise exception 'complete window required' using errcode='22023'; end if;
 for submitted in select key,value from jsonb_each(p_picks) loop
  select value into market from jsonb_array_elements(config.manifest->'markets') where value->>'id'=submitted.key;
  if market is null or market->>'windowId'<>p_window_key or jsonb_typeof(submitted.value)<>'string'
    or not coalesce((market->'choices') ? (submitted.value #>> '{}'),false) then raise exception 'ineligible market choice' using errcode='22023'; end if;
 end loop;
 -- No write until the complete submitted window has validated.
 for submitted in select key,value from jsonb_each_text(p_picks) loop
  insert into picks(league_id,participant_id,slot_id,team_id,locked,event_configuration_version)
  values(p_league_id,participant_uuid,submitted.key,submitted.value,false,config.version)
  on conflict(participant_id,slot_id) do update set team_id=excluded.team_id,submitted_at=now_utc,event_configuration_version=excluded.event_configuration_version
  where not picks.locked and picks.league_id=p_league_id;
  if not found then raise exception 'pick already locked' using errcode='40001'; end if;
 end loop;
 update event_league_evaluations set generation=generation+1 where league_id=p_league_id;
end $$;
revoke all on function submit_event_window(uuid,uuid,text,integer,jsonb) from public,anon,authenticated;
grant execute on function submit_event_window(uuid,uuid,text,integer,jsonb) to service_role;

create function read_event_picks(p_league_id uuid,p_magic_token uuid default null)
returns table(participant_id uuid,slot_id text,team_id text) language sql stable security definer set search_path=public,pg_temp as $$
 select p.participant_id,p.slot_id,p.team_id
 from picks p
 join participants person on person.id=p.participant_id and person.league_id=p.league_id
 join event_league_windows w on w.league_id=p.league_id and p.slot_id=any(w.market_ids)
 where p.league_id=p_league_id and (w.state='locked' or w.cutoff<=statement_timestamp() or (p_magic_token is not null and person.magic_token=p_magic_token))
$$;
revoke all on function read_event_picks(uuid,uuid) from public,anon,authenticated;
grant execute on function read_event_picks(uuid,uuid) to service_role;

create function join_event_league(p_league_id uuid,p_join_token uuid,p_display_name text)
returns table(participant_id uuid,magic_token uuid) language plpgsql security definer set search_path=public,pg_temp as $$
declare league_row leagues%rowtype;
begin
 select * into league_row from leagues where id=p_league_id and join_token=p_join_token for update;
 if not found then raise exception 'invalid invitation' using errcode='42501'; end if;
 if league_row.locked_at is not null or league_row.status<>'active'
 or not exists(select 1 from event_league_windows where league_id=p_league_id)
 or exists(select 1 from event_league_windows where league_id=p_league_id and (state='locked' or cutoff<=clock_timestamp()))
 then raise exception 'entry closed' using errcode='40001'; end if;
 if p_display_name is null or length(btrim(p_display_name)) not between 1 and 80 then raise exception 'invalid display name' using errcode='22023'; end if;
 return query insert into participants(league_id,display_name) values(p_league_id,btrim(p_display_name)) returning participants.id,participants.magic_token;
end $$;
revoke all on function join_event_league(uuid,uuid,text) from public,anon,authenticated;
grant execute on function join_event_league(uuid,uuid,text) to service_role;

create function freeze_event_league(p_league_id uuid,p_organizer_token uuid,p_frozen boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from leagues where id=p_league_id and organizer_token=p_organizer_token for update;
 if not found then raise exception 'invalid organizer credential' using errcode='42501'; end if;
 update event_league_evaluations set frozen=p_frozen,generation=generation+1 where league_id=p_league_id;
 if not found then raise exception 'unsupported event format' using errcode='22023'; end if;
end $$;
revoke all on function freeze_event_league(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function freeze_event_league(uuid,uuid,boolean) to service_role;

-- New-format state never masquerades as legacy winner-only outcomes.
create function legacy_event_format_supported(p_league_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from leagues where id=p_league_id) and not exists(select 1 from event_league_evaluations where league_id=p_league_id)
$$;
revoke all on function legacy_event_format_supported(uuid) from public,anon,authenticated;
grant execute on function legacy_event_format_supported(uuid) to service_role;

-- Preserve legacy trigger behavior while window formats lock only due markets.
create or replace function lock_picks_on_league_lock()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.locked_at is not null and old.locked_at is null then
  if not exists(select 1 from event_league_evaluations where league_id=new.id) then
   update picks set locked=true where league_id=new.id;
  end if;
  new.status:='locked';
 end if;
 return new;
end $$;
create function prevent_event_pick_reopening() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if exists(select 1 from event_league_evaluations where league_id=new.id)
  and old.locked_at is not null and (new.locked_at is null or new.status='active')
 then raise exception 'event picks cannot reopen' using errcode='23514'; end if;
 return new;
end $$;
create trigger event_league_no_reopen before update of locked_at,status on leagues for each row execute function prevent_event_pick_reopening();

create function advance_event_windows(p_league_id uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare due record; changed integer:=0; first_cutoff timestamptz;
begin
 perform 1 from leagues where id=p_league_id for update;
 if not found then raise exception 'unknown league' using errcode='22023'; end if;
 perform 1 from event_league_evaluations where league_id=p_league_id for update;
 if not found then raise exception 'unsupported event format' using errcode='22023'; end if;
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
