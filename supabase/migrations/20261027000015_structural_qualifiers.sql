-- Synthetic-only reviewed actual qualification. No entries, picks or scores cross leagues.
begin;
create table public.event_structural_qualifier_reviews (
 league_id uuid not null references leagues(id),
 idempotency_key text not null check(length(idempotency_key) between 1 and 200),
 request jsonb not null, result jsonb not null, qualifiers jsonb not null,
 source_league_id uuid references leagues(id), source_basis_token text not null,
 reason text not null, actor_fingerprint text not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(league_id,idempotency_key)
);
alter table public.event_structural_qualifier_reviews enable row level security;
revoke all on public.event_structural_qualifier_reviews from public,anon,authenticated,service_role;
grant select on public.event_structural_qualifier_reviews to service_role;
create trigger event_structural_qualifier_reviews_immutable before update or delete on public.event_structural_qualifier_reviews
for each row execute function reject_immutable_evidence_change();

create function public.review_event_structural_qualifiers(
 p_league uuid,p_organizer uuid,p_configuration_version integer,p_basis text,
 p_idempotency_key text,p_reason text,p_source_league uuid default null,
 p_source_organizer uuid default null,p_source_basis text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 l leagues%rowtype; src leagues%rowtype; e event_league_evaluations%rowtype;
 cfg jsonb; source_cfg jsonb; effective jsonb; target_effective jsonb;
 req jsonb; prior event_structural_qualifier_reviews%rowtype; result jsonb;
 qualifiers jsonb:='{}'; pairings jsonb:='{}'; markets jsonb:='[]'; bindings jsonb:='[]';
 m jsonb; b jsonb; s jsonb; r jsonb; pair jsonb; mid text; winner text; seven text; nine text;
 conference text; seed integer; source_basis text; scored_window text; version_next integer;
 changed boolean:=false; locked boolean; target_conflict boolean:=false; next_cfg jsonb;
begin
 -- Lock both league identities in a stable order, including source result mutation lock.
 perform 1 from leagues where id=p_league or id=p_source_league order by id for update;
 select * into l from leagues where id=p_league;
 if not found or l.organizer_token is distinct from p_organizer then raise exception 'invalid credential' using errcode='42501'; end if;
 if p_source_league is not null then
  select * into src from leagues where id=p_source_league;
  if not found or src.organizer_token is distinct from p_source_organizer then raise exception 'invalid source credential' using errcode='42501'; end if;
 end if;
 if p_reason is null or length(btrim(p_reason)) not between 1 and 500 or
 p_idempotency_key is null or length(p_idempotency_key) not between 1 and 200 then
  raise exception 'invalid review' using errcode='22023';
 end if;
 req:=jsonb_build_object('configurationVersion',p_configuration_version,'basis',p_basis,
  'sourceLeague',p_source_league,'sourceBasis',p_source_basis,'reason',btrim(p_reason));
 select * into prior from event_structural_qualifier_reviews where league_id=p_league and idempotency_key=p_idempotency_key;
 if found then
  if prior.request is distinct from req then raise exception 'idempotency conflict' using errcode='PT409'; end if;
  return prior.result;
 end if;
 select * into strict e from event_league_evaluations where league_id=p_league for update;
 if e.configuration_version is distinct from p_configuration_version or event_lifecycle_basis(p_league)->>'basisToken' is distinct from p_basis
 then raise exception 'stale review' using errcode='PT409'; end if;
 select manifest into cfg from event_template_configs where template_id=l.template_id and version=e.configuration_version and sealed;
 if cfg->'application'->>'label' is distinct from 'Synthetic local rehearsal — not official fixtures'
 or (cfg->>'editionKey' in ('ncaa-men-2027','nba-2027')) is distinct from true or cfg->>'lockMode' is distinct from 'whole-bracket' then
  raise exception 'unsupported structural review' using errcode='22023';
 end if;
 select value->>'windowId' into scored_window from jsonb_array_elements(cfg->'markets') where (value->>'scored')::boolean limit 1;
 if scored_window is null or exists(select 1 from jsonb_array_elements(cfg->'markets') where (value->>'scored')::boolean and value->>'windowId'<>scored_window) then
  raise exception 'invalid scored membership' using errcode='22023';
 end if;
 target_effective:=event_lifecycle_effective(p_league,clock_timestamp());
 if cfg->>'editionKey'='ncaa-men-2027' then
  if p_source_league is not null or p_source_organizer is not null or p_source_basis is not null then
   raise exception 'unexpected external source' using errcode='22023'; end if;
  effective:=target_effective; source_basis:=p_basis;
  if (select count(*) from jsonb_array_elements(cfg->'markets') where value->>'stage'='opening-round' and value->>'scored'='false')<>12 then
   raise exception 'invalid Opening Round structure' using errcode='22023'; end if;
  for m in select value from jsonb_array_elements(cfg->'markets') where value->>'stage'='opening-round' and value->>'scored'='false' loop
   mid:=m->>'id'; r:=effective->mid; winner:=r->'outcome'->>'entrant';
   if r->'outcome'->>'kind' is distinct from 'winner' or coalesce((r->>'held')::boolean,false) or coalesce((r->>'excluded')::boolean,false)
    or not exists(select 1 from jsonb_array_elements(m->'inputs') x where x->>'kind'='entrant' and x->>'entrantId'=winner) then
    raise exception 'unresolved or incompatible qualifier' using errcode='PT409'; end if;
   qualifiers:=qualifiers||jsonb_build_object(mid,winner);
  end loop;
 else
  if p_source_league is null or p_source_league=p_league then raise exception 'Play-In source required' using errcode='22023'; end if;
  if cfg->'application'->>'qualifierSourceLeague' is not null and cfg->'application'->>'qualifierSourceLeague'<>p_source_league::text then
   raise exception 'source identity changed' using errcode='PT409'; end if;
  -- A null source token means capture it under both league locks on first use.
  -- The request retains null for exact lost-response replay; audit retains the actual token.
  source_basis:=coalesce(p_source_basis,event_lifecycle_basis(p_source_league)->>'basisToken');
  if event_lifecycle_basis(p_source_league)->>'basisToken' is distinct from source_basis then raise exception 'stale source' using errcode='PT409'; end if;
  select c.manifest into source_cfg from event_template_configs c join event_league_evaluations ev
   on ev.configuration_version=c.version and ev.league_id=p_source_league where c.template_id=src.template_id and c.sealed;
  if source_cfg->>'editionKey' is distinct from 'nba-play-in-2027' or
   source_cfg->'application'->>'label' is distinct from 'Synthetic local rehearsal — not official fixtures' or
   jsonb_array_length(source_cfg->'markets')<>6 then raise exception 'invalid Play-In source' using errcode='22023'; end if;
  effective:=event_lifecycle_effective(p_source_league,clock_timestamp());
  foreach conference in array array['east','west'] loop
   -- Validate both first-round results and the actual decider path, not participant predictions.
   seven:=null; nine:=null;
   for m in select value from jsonb_array_elements(source_cfg->'markets')
    where value->>'id' in ('synthetic-nba-play-in-2027:market:'||conference||'.seven-eight','synthetic-nba-play-in-2027:market:'||conference||'.nine-ten') loop
    r:=effective->(m->>'id'); winner:=r->'outcome'->>'entrant';
    if r->'outcome'->>'kind' is distinct from 'winner' or coalesce((r->>'held')::boolean,false) or coalesce((r->>'excluded')::boolean,false)
     or not exists(select 1 from jsonb_array_elements(m->'inputs') x where x->>'kind'='entrant' and x->>'entrantId'=winner) then
     raise exception 'unresolved Play-In result' using errcode='PT409'; end if;
    if m->>'id' like '%.seven-eight' then seven:=winner; else nine:=winner; end if;
   end loop;
   mid:='synthetic-nba-play-in-2027:market:'||conference||'.eighth-seed-decider';
   r:=effective->mid; winner:=r->'outcome'->>'entrant';
   if seven is null or nine is null or r->'outcome'->>'kind' is distinct from 'winner' or
    coalesce((r->>'held')::boolean,false) or coalesce((r->>'excluded')::boolean,false) or winner=seven or
    (winner<>nine and winner not in ('synthetic-nba-play-in-2027:entrant:'||conference||'.seed-7','synthetic-nba-play-in-2027:entrant:'||conference||'.seed-8')) then
    raise exception 'incompatible actual decider' using errcode='PT409'; end if;
   qualifiers:=qualifiers||jsonb_build_object(conference||':7',seven,conference||':8',winner);
  end loop;
 end if;
 -- Retain input graph and full eligible pools so previously saved predictions stay immutable.
 -- Only initial-round actual orientations change; no new scored markets or dependencies.
 for m in select value from jsonb_array_elements(cfg->'markets') loop
  select value into b from jsonb_array_elements(cfg->'lifecycle'->'binding'->'markets') where value->>'marketId'=m->>'id';
  if b is null or b->'inputs' is distinct from m->'inputs' then raise exception 'invalid graph binding' using errcode='22023'; end if;
  if m->>'stage'=(case when cfg->>'editionKey'='ncaa-men-2027' then 'round-of-64' else 'first-round' end) then
   pair:='[]';
   for s in select value from jsonb_array_elements(m->'inputs') loop
    if s->>'kind'='entrant' then winner:=s->>'entrantId';
    elsif cfg->>'editionKey'='ncaa-men-2027' and s->>'kind'='winner' then winner:=qualifiers->>(s->>'marketId');
    elsif cfg->>'editionKey'='nba-2027' and s->>'kind'='reviewed-placement' and s->'marketIds'='[]'::jsonb then winner:=qualifiers->>(s->>'placement');
    else raise exception 'unsupported qualification source' using errcode='22023'; end if;
    if winner is null or not (b->'eligibleEntrantIds' ? winner) then raise exception 'invalid qualifier membership' using errcode='22023'; end if;
    pair:=pair||jsonb_build_array(winner);
   end loop;
   if jsonb_array_length(pair)<>2 or pair->>0=pair->>1 then raise exception 'invalid qualifier pairing' using errcode='22023'; end if;
   changed:=changed or b->'orientation' is distinct from pair;
   if target_effective->(m->>'id')->'outcome'->>'kind'='winner' and not (pair ? (target_effective->(m->>'id')->'outcome'->>'entrant')) then target_conflict:=true; end if;
   b:=jsonb_set(b,'{orientation}',pair);
   pairings:=pairings||jsonb_build_object(m->>'id',pair);
  end if;
  markets:=markets||jsonb_build_array(m); bindings:=bindings||jsonb_build_array(b);
 end loop;
 if (select count(*) from jsonb_object_keys(pairings))<>(case when cfg->>'editionKey'='ncaa-men-2027' then 32 else 8 end) then
  raise exception 'incomplete scored structure' using errcode='22023'; end if;
 locked:=l.locked_at is not null or exists(select 1 from event_league_windows where league_id=p_league and window_key=scored_window
  and (state='locked' or cutoff<=clock_timestamp())) or exists(select 1 from event_window_incarnation_history
  where league_id=p_league and window_key=scored_window and earliest_cutoff<=clock_timestamp());
 if not changed then
  result:=jsonb_build_object('status','unchanged','configurationVersion',e.configuration_version);
 elsif locked or target_conflict then
  for m in select value from jsonb_array_elements(cfg->'markets') where value->>'scored'='true' loop
   perform mutate_event_lifecycle(p_league,p_organizer,m->>'id','hold','{"held":true}'::jsonb,
    'Structural qualifier correction: '||left(btrim(p_reason),450),target_effective->(m->>'id')->>'effectiveToken',null,
    'qualifier-hold:'||event_lifecycle_hash(to_jsonb(p_idempotency_key))||':'||event_lifecycle_hash(m->'id'));
  end loop;
  -- Incompatible locked structure cannot be rescored against a changed source.
  -- Expose held (with no stale leaderboard) until reviewed disposition.
  update event_league_evaluations set frozen=true,lifecycle_disabled=true,generation=generation+1 where league_id=p_league;
  result:=jsonb_build_object('status','held','configurationVersion',e.configuration_version);
 else
  version_next:=e.configuration_version+1;
  next_cfg:=jsonb_set(jsonb_set(cfg,'{lifecycle,binding,markets}',bindings),'{lifecycle,binding,graphVersion}',to_jsonb(version_next));
  -- Feasibility certificates are version-bound; never recycle old attestation.
  next_cfg:=jsonb_set(next_cfg,'{lifecycle,components}','[]');
  next_cfg:=jsonb_set(next_cfg,'{application,qualifierSnapshot}',qualifiers);
  if p_source_league is not null then next_cfg:=jsonb_set(next_cfg,'{application,qualifierSourceLeague}',to_jsonb(p_source_league::text)); end if;
  insert into event_template_configs(template_id,version,sealed,manifest) values(l.template_id,version_next,true,next_cfg);
  insert into event_pairing_reviews(league_id,from_version,to_version,window_key,reason,pairings,basis_token,status)
   values(p_league,e.configuration_version,version_next,scored_window,btrim(p_reason),pairings,p_basis,'adopted');
  update event_league_evaluations set configuration_version=version_next where league_id=p_league;
  update event_league_windows set version=version+1,pairings_reviewed=case when window_key=scored_window then true else pairings_reviewed end where league_id=p_league;
  result:=jsonb_build_object('status','adopted','configurationVersion',version_next);
 end if;
 insert into event_structural_qualifier_reviews(league_id,idempotency_key,request,result,qualifiers,source_league_id,source_basis_token,reason,actor_fingerprint)
  values(p_league,p_idempotency_key,req,result,qualifiers,p_source_league,source_basis,btrim(p_reason),event_lifecycle_hash(to_jsonb(p_organizer)));
 return result;
end $$;
revoke all on function public.review_event_structural_qualifiers(uuid,uuid,integer,text,text,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.review_event_structural_qualifiers(uuid,uuid,integer,text,text,text,uuid,uuid,text) to service_role;
commit;
