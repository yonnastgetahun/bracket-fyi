-- WPR1: durable logical-key history, retained when a draft window is removed.
-- Upgrade captures extant rows only; previously deleted history needs separate
-- evidence-based disposition before activation. Never reset this ledger.
begin;
lock table public.event_league_windows in access exclusive mode;
create table public.event_window_incarnation_history (
 league_id uuid not null references public.leagues(id) on delete cascade,
 window_key text not null,
 last_version integer not null check(last_version>0),
 earliest_cutoff timestamptz,
 primary key(league_id,window_key)
);
alter table public.event_window_incarnation_history enable row level security;
revoke all on public.event_window_incarnation_history from public,anon,authenticated,service_role;
grant select on public.event_window_incarnation_history to service_role;
insert into public.event_window_incarnation_history(league_id,window_key,last_version,earliest_cutoff)
select league_id,window_key,version,cutoff from public.event_league_windows;

create or replace function public.protect_event_window() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare lid uuid; cfg jsonb; expected text[]; history public.event_window_incarnation_history%rowtype;
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
 select * into history from public.event_window_incarnation_history
 where league_id=lid and window_key=new.window_key for update;
 if history.earliest_cutoff is not null and
    (new.cutoff is null or new.cutoff>history.earliest_cutoff) then
  raise exception 'cutoff cannot move later' using errcode='23514';
 end if;
 if tg_op='INSERT' then
  -- Never trust the column default or a caller-supplied reincarnation token.
  new.version:=coalesce(history.last_version,0)+1;
 end if;
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
 -- All paths (configure, adoption, advancement) pass this trigger.
 -- Same transaction and league-first lock: failures roll back allocation too.
 insert into public.event_window_incarnation_history(league_id,window_key,last_version,earliest_cutoff)
 values(lid,new.window_key,new.version,new.cutoff)
 on conflict(league_id,window_key) do update
 set last_version=excluded.last_version,
     earliest_cutoff=least(event_window_incarnation_history.earliest_cutoff,excluded.earliest_cutoff);
 return new;
end $$;

create or replace function public.event_membership_closed(p_league_id uuid) returns boolean
language sql volatile set search_path=public,pg_temp as $$
 select exists(select 1 from leagues where id=p_league_id and locked_at is not null)
 or exists(select 1 from event_league_evaluations where league_id=p_league_id and membership_sealed)
 or exists(select 1 from event_league_windows where league_id=p_league_id and (state='locked' or cutoff<=clock_timestamp()))
 or exists(select 1 from event_window_incarnation_history where league_id=p_league_id and earliest_cutoff<=clock_timestamp())
 or exists(select 1 from picks where league_id=p_league_id)
$$;

revoke all on function public.protect_event_window() from public,anon,authenticated,service_role;
comment on table public.event_window_incarnation_history is
 'Durable window version high-water mark and earliest cutoff; retain across draft deletion. Pre-migration deleted history is unrecoverable from current rows alone.';
commit;
