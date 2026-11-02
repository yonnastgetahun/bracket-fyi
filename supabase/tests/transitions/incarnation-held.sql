-- The pre-upgrade deleted key cannot be reconstructed. Hold first; configuration
-- is still supported during freeze, but valid-token participant writes must fail.
begin;
set local role service_role;
select configure_event_window(md5('transition-incarnation-lost')::uuid,'w',0,'open',now()+interval '12 hours',true,array['m']);
do $$
begin
 if not (select frozen from event_league_evaluations where league_id=md5('transition-incarnation-lost')::uuid) then
  raise exception 'uncertain league not held';
 end if;
 begin
  perform submit_event_window(md5('transition-incarnation-lost')::uuid,md5('transition-incarnation-token-lost')::uuid,
   'w',(select version from event_league_windows where league_id=md5('transition-incarnation-lost')::uuid),'{"m":"a"}');
  raise exception 'uncertain history allowed participant submission';
 exception when others then
   if SQLSTATE <> coalesce(nullif(current_setting('bracket.test_business_sqlstate',true),''),'PT409') then raise; end if;
 end;
end $$;
commit;

-- Counterfactual control only: unfreeze in a transaction, accept the same valid
-- submission, then roll everything back. Final retained league remains frozen.
begin;
update event_league_evaluations set frozen=false where league_id=md5('transition-incarnation-lost')::uuid;
set local role service_role;
select submit_event_window(md5('transition-incarnation-lost')::uuid,md5('transition-incarnation-token-lost')::uuid,
 'w',(select version from event_league_windows where league_id=md5('transition-incarnation-lost')::uuid),'{"m":"a"}');
do $$
begin
 if (select count(*) from picks where league_id=md5('transition-incarnation-lost')::uuid) <> 1 then
  raise exception 'positive submission control failed';
 end if;
end $$;
rollback;
