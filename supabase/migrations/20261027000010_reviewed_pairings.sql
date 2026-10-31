-- Additive, synthetic-only reviewed pairings. Old sealed manifests and picks remain byte-identical.
begin;
create table public.event_pairing_reviews (
 league_id uuid not null references leagues(id), from_version integer not null,
 to_version integer not null, window_key text not null, reason text not null,
 pairings jsonb not null, basis_token text not null, status text not null check(status in ('adopted','held')),
 created_at timestamptz not null default clock_timestamp(),
 primary key(league_id,to_version), check(to_version=from_version+1)
);
alter table public.event_pairing_reviews enable row level security;
revoke all on public.event_pairing_reviews from public,anon,authenticated,service_role;
grant select on public.event_pairing_reviews to service_role;
create trigger event_pairing_reviews_immutable before update or delete on public.event_pairing_reviews
for each row execute function reject_immutable_evidence_change();

-- Rejected corrections retain their exact proposal without consuming a configuration version.
create table public.event_pairing_corrections (
 id uuid primary key default gen_random_uuid(), league_id uuid not null references leagues(id),
 configuration_version integer not null, window_key text not null, pairings jsonb not null,
 basis_token text not null, reason text not null, actor_fingerprint text not null,
 created_at timestamptz not null default clock_timestamp()
);
alter table public.event_pairing_corrections enable row level security;
revoke all on public.event_pairing_corrections from public,anon,authenticated,service_role;
grant select on public.event_pairing_corrections to service_role;
create trigger event_pairing_corrections_immutable before update or delete on public.event_pairing_corrections
for each row execute function reject_immutable_evidence_change();

create function public.event_pairing_basis_compatible(lid uuid, original integer, current_version integer)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select original is not null and original<=current_version and
 (original=current_version or (select count(*) from event_pairing_reviews r
 where r.league_id=lid and r.status='adopted' and r.from_version>=original and r.to_version<=current_version)=current_version-original)
$$;
revoke all on function public.event_pairing_basis_compatible(uuid,integer,integer) from public,anon,authenticated,service_role;
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
create or replace function public.event_lifecycle_basis(p_league_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare cfg jsonb; e event_league_evaluations%rowtype; l leagues%rowtype;
 b jsonb; ws jsonb; ps jsonb; hs jsonb; qs jsonb; effective jsonb; t timestamptz:=clock_timestamp();
begin
 select * into l from leagues where id=p_league_id;
 select * into e from event_league_evaluations where league_id=p_league_id;
 select manifest into cfg from event_template_configs where template_id=l.template_id and version=e.configuration_version and sealed;
 if cfg is null then raise exception 'configuration unavailable' using errcode='40001'; end if;
 if exists(select 1 from picks where league_id=p_league_id and not event_pairing_basis_compatible(p_league_id,event_configuration_version,e.configuration_version)) then
  raise exception 'pick configuration basis changed' using errcode='40001'; end if;
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


create function public.review_event_pairings(p_league uuid,p_organizer uuid,p_window text,p_window_version integer,
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
 or event_lifecycle_basis(p_league)->>'basisToken' is distinct from p_basis then raise exception 'stale review' using errcode='40001'; end if;
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
 raise exception 'unresolved prerequisite' using errcode='40001'; end if;
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
    raise exception 'pairing conflicts with existing target result' using errcode='40001';
   end if;
   -- A changed semifinal loser cannot silently reinterpret an already-reviewed bronze pairing.
   if exists(select 1 from jsonb_array_elements(cfg->'lifecycle'->'binding'->'markets') downstream,
    jsonb_array_elements(downstream->'inputs') with ordinality ds(source,ordinal)
    where ds.source->>'kind'='loser' and ds.source->>'marketId'=m->>'id'
     and jsonb_typeof(downstream->'orientation')='array'
     and (not (pair ? (downstream->'orientation'->>(ds.ordinal::integer-1)))
      or downstream->'orientation'->>(ds.ordinal::integer-1)=effective->(m->>'id')->'outcome'->>'entrant')) then
    raise exception 'pairing conflicts with reviewed downstream source' using errcode='40001';
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
revoke all on function public.review_event_pairings(uuid,uuid,text,integer,integer,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.review_event_pairings(uuid,uuid,text,integer,integer,text,jsonb,text) to service_role;
commit;
