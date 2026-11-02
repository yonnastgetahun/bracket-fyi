-- P5/P7: existing evaluation generation is the durable work queue.
-- Canonical fanout is synchronous, ordered and atomic; no cursor/lease can skip a league.
begin;
alter table public.event_league_evaluations
 add column lifecycle_state text not null default 'locked' check(lifecycle_state in ('active','locked','complete','held')),
 add column completed_at timestamptz,
 add column lifecycle_disabled boolean not null default false;

create table public.event_lifecycle_revisions (
 id uuid primary key default gen_random_uuid(),
 league_id uuid not null references event_league_evaluations(league_id),
 market_id text not null,
 revision integer not null check(revision>0),
 outcome jsonb,
 expires_at timestamptz,
 held boolean not null default false,
 excluded boolean not null default false,
 action text not null check(action in ('override','release','hold','disposition')),
 reason text not null check(length(btrim(reason)) between 1 and 500),
 actor_fingerprint text not null check(actor_fingerprint ~ '^[a-f0-9]{64}$'),
 idempotency_key text not null check(length(btrim(idempotency_key)) between 1 and 200),
 request jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(league_id,market_id,revision),
 unique(league_id,idempotency_key)
);
create table public.event_lifecycle_audit (
 id uuid primary key default gen_random_uuid(),
 league_id uuid not null references event_league_evaluations(league_id),
 generation bigint not null,
 kind text not null,
 basis_token text,
 revision_id uuid references event_lifecycle_revisions(id),
 canonical_result_id uuid references contest_results(id),
 details jsonb not null default '{}',
 created_at timestamptz not null default clock_timestamp()
);
create unique index event_lifecycle_one_coronation on event_lifecycle_audit(league_id) where kind='coronation';
create unique index event_lifecycle_one_evaluation on event_lifecycle_audit(league_id,basis_token) where kind='evaluated';
create trigger event_lifecycle_revisions_immutable before update or delete on public.event_lifecycle_revisions
 for each row execute function public.reject_immutable_evidence_change();
create trigger event_lifecycle_audit_immutable before update or delete on public.event_lifecycle_audit
 for each row execute function public.reject_immutable_evidence_change();
alter table public.event_lifecycle_revisions enable row level security;
alter table public.event_lifecycle_audit enable row level security;
revoke all on public.event_lifecycle_revisions,public.event_lifecycle_audit from public,anon,authenticated,service_role;
grant select on public.event_lifecycle_revisions,public.event_lifecycle_audit to service_role;
-- Worker state is writable only through compare-basis acknowledgement.
revoke update on public.event_league_evaluations from service_role;
revoke update(generation,evaluated_generation,frozen,basis_token,leaderboard,evaluated_at,coronation_recorded) on public.event_league_evaluations from service_role;

create function public.event_lifecycle_hash(p_value jsonb) returns text
language sql immutable set search_path=public,pg_temp as $$
 select encode(extensions.digest(p_value::text,'sha256'),'hex')
$$;

-- Lifecycle activation is opt-in through the sealed window manifest. The same
-- market IDs/domain and reviewed graph feed scoreEvent; JSON links never escape edition.
create function public.assert_event_lifecycle_configuration(p_league_id uuid) returns void
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare cfg jsonb; v integer; edition uuid; m jsonb; binding jsonb;
begin
 select c.manifest,e.configuration_version,t.event_edition_id into cfg,v,edition
 from leagues l join templates t on t.id=l.template_id join event_league_evaluations e on e.league_id=l.id
 join event_template_configs c on c.template_id=t.id and c.version=e.configuration_version and c.sealed where l.id=p_league_id;
 if cfg->'lifecycle'->'binding'->>'reviewed' is distinct from 'true'
 or cfg->'lifecycle'->'binding'->>'graphVersion' is distinct from v::text
 or jsonb_typeof(cfg->'lifecycle'->'binding'->'markets') is distinct from 'array' then
  raise exception 'unreviewed lifecycle configuration' using errcode='22023'; end if;
 if (select count(*)<>count(distinct value->>'marketId') from jsonb_array_elements(cfg->'lifecycle'->'binding'->'markets'))
 or (select array_agg(value->>'marketId' order by value->>'marketId') from jsonb_array_elements(cfg->'lifecycle'->'binding'->'markets'))
 is distinct from (select array_agg(value->>'id' order by value->>'id') from jsonb_array_elements(cfg->'markets')) then
  raise exception 'lifecycle binding membership mismatch' using errcode='22023'; end if;
 for m in select value from jsonb_array_elements(cfg->'markets') loop
  if jsonb_typeof(m->'scored') is distinct from 'boolean'
   or (m ? 'required' and jsonb_typeof(m->'required') is distinct from 'boolean')
   or m->>'outcomeDomain' is null or m->>'outcomeDomain' not in ('regulation-home-draw-away','winner-including-overtime','aggregate-qualifier','series-winner','nomination-winner-set') then
   raise exception 'invalid lifecycle market domain' using errcode='22023'; end if;
  select value into binding from jsonb_array_elements(cfg->'lifecycle'->'binding'->'markets') where value->>'marketId'=m->>'id';
  if jsonb_typeof(binding->'eligibleEntrantIds') is distinct from 'array'
   or jsonb_array_length(binding->'eligibleEntrantIds')=0
   or (select count(*)<>count(distinct value) from jsonb_array_elements(binding->'eligibleEntrantIds')) then
   raise exception 'invalid lifecycle eligible membership' using errcode='22023'; end if;
  if m->>'contestId' is not null and not exists(select 1 from contests where id=(m->>'contestId')::uuid and event_edition_id=edition) then
   raise exception 'canonical market outside template edition' using errcode='22023'; end if;
 end loop;
end $$;

-- Whole typed outcome; no merging score fields from an overridden canonical row.
create function public.event_lifecycle_effective(p_league_id uuid,p_now timestamptz)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare cfg jsonb; m jsonb; r contest_results%rowtype; o event_lifecycle_revisions%rowtype;
 result jsonb:='{}'; outcome jsonb; effective jsonb; provenance jsonb; active boolean; config_version integer;
begin
 select c.manifest into cfg from leagues l join event_league_evaluations e on e.league_id=l.id
 join event_template_configs c on c.template_id=l.template_id and c.version=e.configuration_version
 where l.id=p_league_id and c.sealed;
 if cfg is null then raise exception 'configuration unavailable' using errcode='40001'; end if;
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

-- Internal coherent basis; caller locks league first. Time sampled after lock.
create function public.event_lifecycle_basis(p_league_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare cfg jsonb; e event_league_evaluations%rowtype; l leagues%rowtype;
 b jsonb; ws jsonb; ps jsonb; hs jsonb; qs jsonb; effective jsonb; t timestamptz:=clock_timestamp();
begin
 select * into l from leagues where id=p_league_id;
 select * into e from event_league_evaluations where league_id=p_league_id;
 select manifest into cfg from event_template_configs where template_id=l.template_id and version=e.configuration_version and sealed;
 if cfg is null then raise exception 'configuration unavailable' using errcode='40001'; end if;
 if exists(select 1 from picks where league_id=p_league_id and event_configuration_version is distinct from e.configuration_version) then
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

create function public.capture_event_lifecycle(p_league_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from leagues where id=p_league_id for update;
 perform 1 from event_league_evaluations where league_id=p_league_id for update;
 if not found then raise exception 'unsupported event format' using errcode='22023'; end if;
 return event_lifecycle_basis(p_league_id);
end $$;

create function public.mutate_event_lifecycle(p_league_id uuid,p_organizer_token uuid,p_market_id text,
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
  if prior.request<>req then raise exception 'idempotency conflict' using errcode='40001'; end if;
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
  raise exception 'effective result changed' using errcode='40001';
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

-- Existing result insertion is serialized by its contest version trigger. Fanout
-- locks all affected leagues in UUID order, then their evaluation row.
create function public.fanout_event_lifecycle_result() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare lid uuid; g bigint;
begin
 if not exists(select 1 from leagues l join event_league_evaluations e on e.league_id=l.id
  join event_template_configs c on c.template_id=l.template_id and c.version=e.configuration_version
  where exists(select 1 from jsonb_array_elements(c.manifest->'markets') m where m->>'contestId'=new.contest_id::text)) then
  return new;
 end if;
 insert into result_audit_events(event_edition_id,contest_id,contest_result_id,event_type,actor_type,actor_reference,idempotency_key,details)
 values(new.event_edition_id,new.contest_id,new.id,'lifecycle.canonical_committed','system','event-lifecycle-fanout','lifecycle:canonical:'||new.id,
 jsonb_build_object('sourceType',new.source_type,'version',new.version));
 for lid in select l.id from leagues l join event_league_evaluations e on e.league_id=l.id
 join event_template_configs c on c.template_id=l.template_id and c.version=e.configuration_version
 where exists(select 1 from jsonb_array_elements(c.manifest->'markets') m where m->>'contestId'=new.contest_id::text) order by l.id loop
  perform 1 from leagues where id=lid for update;
  update event_league_evaluations set generation=generation+1 where league_id=lid returning generation into g;
  insert into event_lifecycle_audit(league_id,generation,kind,canonical_result_id) values(lid,g,'canonical',new.id);
 end loop;
 return new;
end $$;
create trigger event_lifecycle_canonical_fanout after insert on public.contest_results
 for each row execute function public.fanout_event_lifecycle_result();

create function public.commit_event_lifecycle(p_league_id uuid,p_generation bigint,p_basis_token text,p_leaderboard jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare snapshot jsonb; b jsonb; e event_league_evaluations%rowtype; m jsonb; result jsonb;
 complete boolean:=true; held boolean:=false; state text; first_crown boolean:=false; next_generation bigint;
begin
 perform 1 from leagues where id=p_league_id for update;
 select * into e from event_league_evaluations where league_id=p_league_id for update;
 if not found then raise exception 'unsupported event format' using errcode='22023'; end if;
 snapshot:=event_lifecycle_basis(p_league_id); b:=snapshot->'basis';
 if p_generation is null or p_generation<>e.generation or p_basis_token is null or p_basis_token<>snapshot->>'basisToken' then
  raise exception 'lifecycle basis changed' using errcode='40001'; end if;
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
 values(p_league_id,next_generation,'evaluated',p_basis_token,jsonb_build_object('from',e.lifecycle_state,'to',state))
 on conflict do nothing;
 if first_crown then insert into event_lifecycle_audit(league_id,generation,kind,basis_token)
 values(p_league_id,next_generation,'coronation',p_basis_token) on conflict do nothing; end if;
 return jsonb_build_object('state',state,'replayed',false,'coronation',first_crown);
end $$;

-- Safe reader deliberately omits raw manifests, private picks, credentials and audit reasons.
create function public.read_event_lifecycle(p_league_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare snap jsonb; e event_league_evaluations%rowtype; locked boolean; pending boolean;
begin
 perform 1 from leagues where id=p_league_id for update;
 select * into e from event_league_evaluations where league_id=p_league_id for update;
 if not found then raise exception 'unsupported event format' using errcode='22023'; end if;
 snap:=event_lifecycle_basis(p_league_id); locked:=(snap->'basis'->>'locked')::boolean;
 pending:=e.evaluated_generation<>e.generation or e.basis_token is distinct from snap->>'basisToken';
 return jsonb_build_object('state',case when e.lifecycle_disabled then 'held' when pending then 'reconciliation-pending' else e.lifecycle_state end,
  'generation',e.generation,'evaluatedGeneration',e.evaluated_generation,'basisToken',snap->>'basisToken',
  'leaderboard',case when locked and not pending and not e.lifecycle_disabled then e.leaderboard else '[]'::jsonb end,
  'effective',case when locked then snap->'basis'->'effective' else '{}'::jsonb end);
end $$;

-- Stable bounded UUID cursor. Caller repeats from null after finishing a sweep.
-- Includes expiry/hold changes without relying on an uptime timer or a lease.
create function public.scan_event_lifecycle_work(p_after uuid default null,p_limit integer default 100)
returns table(league_id uuid,generation bigint) language plpgsql security definer set search_path=public,pg_temp as $$
declare e record; snap jsonb;
begin
 if p_limit is null or p_limit not between 1 and 500 then raise exception 'invalid batch size' using errcode='22023'; end if;
 for e in select * from event_league_evaluations x where (p_after is null or x.league_id>p_after) and not x.lifecycle_disabled order by x.league_id limit p_limit loop
  snap:=event_lifecycle_basis(e.league_id);
  -- Return every visited ID, not just dirty IDs, so callers have a stable cursor.
  league_id:=e.league_id;
  generation:=case when e.generation<>e.evaluated_generation or e.basis_token is distinct from snap->>'basisToken' then e.generation else null end;
  return next;
 end loop;
end $$;

revoke all on function public.event_lifecycle_hash(jsonb),public.assert_event_lifecycle_configuration(uuid),public.event_lifecycle_effective(uuid,timestamptz),
 public.event_lifecycle_basis(uuid),public.capture_event_lifecycle(uuid),
 public.mutate_event_lifecycle(uuid,uuid,text,text,jsonb,text,text,text,text),
 public.fanout_event_lifecycle_result(),public.commit_event_lifecycle(uuid,bigint,text,jsonb),
 public.read_event_lifecycle(uuid),public.scan_event_lifecycle_work(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.capture_event_lifecycle(uuid),
 public.mutate_event_lifecycle(uuid,uuid,text,text,jsonb,text,text,text,text),
 public.commit_event_lifecycle(uuid,bigint,text,jsonb),public.read_event_lifecycle(uuid),
 public.scan_event_lifecycle_work(uuid,integer) to service_role;
commit;
