-- Non-retryable business conflicts use PostgREST HTTP 409 (PT409).
-- Apply after 00011, and LAST after replaying any earlier forward repair.
-- Exact current definitions; only deliberate RAISE errcode literals changed.
-- CREATE OR REPLACE preserves owner/ACL; no catch of engine serialization failures.
begin;
set local search_path=public,pg_temp;

-- assert_event_membership: 20261027000003_window_integrity_repair.sql; 1 deliberate business raise(s).
create or replace function public.assert_event_membership(p_league_id uuid) returns void
language plpgsql set search_path=public,pg_temp as $$
declare cfg jsonb;
begin
 select c.manifest into cfg from leagues l join event_league_evaluations e on e.league_id=l.id
 join event_template_configs c on c.template_id=l.template_id and c.version=e.configuration_version and c.sealed where l.id=p_league_id;
 if cfg is null then raise exception 'configuration unavailable' using errcode='PT409'; end if;
 if exists(
  (select value->>'id',value->>'windowId' from jsonb_array_elements(cfg->'markets')
   except select unnest(market_ids),window_key from event_league_windows where league_id=p_league_id)
  union all
  (select unnest(market_ids),window_key from event_league_windows where league_id=p_league_id
   except select value->>'id',value->>'windowId' from jsonb_array_elements(cfg->'markets'))
 ) then raise exception 'complete logical membership required' using errcode='23514'; end if;
end $$;

-- protect_event_window: 20261027000005_window_incarnation_history.sql; 1 deliberate business raise(s).
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
 if cfg is null then raise exception 'configuration unavailable' using errcode='PT409'; end if;
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

-- protect_event_evaluation_basis: 20261027000010_reviewed_pairings.sql; 1 deliberate business raise(s).
create or replace function public.protect_event_evaluation_basis() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare cfg jsonb;
begin
 if tg_op='UPDATE' then
  if new.league_id<>old.league_id or (old.membership_sealed and not new.membership_sealed) then raise exception 'sealed evaluation identity is immutable' using errcode='23514'; end if;
  if new.configuration_version=old.configuration_version then return new; end if;
  perform 1 from leagues where id=new.league_id for update;
  if event_membership_closed(new.league_id) and not exists(
 select 1 from event_pairing_reviews r where r.league_id=new.league_id
 and r.from_version=old.configuration_version and r.to_version=new.configuration_version and r.status='adopted'
) then raise exception 'sealed configuration basis cannot change' using errcode='23514'; end if;
 end if;
 select c.manifest into cfg from leagues l join event_template_configs c on c.template_id=l.template_id and c.version=new.configuration_version and c.sealed where l.id=new.league_id;
 if cfg is null then raise exception 'configuration unavailable' using errcode='PT409'; end if;
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

-- adopt_event_configuration: 20261027000003_window_integrity_repair.sql; 1 deliberate business raise(s).
create or replace function public.adopt_event_configuration(p_league_id uuid,p_expected_version integer,p_version integer) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare current_version integer;
begin
 perform 1 from leagues where id=p_league_id for update;
 select configuration_version into current_version from event_league_evaluations where league_id=p_league_id for update;
 if not found or p_expected_version is null or current_version is distinct from p_expected_version then raise exception 'configuration unavailable or stale' using errcode='PT409'; end if;
 if p_version=current_version then return; end if;
 update event_league_evaluations set configuration_version=p_version where league_id=p_league_id;
 update event_league_windows set version=version+1 where league_id=p_league_id;
end $$;

-- configure_event_window: 20261027000003_window_integrity_repair.sql; 1 deliberate business raise(s).
create or replace function public.configure_event_window(p_league_id uuid,p_window_key text,p_expected_version integer,p_state text,p_cutoff timestamptz,p_pairings_reviewed boolean,p_market_ids text[],p_delete boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v integer;
begin
 perform 1 from leagues where id=p_league_id for update;
 perform 1 from event_league_evaluations where league_id=p_league_id for update;
 if not found then raise exception 'unsupported event format' using errcode='22023'; end if;
 select version into v from event_league_windows where league_id=p_league_id and window_key=p_window_key for update;
 if p_expected_version is null or (v is null and p_expected_version<>0) or (v is not null and v is distinct from p_expected_version) then raise exception 'window unavailable or stale' using errcode='PT409'; end if;
 if p_delete then
  if v is null then raise exception 'unknown window' using errcode='22023'; end if;
  delete from event_league_windows where league_id=p_league_id and window_key=p_window_key;
 elsif v is null then
  insert into event_league_windows(league_id,window_key,state,cutoff,pairings_reviewed,market_ids) values(p_league_id,p_window_key,p_state,p_cutoff,p_pairings_reviewed,p_market_ids);
 else
  update event_league_windows set state=p_state,cutoff=p_cutoff,pairings_reviewed=p_pairings_reviewed,market_ids=p_market_ids where league_id=p_league_id and window_key=p_window_key;
 end if;
end $$;

-- submit_event_window: 20261027000003_window_integrity_repair.sql; 3 deliberate business raise(s).
create or replace function public.submit_event_window(p_league_id uuid,p_magic_token uuid,p_window_key text,p_expected_version integer,p_picks jsonb)
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
    or p_expected_version is null or p_expected_version<=0 or window_row.version is distinct from p_expected_version then raise exception 'window unavailable or stale' using errcode='PT409'; end if;
 select * into config from event_template_configs where template_id=league_row.template_id and version=evaluation.configuration_version;
 if not found or not config.sealed or config.version<>evaluation.configuration_version then raise exception 'configuration unavailable' using errcode='PT409'; end if;
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
  if not found then raise exception 'pick already locked' using errcode='PT409'; end if;
 end loop;
 update event_league_evaluations set generation=generation+1,membership_sealed=true where league_id=p_league_id;
end $$;

-- event_lifecycle_effective: 20261027000006_event_lifecycle.sql; 1 deliberate business raise(s).
create or replace function public.event_lifecycle_effective(p_league_id uuid,p_now timestamptz)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare cfg jsonb; m jsonb; r contest_results%rowtype; o event_lifecycle_revisions%rowtype;
 result jsonb:='{}'; outcome jsonb; effective jsonb; provenance jsonb; active boolean; config_version integer;
begin
 select c.manifest into cfg from leagues l join event_league_evaluations e on e.league_id=l.id
 join event_template_configs c on c.template_id=l.template_id and c.version=e.configuration_version
 where l.id=p_league_id and c.sealed;
 if cfg is null then raise exception 'configuration unavailable' using errcode='PT409'; end if;
 select configuration_version into config_version from event_league_evaluations where league_id=p_league_id;
 for m in select value from jsonb_array_elements(cfg->'markets') order by value->>'id' loop
  select * into r from contest_results where contest_id=(m->>'contestId')::uuid order by version desc limit 1;
  select * into o from event_lifecycle_revisions where league_id=p_league_id and market_id=m->>'id' order by revision desc limit 1;
  active:=o.outcome is not null and (o.expires_at is null or o.expires_at>p_now);
  outcome:=case when active then o.outcome else
   case r.outcome_type
    when 'winner' then jsonb_build_object('kind','winner','entrant',r.winner_event_entry_id)
    when 'winner_set' then jsonb_build_object('kind','winner-set','entrants',r.winner_nomination_ids)
    when 'draw' then '{"kind":"draw"}'::jsonb
    when 'no_contest' then '{"kind":"no-contest"}'::jsonb
    else '{"kind":"unresolved"}'::jsonb end end;
  effective:=jsonb_build_object('configurationVersion',config_version,'localRevision',coalesce(o.revision,0),'outcome',outcome,'held',coalesce(o.held,false),'excluded',coalesce(o.excluded,false),
   'override',case when active then o.id else null end,
   'canonical',case when not active then r.id else null end);
  provenance:=jsonb_build_object('effective',effective,'canonicalResultId',r.id,'canonicalVersion',coalesce(r.version,0),
   'canonicalData',r.result_data,'configurationVersion',config_version,'overrideId',o.id,'overrideRevision',coalesce(o.revision,0),'expiresAt',o.expires_at);
  result:=result||jsonb_build_object(m->>'id',jsonb_build_object(
   'outcome',outcome,'source',case when active then 'override' when r.id is not null then 'canonical' else 'unresolved' end,
   'canonicalResultId',r.id,'canonicalVersion',coalesce(r.version,0),
   'canonicalToken',event_lifecycle_hash(jsonb_build_object('id',r.id,'version',coalesce(r.version,0))),
   'overrideId',case when active then o.id else null end,'overrideRevision',coalesce(o.revision,0),'expiresAt',o.expires_at,
   'configurationVersion',config_version,'requiredSetRevision',coalesce(o.revision,0),
   'derivedProvenance',jsonb_build_object('algorithm',r.result_data->'algorithm','algorithmVersion',r.result_data->'algorithmVersion','children',r.result_data->'children'),'held',coalesce(o.held,false),'excluded',coalesce(o.excluded,false),
   'effectiveToken',event_lifecycle_hash(effective),'provenanceToken',event_lifecycle_hash(provenance)));
 end loop;
 return result;
end $$;

-- event_lifecycle_basis: 20261027000010_reviewed_pairings.sql; 2 deliberate business raise(s).
create or replace function public.event_lifecycle_basis(p_league_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare cfg jsonb; e event_league_evaluations%rowtype; l leagues%rowtype;
 b jsonb; ws jsonb; ps jsonb; hs jsonb; qs jsonb; effective jsonb; t timestamptz:=clock_timestamp();
begin
 select * into l from leagues where id=p_league_id;
 select * into e from event_league_evaluations where league_id=p_league_id;
 select manifest into cfg from event_template_configs where template_id=l.template_id and version=e.configuration_version and sealed;
 if cfg is null then raise exception 'configuration unavailable' using errcode='PT409'; end if;
 if exists(select 1 from picks where league_id=p_league_id and not event_pairing_basis_compatible(p_league_id,event_configuration_version,e.configuration_version)) then
  raise exception 'pick configuration basis changed' using errcode='PT409'; end if;
 effective:=event_lifecycle_effective(p_league_id,t);
 select coalesce(jsonb_agg(jsonb_build_object('id',window_key,'version',version,'state',state,'cutoff',cutoff,'pairingsReviewed',pairings_reviewed,'marketIds',market_ids) order by window_key),'[]') into ws
 from event_league_windows where league_id=p_league_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',person.id,'graphVersion',e.configuration_version,
  'picks',coalesce((select jsonb_object_agg(slot_id,team_id order by slot_id) from picks where participant_id=person.id and league_id=p_league_id),'{}')) order by person.id),'[]')
 into ps from participants person where person.league_id=p_league_id;
 select coalesce(jsonb_agg(id order by id),'[]') into hs from league_completion_holds
 where league_id=p_league_id and status='active' and (expires_at is null or expires_at>t);
 select coalesce(jsonb_agg(q.id order by q.id),'[]') into qs from ingestion_quarantine q
 join provider_bindings pb on pb.id=q.binding_id
 where q.status='open' and q.severity in ('error','blocking') and pb.event_edition_id in (
  select c.event_edition_id from contests c where c.id in (select (value->>'contestId')::uuid from jsonb_array_elements(cfg->'markets')));
 b:=jsonb_build_object('configurationVersion',e.configuration_version,'manifest',cfg,'windows',ws,'participants',ps,
  'effective',effective,'holds',hs,'quarantines',qs,'locked',l.locked_at is not null,'frozen',e.frozen,
  'disabled',e.lifecycle_disabled);
 return jsonb_build_object('leagueId',p_league_id,'generation',e.generation,'basisToken',event_lifecycle_hash(b),'basis',b);
end $$;

-- mutate_event_lifecycle: 20261027000006_event_lifecycle.sql; 2 deliberate business raise(s).
create or replace function public.mutate_event_lifecycle(p_league_id uuid,p_organizer_token uuid,p_market_id text,
 p_action text,p_payload jsonb,p_reason text,p_expected_effective_token text,p_expected_canonical_token text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg jsonb; m jsonb; binding jsonb; before jsonb; prior event_lifecycle_revisions%rowtype;
 old event_lifecycle_revisions%rowtype; req jsonb; outcome jsonb; expiry timestamptz; held boolean; excluded boolean;
 fingerprint text; revision_id uuid; g bigint; kind text; winner text; nominee uuid;
begin
 perform 1 from leagues where id=p_league_id and organizer_token=p_organizer_token for update;
 if not found then raise exception 'invalid organizer credential' using errcode='42501'; end if;
 perform 1 from event_league_evaluations where league_id=p_league_id and not lifecycle_disabled for update;
 if not found then raise exception 'unsupported event format' using errcode='22023'; end if;
 if p_reason is null or length(btrim(p_reason)) not between 1 and 500 or p_idempotency_key is null
 or length(btrim(p_idempotency_key)) not between 1 and 200 or jsonb_typeof(p_payload) is distinct from 'object'
 or p_action is null or p_action not in ('override','release','hold','disposition') then
  raise exception 'invalid lifecycle command' using errcode='22023';
 end if;
 if (p_action='override' and (p_payload - array['outcome','expiresAt'])<>'{}'::jsonb)
 or (p_action='release' and p_payload<>'{}'::jsonb)
 or (p_action='hold' and (p_payload - 'held')<>'{}'::jsonb)
 or (p_action='disposition' and (p_payload - 'excluded')<>'{}'::jsonb) then
  raise exception 'unknown lifecycle command fields' using errcode='22023'; end if;
 fingerprint:=encode(extensions.digest(p_organizer_token::text,'sha256'),'hex');
 req:=jsonb_build_object('market',p_market_id,'action',p_action,'payload',p_payload,'reason',p_reason,
  'effective',p_expected_effective_token,'canonical',p_expected_canonical_token,'actor',fingerprint);
 select * into prior from event_lifecycle_revisions where league_id=p_league_id and idempotency_key=p_idempotency_key;
 if found then
  if prior.request<>req then raise exception 'idempotency conflict' using errcode='PT409'; end if;
  return jsonb_build_object('revisionId',prior.id,'revision',prior.revision,'replayed',true);
 end if;
 select c.manifest into cfg from leagues l join event_league_evaluations e on e.league_id=l.id
 join event_template_configs c on c.template_id=l.template_id and c.version=e.configuration_version and c.sealed where l.id=p_league_id;
 select value into m from jsonb_array_elements(cfg->'markets') where value->>'id'=p_market_id;
 if m is null then raise exception 'unknown market' using errcode='22023'; end if;
 perform assert_event_lifecycle_configuration(p_league_id);
 before:=event_lifecycle_effective(p_league_id,clock_timestamp())->p_market_id;
 if p_expected_effective_token is null or before->>'effectiveToken'<>p_expected_effective_token
 or (p_action='release' and (p_expected_canonical_token is null or before->>'canonicalToken'<>p_expected_canonical_token)) then
  raise exception 'effective result changed' using errcode='PT409';
 end if;
 select * into old from event_lifecycle_revisions where league_id=p_league_id and market_id=p_market_id order by revision desc limit 1;
 outcome:=old.outcome; expiry:=old.expires_at; held:=coalesce(old.held,false); excluded:=coalesce(old.excluded,false);
 if p_action='override' then
  outcome:=p_payload->'outcome'; expiry:=(p_payload->>'expiresAt')::timestamptz; kind:=outcome->>'kind';
  if jsonb_typeof(outcome) is distinct from 'object' or kind is null or kind not in ('unresolved','winner','winner-set','draw','no-contest')
   or (expiry is not null and expiry<=clock_timestamp()) then raise exception 'invalid typed outcome' using errcode='22023'; end if;
  if (kind='winner' and (select array_agg(key order by key) from jsonb_object_keys(outcome) key)<>array['entrant','kind'])
   or (kind='winner-set' and (select array_agg(key order by key) from jsonb_object_keys(outcome) key)<>array['entrants','kind'])
   or (kind in ('unresolved','draw','no-contest') and outcome<>jsonb_build_object('kind',kind)) then
   raise exception 'invalid typed outcome shape' using errcode='22023'; end if;
  if kind='draw' and m->>'outcomeDomain' is distinct from 'regulation-home-draw-away'
   or kind='winner-set' and m->>'outcomeDomain' is distinct from 'nomination-winner-set'
   or kind='winner' and (m->>'outcomeDomain' is null or m->>'outcomeDomain'='nomination-winner-set') then
   raise exception 'unsupported outcome domain' using errcode='22023'; end if;
  select value into binding from jsonb_array_elements(cfg->'lifecycle'->'binding'->'markets') where value->>'marketId'=p_market_id;
  if kind='winner' then
   winner:=outcome->>'entrant';
   if winner is null or not coalesce((binding->'eligibleEntrantIds') ? winner,false)
    or (binding->'orientation'<>'null'::jsonb and binding->'orientation' is not null and not (binding->'orientation' ? winner)) then
    raise exception 'ineligible winner' using errcode='22023'; end if;
   if m->>'contestId' is not null and not exists(select 1 from contest_entries where contest_id=(m->>'contestId')::uuid and event_entry_id=winner::uuid) then
    raise exception 'winner absent from canonical contest' using errcode='22023'; end if;
  elsif kind='winner-set' then
   if jsonb_typeof(outcome->'entrants') is distinct from 'array' then raise exception 'invalid nomination set' using errcode='22023'; end if;
   if jsonb_array_length(outcome->'entrants')=0 or (select count(*)<>count(distinct value) from jsonb_array_elements(outcome->'entrants'))
    or m->>'contestId' is null then raise exception 'invalid nomination set' using errcode='22023'; end if;
   for winner in select jsonb_array_elements_text(outcome->'entrants') loop
    nominee:=winner::uuid;
    if not coalesce((binding->'eligibleEntrantIds') ? winner,false) or not exists(select 1 from award_nominations where id=nominee and contest_id=(m->>'contestId')::uuid and eligible) then
     raise exception 'ineligible nomination' using errcode='22023'; end if;
   end loop;
   select jsonb_build_object('kind','winner-set','entrants',jsonb_agg(value order by value)) into outcome from jsonb_array_elements(outcome->'entrants');
  end if;
 elsif p_action='release' then outcome:=null; expiry:=null;
 elsif p_action='hold' then
  if jsonb_typeof(p_payload->'held') is distinct from 'boolean' then raise exception 'held boolean required' using errcode='22023'; end if;
  held:=(p_payload->>'held')::boolean;
 else
  if jsonb_typeof(p_payload->'excluded') is distinct from 'boolean' then raise exception 'excluded boolean required' using errcode='22023'; end if;
  excluded:=(p_payload->>'excluded')::boolean;
 end if;
 insert into event_lifecycle_revisions(league_id,market_id,revision,outcome,expires_at,held,excluded,action,reason,actor_fingerprint,idempotency_key,request)
 values(p_league_id,p_market_id,coalesce(old.revision,0)+1,outcome,expiry,held,excluded,p_action,btrim(p_reason),fingerprint,p_idempotency_key,req) returning id into revision_id;
 update event_league_evaluations set generation=generation+1 where league_id=p_league_id returning generation into g;
 insert into event_lifecycle_audit(league_id,generation,kind,revision_id,details)
 values(p_league_id,g,p_action,revision_id,jsonb_build_object('reason',btrim(p_reason),'actorFingerprint',fingerprint,'marketId',p_market_id));
 return jsonb_build_object('revisionId',revision_id,'revision',coalesce(old.revision,0)+1,'generation',g,'replayed',false);
end $$;

-- commit_event_lifecycle: 20261027000009_window_lifecycle_repairs.sql; 1 deliberate business raise(s).
create or replace function public.commit_event_lifecycle(p_league_id uuid,p_generation bigint,p_basis_token text,p_leaderboard jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare snapshot jsonb; b jsonb; e event_league_evaluations%rowtype; m jsonb; result jsonb;
 complete boolean:=true; held boolean:=false; state text; first_crown boolean:=false; next_generation bigint;
begin
 perform 1 from leagues where id=p_league_id for update;
 select * into e from event_league_evaluations where league_id=p_league_id for update;
 if not found then raise exception 'unsupported event format' using errcode='22023'; end if;
 snapshot:=event_lifecycle_basis(p_league_id); b:=snapshot->'basis';
 if p_generation is null or p_generation<>e.generation or p_basis_token is null or p_basis_token<>snapshot->>'basisToken' then
  raise exception 'lifecycle basis changed' using errcode='PT409'; end if;
 if e.evaluated_generation=e.generation and e.basis_token=p_basis_token then
  return jsonb_build_object('state',e.lifecycle_state,'replayed',true,'coronation',false);
 end if;
 if jsonb_typeof(p_leaderboard) is distinct from 'array'
 or exists(select 1 from jsonb_array_elements(p_leaderboard) r where jsonb_typeof(r) is distinct from 'object'
  or not (r ?& array['id','earned','maximum','wrong','pending','rank'])
  or (select count(*) from jsonb_object_keys(r))<>6
  or not exists(select 1 from participants where league_id=p_league_id and id::text=r->>'id'))
 or (select count(*)<>count(distinct r->>'id') from jsonb_array_elements(p_leaderboard) r)
 or jsonb_array_length(p_leaderboard)<>(select count(*) from participants where league_id=p_league_id) then
  raise exception 'invalid leaderboard' using errcode='22023'; end if;
 perform assert_event_membership(p_league_id);
 perform assert_event_lifecycle_configuration(p_league_id);
 held:=(b->>'disabled')::boolean or jsonb_array_length(b->'holds')>0 or jsonb_array_length(b->'quarantines')>0;
 complete:=(b->>'locked')::boolean and jsonb_array_length(b->'windows')>0
  and not exists(select 1 from jsonb_array_elements(b->'windows') w where w->>'state'<>'locked')
  and exists(select 1 from jsonb_array_elements(b->'manifest'->'markets') market where coalesce((market->>'required')::boolean,(market->>'scored')::boolean,false)
   and not (b->'effective'->(market->>'id')->>'excluded')::boolean);
 for m in select value from jsonb_array_elements(b->'manifest'->'markets') loop
  result:=b->'effective'->(m->>'id');
  held:=held or (result->>'held')::boolean;
  if not (result->>'excluded')::boolean and coalesce((m->>'required')::boolean,(m->>'scored')::boolean,false) then
   if result->'outcome'->>'kind' in ('unresolved','no-contest') then complete:=false; end if;
   if result->'outcome'->>'kind'='no-contest' then held:=true; end if;
   if result->'outcome'->>'kind'='draw' and m->>'outcomeDomain' is distinct from 'regulation-home-draw-away' then held:=true; end if;
   if result->'outcome'->>'kind'='winner-set' and m->>'outcomeDomain' is distinct from 'nomination-winner-set' then held:=true; end if;
   if result->'outcome'->>'kind'='winner' and m->>'outcomeDomain'='nomination-winner-set' then held:=true; end if;
  end if;
 end loop;
 state:=case when held then 'held' when complete then 'complete' when (b->>'locked')::boolean then 'locked' else 'active' end;
 first_crown:=state='complete' and not e.coronation_recorded;
 next_generation:=e.generation;
 update event_league_evaluations set evaluated_generation=next_generation,basis_token=p_basis_token,leaderboard=p_leaderboard,
  evaluated_at=clock_timestamp(),lifecycle_state=state,completed_at=case when state='complete' then coalesce(completed_at,clock_timestamp()) else null end,
  coronation_recorded=coronation_recorded or first_crown where league_id=p_league_id;
 if (b->>'locked')::boolean then update leagues set status=(case when state='complete' then 'complete' else 'locked' end)::league_status where id=p_league_id; end if;
 insert into event_lifecycle_audit(league_id,generation,kind,basis_token,details)
 values(p_league_id,next_generation,'evaluated',p_basis_token,jsonb_build_object('from',e.lifecycle_state,'to',state));
 if first_crown then insert into event_lifecycle_audit(league_id,generation,kind,basis_token)
 values(p_league_id,next_generation,'coronation',p_basis_token) on conflict do nothing; end if;
 return jsonb_build_object('state',state,'replayed',false,'coronation',first_crown);
end $$;

-- join_event_league: 20261027000009_window_lifecycle_repairs.sql; 1 deliberate business raise(s).
create or replace function public.join_event_league(p_league_id uuid,p_join_token uuid,p_display_name text)
returns table(participant_id uuid,magic_token uuid) language plpgsql security definer set search_path=public,pg_temp as $$
declare league_row leagues%rowtype;
begin
 select * into league_row from leagues where id=p_league_id and join_token=p_join_token for update;
 if not found then raise exception 'invalid invitation' using errcode='42501'; end if;
 if league_row.locked_at is not null or league_row.status<>'active'
 or exists(select 1 from event_window_incarnation_history where league_id=p_league_id and earliest_cutoff<=clock_timestamp())
 or not exists(select 1 from event_league_windows where league_id=p_league_id)
 or exists(select 1 from event_league_windows where league_id=p_league_id and (state='locked' or cutoff<=clock_timestamp()))
 then raise exception 'entry closed' using errcode='PT409'; end if;
 if p_display_name is null or length(btrim(p_display_name)) not between 1 and 80 then raise exception 'invalid display name' using errcode='22023'; end if;
 return query insert into participants(league_id,display_name) values(p_league_id,btrim(p_display_name)) returning participants.id,participants.magic_token;
end $$;

-- emit_event_notification: 20261027000007_event_notifications.sql; 2 deliberate business raise(s).
create or replace function public.emit_event_notification(p_league uuid,p_kind text,p_key text,p_basis text,p_expiry timestamptz,p_organizer uuid default null,p_message text default null)
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
 raise exception 'notification basis changed' using errcode='PT409'; end if;
 if p_message is not null and (p_kind<>'broadcast' or length(p_message)>500 or length(btrim(p_message))=0) then
 raise exception 'invalid broadcast message' using errcode='22023'; end if;
 if p_key is null or length(p_key) not between 1 and 200 then raise exception 'invalid logical event key' using errcode='22023'; end if;
 select id into audit_id from event_lifecycle_audit where league_id=p_league and kind='notification'
 and details->>'trigger'=p_kind and details->>'key'=p_key;
 if audit_id is not null then
  if exists(select 1 from event_lifecycle_audit where id=audit_id and details->>'message' is distinct from p_message) then
   raise exception 'notification idempotency conflict' using errcode='PT409'; end if;
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

-- review_event_pairings: 20261027000010_reviewed_pairings.sql; 4 deliberate business raise(s).
create or replace function public.review_event_pairings(p_league uuid,p_organizer uuid,p_window text,p_window_version integer,
 p_configuration_version integer,p_basis text,p_pairings jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l leagues%rowtype; e event_league_evaluations%rowtype; w event_league_windows%rowtype;
 cfg jsonb; next_cfg jsonb; m jsonb; b jsonb; pair jsonb; s jsonb; effective jsonb;
 bindings jsonb:='[]'; markets jsonb:='[]'; assigned jsonb:='{}'; used jsonb:='{}';
 source_key text; entrant text; i integer; v integer; upstream jsonb;
begin
 select * into l from leagues where id=p_league for update;
 if not found or l.organizer_token is distinct from p_organizer then raise exception 'invalid credential' using errcode='42501'; end if;
 select * into strict e from event_league_evaluations where league_id=p_league for update;
 select * into w from event_league_windows where league_id=p_league and window_key=p_window for update;
 if not found or w.version is distinct from p_window_version or e.configuration_version is distinct from p_configuration_version
 or event_lifecycle_basis(p_league)->>'basisToken' is distinct from p_basis then raise exception 'stale review' using errcode='PT409'; end if;
 select manifest into cfg from event_template_configs where template_id=l.template_id and version=e.configuration_version and sealed;
 if cfg->'application'->>'label' is distinct from 'Synthetic local rehearsal — not official fixtures'
 or cfg->>'lockMode' is distinct from 'per-window' or
 (cfg->>'editionKey' in ('ucl-2026-27','wwc-2027')) is distinct from true then
 raise exception 'unsupported review' using errcode='22023'; end if;
 if p_reason is null or length(btrim(p_reason)) not between 1 and 500 or jsonb_typeof(p_pairings) is distinct from 'object'
 or (select array_agg(key order by key) from jsonb_object_keys(p_pairings) key)
 is distinct from (select array_agg(x order by x) from unnest(w.market_ids) x) then
 raise exception 'complete pairings required' using errcode='22023'; end if;
 -- No change to any already-open/picked/locked market: no reinterpretation of saved choices.
 if w.state<>'unopened' or w.cutoff<=clock_timestamp() or exists(select 1 from picks where league_id=p_league and slot_id=any(w.market_ids)) then
 insert into event_pairing_corrections(league_id,configuration_version,window_key,pairings,basis_token,reason,actor_fingerprint)
 values(p_league,e.configuration_version,p_window,p_pairings,p_basis,btrim(p_reason),event_lifecycle_hash(to_jsonb(p_organizer)));
 effective:=event_lifecycle_effective(p_league,clock_timestamp());
 for m in select value from jsonb_array_elements(cfg->'markets') where value->>'windowId'=p_window loop
  perform mutate_event_lifecycle(p_league,p_organizer,m->>'id','hold','{"held":true}'::jsonb,
   'Pairing correction held: '||left(btrim(p_reason),470),effective->(m->>'id')->>'effectiveToken',null,
   'pairing-hold:'||event_lifecycle_hash(to_jsonb(p_window)||p_pairings)||':'||e.generation||':'||event_lifecycle_hash(m->'id'));
 end loop;
 update event_league_evaluations set frozen=true,generation=generation+1 where league_id=p_league;
 return jsonb_build_object('status','held','configurationVersion',e.configuration_version);
 end if;
 effective:=event_lifecycle_effective(p_league,clock_timestamp());
 if exists(select 1 from jsonb_array_elements(cfg->'windows') win,
 jsonb_array_elements_text(win->'prerequisiteMarketIds') mid where win->>'id'=p_window and
 (coalesce(effective->mid->'outcome'->>'kind','unresolved') not in ('winner','winner-set','draw')
 or coalesce((effective->mid->>'held')::boolean,false) or coalesce((effective->mid->>'excluded')::boolean,false))) then
 raise exception 'unresolved prerequisite' using errcode='PT409'; end if;
 for m in select value from jsonb_array_elements(cfg->'markets') loop
  select value into b from jsonb_array_elements(cfg->'lifecycle'->'binding'->'markets') where value->>'marketId'=m->>'id';
  if m->>'windowId'=p_window then
   pair:=p_pairings->(m->>'id');
   if jsonb_typeof(pair) is distinct from 'array' or jsonb_array_length(pair)<>2 or pair->>0=pair->>1
   or jsonb_array_length(m->'inputs')<>2 then raise exception 'invalid pairing' using errcode='22023'; end if;
   for i in 0..1 loop
    entrant:=pair->>i; s:=m->'inputs'->i;
    if jsonb_typeof(pair->i) is distinct from 'string' or not (b->'eligibleEntrantIds' ? entrant) then
     raise exception 'ineligible entrant' using errcode='22023'; end if;
    if s->>'kind'='entrant' and s->>'entrantId' is distinct from entrant then raise exception 'source conflict' using errcode='22023'; end if;
    if s->>'kind' in ('winner','loser') then
     upstream:=effective->(s->>'marketId')->'outcome';
     if upstream->>'kind' is distinct from 'winner' or
      (s->>'kind'='winner' and upstream->>'entrant' is distinct from entrant) or
      (s->>'kind'='loser' and (upstream->>'entrant'=entrant or not exists(
       select 1 from jsonb_array_elements(cfg->'lifecycle'->'binding'->'markets') x
       where x->>'marketId'=s->>'marketId' and x->'orientation' ? entrant))) then
      raise exception 'effective source conflict' using errcode='22023'; end if;
    elsif s->>'kind'='reviewed-placement' then
     -- WWC group placement must belong to that reviewed source group's actual entrants.
     if cfg->>'editionKey' like '%wwc%' and not exists(
      select 1 from jsonb_array_elements(cfg->'markets') src,
      jsonb_array_elements(src->'inputs') si where s->'marketIds' ? (src->>'id') and si->>'entrantId'=entrant) then
      raise exception 'group placement conflict' using errcode='22023'; end if;
    elsif s->>'kind'<>'entrant' then raise exception 'unsupported source' using errcode='22023'; end if;
    source_key:=s::text;
    if (assigned ? source_key and assigned->>source_key<>entrant) or
     (used ? entrant and used->>entrant<>source_key) then raise exception 'inconsistent or duplicate placement' using errcode='22023'; end if;
    assigned:=assigned||jsonb_build_object(source_key,entrant); used:=used||jsonb_build_object(entrant,source_key);
   end loop;
   if effective->(m->>'id')->'outcome'->>'kind'='winner' and
      not (pair ? (effective->(m->>'id')->'outcome'->>'entrant')) then
    raise exception 'pairing conflicts with existing target result' using errcode='PT409';
   end if;
   -- A changed semifinal loser cannot silently reinterpret an already-reviewed bronze pairing.
   if exists(select 1 from jsonb_array_elements(cfg->'lifecycle'->'binding'->'markets') downstream,
    jsonb_array_elements(downstream->'inputs') with ordinality ds(source,ordinal)
    where ds.source->>'kind'='loser' and ds.source->>'marketId'=m->>'id'
     and jsonb_typeof(downstream->'orientation')='array'
     and (not (pair ? (downstream->'orientation'->>(ds.ordinal::integer-1)))
      or downstream->'orientation'->>(ds.ordinal::integer-1)=effective->(m->>'id')->'outcome'->>'entrant')) then
    raise exception 'pairing conflicts with reviewed downstream source' using errcode='PT409';
   end if;
   b:=jsonb_set(b,'{orientation}',pair);
   if m->>'outcomeDomain'<>'regulation-home-draw-away' then m:=jsonb_set(m,'{choices}',pair); end if;
  end if;
  markets:=markets||jsonb_build_array(m); bindings:=bindings||jsonb_build_array(b);
 end loop;
 v:=e.configuration_version+1;
 next_cfg:=jsonb_set(jsonb_set(jsonb_set(cfg,'{markets}',markets),'{lifecycle,binding,markets}',bindings),'{lifecycle,binding,graphVersion}',to_jsonb(v));
 insert into event_template_configs(template_id,version,sealed,manifest) values(l.template_id,v,true,next_cfg);
 insert into event_pairing_reviews(league_id,from_version,to_version,window_key,reason,pairings,basis_token,status)
 values(p_league,e.configuration_version,v,p_window,btrim(p_reason),p_pairings,p_basis,'adopted');
 update event_league_evaluations set configuration_version=v where league_id=p_league;
 update event_league_windows set version=version+1,pairings_reviewed=case when window_key=p_window then true else pairings_reviewed end where league_id=p_league;
 return jsonb_build_object('configurationVersion',v,'status','adopted');
end $$;

-- event_operator_command: 20261027000011_notification_operator_authority_repair.sql; 2 deliberate business raise(s).
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
 if p_action<>'health.read' and version_now<>p_expected_version then raise exception 'operator version conflict' using errcode='PT409'; end if;
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
  if row_result.outcome='conflict' then raise exception 'mapping conflict' using errcode='PT409'; end if;
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

commit;
