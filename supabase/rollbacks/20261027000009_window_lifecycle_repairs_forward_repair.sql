-- Self-contained forward repair for 00009: reassert fixed RPCs and hold current
-- leagues. Retains picks, cutoff history, revisions, audit and one coronation.
-- Idempotent; never restores permanent-basis uniqueness or old scan behavior.
-- Resume requires reviewed owner maintenance and reconciliation.
begin;
-- Enrollment consumes durable deadlines, not the broader membership/pick seal.
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
 then raise exception 'entry closed' using errcode='40001'; end if;
 if p_display_name is null or length(btrim(p_display_name)) not between 1 and 80 then raise exception 'invalid display name' using errcode='22023'; end if;
 return query insert into participants(league_id,display_name) values(p_league_id,btrim(p_display_name)) returning participants.id,participants.magic_token;
end $$;

-- The same basis may recur after a hold expires with no generation increment.
-- League/evaluation row locks plus the existing current-basis replay guard dedup
-- an acknowledgment occurrence. Historical basis uniqueness is not replay safety.
drop index if exists public.event_lifecycle_one_evaluation;
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
 values(p_league_id,next_generation,'evaluated',p_basis_token,jsonb_build_object('from',e.lifecycle_state,'to',state));
 if first_crown then insert into event_lifecycle_audit(league_id,generation,kind,basis_token)
 values(p_league_id,next_generation,'coronation',p_basis_token) on conflict do nothing; end if;
 return jsonb_build_object('state',state,'replayed',false,'coronation',first_crown);
end $$;


-- Extra nullable error_code extends the service scan DTO. Recreate atomically,
-- explicitly restoring only the existing worker ACL (never browser EXECUTE).
drop function if exists public.scan_event_lifecycle_work(uuid,integer);
create function public.scan_event_lifecycle_work(p_after uuid default null,p_limit integer default 100)
returns table(league_id uuid,generation bigint,error_code text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare e record; snap jsonb;
begin
 if p_limit is null or p_limit not between 1 and 500 then raise exception 'invalid batch size' using errcode='22023'; end if;
 for e in select * from event_league_evaluations x
 where (p_after is null or x.league_id>p_after) and not x.lifecycle_disabled order by x.league_id limit p_limit loop
  league_id:=e.league_id;
  generation:=e.generation;
  error_code:=null;
  begin
   snap:=event_lifecycle_basis(e.league_id);
   generation:=case when e.generation<>e.evaluated_generation or e.basis_token is distinct from snap->>'basisToken' then e.generation else null end;
  exception when others then
   -- Basis/data failures are local to this ID. No acknowledgment or raw diagnostic
   -- escapes; query cancellation and assertion failures still abort normally.
   error_code:='invalid-basis';
  end;
  -- Every visited ID advances the cursor, including failed and clean leagues.
  return next;
 end loop;
end $$;
revoke all on function public.join_event_league(uuid,uuid,text),
 public.commit_event_lifecycle(uuid,bigint,text,jsonb),
 public.scan_event_lifecycle_work(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.join_event_league(uuid,uuid,text),
 public.commit_event_lifecycle(uuid,bigint,text,jsonb),
 public.scan_event_lifecycle_work(uuid,integer) to service_role;
update public.event_league_evaluations
set lifecycle_disabled=true,frozen=true,generation=generation+1
where not lifecycle_disabled;
commit;
