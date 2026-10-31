-- Reviewed, versioned shared series. No provider names or inferred replacements.
begin;
create table public.event_series_reviews (
 parent_id uuid not null references contests(id), version integer not null check(version>0),
 best_of integer not null check(best_of in (3,5,7)), entrants uuid[] not null check(cardinality(entrants)=2),
 children jsonb not null check(jsonb_typeof(children)='array'), held boolean not null,
 principal_id uuid not null references event_operator_principals(id), reason text not null,
 created_at timestamptz not null default clock_timestamp(), primary key(parent_id,version)
);
alter table public.event_series_reviews enable row level security;
revoke all on public.event_series_reviews from public,anon,authenticated,service_role;
grant select on public.event_series_reviews to service_role;
create trigger event_series_reviews_immutable before update or delete on public.event_series_reviews
 for each row execute function reject_immutable_evidence_change();

create function public.capture_event_series(p_parent uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p contests%rowtype; review event_series_reviews%rowtype; b jsonb; entrants jsonb; children jsonb; authority contest_results%rowtype; derived jsonb;
begin
 select * into p from contests where id=p_parent;
 select * into review from event_series_reviews where parent_id=p_parent order by version desc limit 1;
 if review.parent_id is null then raise exception 'unreviewed series' using errcode='22023'; end if;
 entrants:=to_jsonb(review.entrants);
 select jsonb_agg(jsonb_build_object('id',child->>'id','resultId',r.id,'version',coalesce(r.version,0),
  'winner',case when r.outcome_type='winner' then r.winner_event_entry_id else null end) order by ordinal)
 into children from jsonb_array_elements(review.children) with ordinality cs(child,ordinal)
 left join lateral (select * from contest_results where contest_id=(child->>'id')::uuid order by version desc limit 1) r on true;
 b:=jsonb_build_object('parentId',p_parent,'membershipVersion',review.version,'bestOf',review.best_of,'entrants',entrants,
  'held',review.held or exists(select 1 from jsonb_array_elements(children) c where c->>'winner' is not null and not (entrants ? (c->>'winner'))),
  'children',children);
 select * into authority from contest_results where contest_id=p_parent
 and (source_type<>'system' or result_data->>'algorithm' is distinct from 'series-wins-v1') order by version desc limit 1;
 derived:=event_series_outcome(b);
 b:=b||jsonb_build_object('authoritativeResultId',authority.id,
 'held',(b->>'held')::boolean or (authority.outcome_type='winner' and derived->>'kind'='winner'
 and authority.winner_event_entry_id::text<>derived->>'entrant') is true);
 return b||jsonb_build_object('basisToken',event_lifecycle_hash(b));
end $$;

-- Internal oracle validates worker proposals; also runs synchronously on child commits.
create function public.event_series_outcome(b jsonb) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare winner text;
begin
 if (b->>'held')::boolean then return '{"kind":"unresolved"}'; end if;
 select entrant into winner from jsonb_array_elements_text(b->'entrants') entrant
 where (select count(*) from jsonb_array_elements(b->'children') c where c->>'winner'=entrant)>=(b->>'bestOf')::integer/2+1;
 return case when winner is null then '{"kind":"unresolved"}'::jsonb else jsonb_build_object('kind','winner','entrant',winner) end;
end $$;

create function public.commit_event_series(p_parent uuid,p_basis text,p_outcome jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare b jsonb; prior contest_results%rowtype; inserted contest_results%rowtype; edition uuid; data jsonb;
begin
 perform 1 from event_runtime_control where singleton and not global_stopped for share;
 if not found then raise exception 'runtime stopped' using errcode='PT409'; end if;
 select event_edition_id into edition from contests where id=p_parent for update;
 b:=capture_event_series(p_parent);
 if b->>'basisToken' is distinct from p_basis then raise exception 'series basis changed' using errcode='PT409'; end if;
 if p_outcome is distinct from event_series_outcome(b) then raise exception 'invalid derived outcome' using errcode='22023'; end if;
 select * into prior from contest_results where contest_id=p_parent order by version desc limit 1;
 if prior.result_data->>'seriesBasis' = p_basis then return jsonb_build_object('replayed',true,'resultId',prior.id,'version',prior.version); end if;
 data:=jsonb_build_object('algorithm','series-wins-v1','algorithmVersion',1,'membershipVersion',b->'membershipVersion',
  'authoritativeResultId',b->'authoritativeResultId','children',(select coalesce(jsonb_agg(c),'[]') from jsonb_array_elements(b->'children') c where (c->>'version')::integer>0),'seriesBasis',p_basis,'held',b->'held');
 insert into contest_results(contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,source_type,
  result_data,supersedes_result_id,correction_reason,idempotency_key)
 values(p_parent,edition,coalesce(prior.version,0)+1,case when p_outcome->>'kind'='winner' then 'final' else 'unresolved' end,
 case when p_outcome->>'kind'='winner' then 'winner' else 'pending' end,(p_outcome->>'entrant')::uuid,'system',data,prior.id,
 'Reviewed series child/membership recomputation','series:'||p_parent||':'||p_basis) returning * into inserted;
 insert into result_audit_events(event_edition_id,contest_id,contest_result_id,event_type,actor_type,actor_reference,idempotency_key,details)
 values(edition,p_parent,inserted.id,'series.derived','system','series-wins-v1','series:audit:'||inserted.id,data);
 return jsonb_build_object('replayed',false,'resultId',inserted.id,'version',inserted.version);
end $$;

create function public.review_event_series(p_credential text,p_parent uuid,p_expected_version integer,p_children jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p contests%rowtype; prior event_series_reviews%rowtype; accepted event_series_reviews%rowtype; actor uuid; child jsonb; old_child jsonb; ordinal bigint;
 held boolean:=false; b jsonb; v integer;
begin
 select * into p from contests where id=p_parent;
 actor:=assert_event_operator(p_credential,'local',p.event_edition_id,'manifest.review');
 perform 1 from event_runtime_control where singleton and not global_stopped for share;
 if not found then raise exception 'runtime stopped' using errcode='PT409'; end if;
 perform 1 from contests where id=p_parent for update;
 select * into prior from event_series_reviews where parent_id=p_parent order by version desc limit 1;
 select r.* into accepted from event_series_reviews r where r.parent_id=p_parent and not r.held order by r.version desc limit 1;
 if p_expected_version is distinct from coalesce(prior.version,0) then raise exception 'stale membership review' using errcode='PT409'; end if;
 if p.kind is distinct from 'series' or p.best_of not in (3,5,7) or p.best_of is null
 or (select count(*) from contest_entries where contest_id=p_parent)<>2
 or length(btrim(coalesce(p_reason,''))) not between 1 and 500 or jsonb_typeof(p_children) is distinct from 'array'
 then raise exception 'invalid series review' using errcode='22023'; end if;
 if jsonb_array_length(p_children) not between 1 and p.best_of
 or (select count(*)<>count(distinct c->>'id') from jsonb_array_elements(p_children) c)
 then raise exception 'duplicate or excessive series games' using errcode='22023'; end if;
 for child,ordinal in select value,ordinality from jsonb_array_elements(p_children) with ordinality loop
  if jsonb_typeof(child) is distinct from 'object' or not child ? 'id' or (child-'id'-'replaces')<>'{}'
  or not exists(select 1 from contests c where c.id=(child->>'id')::uuid and c.parent_contest_id=p_parent
    and c.event_edition_id=p.event_edition_id and c.kind='game')
  or (select array_agg(event_entry_id order by event_entry_id) from contest_entries where contest_id=(child->>'id')::uuid)
   is distinct from (select array_agg(event_entry_id order by event_entry_id) from contest_entries where contest_id=p_parent) then raise exception 'invalid series child' using errcode='22023'; end if;
  old_child:=accepted.children->(ordinal::integer-1);
  if old_child is not null and old_child->>'id' is distinct from child->>'id' then
   -- A reviewed explicit old->new association is required, never a second win.
   if child->>'replaces' is distinct from old_child->>'id'
    or exists(select 1 from jsonb_array_elements(p_children) c where c->>'id'=old_child->>'id') then held:=true; end if;
  elsif child ? 'replaces' and (old_child is null or child->>'replaces' is distinct from old_child->>'replaces') then held:=true;
  end if;
 end loop;
 if accepted.parent_id is not null and jsonb_array_length(p_children)<jsonb_array_length(accepted.children) then held:=true; end if;
 -- A replacement equivalence class contributes at most one game, even when a
 -- retired ID is appended later or an association spans several revisions.
 if exists(with recursive associations(src_id,dst_id) as (
  select member->>'id',member->>'replaces' from event_series_reviews r,
   lateral jsonb_array_elements(r.children) member where r.parent_id=p_parent and not r.held and member ? 'replaces'
  union select member->>'id',member->>'replaces' from jsonb_array_elements(p_children) member where member ? 'replaces'
 ), edges(src_id,dst_id) as (select src_id,dst_id from associations union select dst_id,src_id from associations),
 reach(src_id,dst_id) as (select src_id,dst_id from edges union select r.src_id,e.dst_id from reach r join edges e on e.src_id=r.dst_id)
 select 1 from reach r where r.src_id<>r.dst_id
  and exists(select 1 from jsonb_array_elements(p_children) c where c->>'id'=r.src_id)
  and exists(select 1 from jsonb_array_elements(p_children) c where c->>'id'=r.dst_id)) then held:=true; end if;
 if prior.children=p_children and prior.held=held and prior.best_of=p.best_of
 and prior.entrants=(select array_agg(event_entry_id order by event_entry_id) from contest_entries where contest_id=p_parent) then return jsonb_build_object('version',prior.version,'status',case when held then 'held' else 'adopted' end,'replayed',true); end if;
 v:=coalesce(prior.version,0)+1;
 insert into event_series_reviews(parent_id,version,best_of,entrants,children,held,principal_id,reason) values(p_parent,v,p.best_of,
 (select array_agg(event_entry_id order by event_entry_id) from contest_entries where contest_id=p_parent),p_children,held,actor,btrim(p_reason));
 b:=capture_event_series(p_parent);
 perform commit_event_series(p_parent,b->>'basisToken',event_series_outcome(b));
 insert into event_operator_audit(principal_id,environment,event_edition_id,action,reason,expected_version,resource_id,result)
 values(actor,'local',p.event_edition_id,'manifest.review',btrim(p_reason),p_expected_version,p_parent::text,
 jsonb_build_object('membershipVersion',v,'held',held));
 return jsonb_build_object('version',v,'status',case when held then 'held' else 'adopted' end,'replayed',false);
end $$;

-- Serialize before accepting a child version. A correction and its dependent
-- parent/audit/fanout commit atomically; no worker crash can expose stale clinches.
create function public.serialize_event_series_child() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare parent uuid; stopped boolean;
begin
 select c.parent_contest_id into parent from contests c join contests p on p.id=c.parent_contest_id and p.kind='series' where c.id=new.contest_id;
 if parent is not null then
  -- Lock even before the first review is visible: a concurrently committing
  -- first membership must see this child, or this child must see that review.
  select global_stopped into stopped from event_runtime_control where singleton for share;
  perform 1 from contests where id=parent for update;
  if coalesce(stopped,true) and exists(select 1 from event_series_reviews where parent_id=parent) then
   raise exception 'runtime stopped' using errcode='PT409'; end if;
 end if;
 return new;
end $$;
create function public.derive_event_series_child() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare parent uuid; b jsonb;
begin
 if exists(select 1 from event_series_reviews where parent_id=new.contest_id)
 and (new.source_type<>'system' or new.result_data->>'algorithm' is distinct from 'series-wins-v1') then
  b:=capture_event_series(new.contest_id);
  perform commit_event_series(new.contest_id,b->>'basisToken',event_series_outcome(b));
 end if;
 select parent_contest_id into parent from contests where id=new.contest_id;
 if parent is not null and exists(select 1 from event_series_reviews where parent_id=parent) then
  b:=capture_event_series(parent);
  if exists(select 1 from jsonb_array_elements(b->'children') c where c->>'id'=new.contest_id::text) then
   perform commit_event_series(parent,b->>'basisToken',event_series_outcome(b));
  end if;
 end if;
 return new;
end $$;
create trigger aa_event_series_child_lock before insert on public.contest_results for each row execute function serialize_event_series_child();
create trigger event_series_child_derive after insert on public.contest_results for each row execute function derive_event_series_child();
create function public.scan_event_series(p_after uuid default null,p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if p_limit is null or p_limit not between 1 and 500 then raise exception 'invalid bound' using errcode='22023'; end if;
 return (select coalesce(jsonb_agg(parent_id order by parent_id),'[]') from
 (select distinct parent_id from event_series_reviews where p_after is null or parent_id>p_after order by parent_id limit p_limit) s);
end $$;
revoke all on function public.capture_event_series(uuid),public.event_series_outcome(jsonb),public.commit_event_series(uuid,text,jsonb),
 public.review_event_series(text,uuid,integer,jsonb,text),public.serialize_event_series_child(),public.derive_event_series_child(),public.scan_event_series(uuid,integer)
 from public,anon,authenticated,service_role;
grant execute on function public.capture_event_series(uuid),public.commit_event_series(uuid,text,jsonb),public.review_event_series(text,uuid,integer,jsonb,text),public.scan_event_series(uuid,integer) to service_role;
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
  effective:=jsonb_build_object('configurationVersion',config_version,'localRevision',coalesce(o.revision,0),'outcome',outcome,'held',(coalesce(o.held,false) or coalesce(not active and r.source_type='system' and r.result_data->>'algorithm'='series-wins-v1' and r.result_data->'held'='true'::jsonb,false)),'excluded',coalesce(o.excluded,false),
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
   'derivedProvenance',jsonb_build_object('algorithm',r.result_data->'algorithm','algorithmVersion',r.result_data->'algorithmVersion','membershipVersion',r.result_data->'membershipVersion','children',r.result_data->'children'),'held',(coalesce(o.held,false) or coalesce(not active and r.source_type='system' and r.result_data->>'algorithm'='series-wins-v1' and r.result_data->'held'='true'::jsonb,false)),'excluded',coalesce(o.excluded,false),
   'effectiveToken',event_lifecycle_hash(effective),'provenanceToken',event_lifecycle_hash(provenance)));
 end loop;
 return result;
end $$;


commit;
