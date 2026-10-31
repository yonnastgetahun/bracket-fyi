-- Durable post-upgrade ABA history: v3 -> absent -> v4 -> v5 -> absent.
-- Leave the live key absent so preservation cannot pass using extant rows only.
begin;
set local role service_role;
select configure_event_window(md5('transition-incarnation-live')::uuid,'w',3,null,null,null,null,true);
select configure_event_window(md5('transition-incarnation-live')::uuid,'w',0,'open',
 (select earliest_cutoff from event_window_incarnation_history where league_id=md5('transition-incarnation-live')::uuid),true,array['m']);
select configure_event_window(md5('transition-incarnation-live')::uuid,'w',4,'open',
 (select earliest_cutoff-interval '1 hour' from event_window_incarnation_history where league_id=md5('transition-incarnation-live')::uuid),true,array['m']);
select configure_event_window(md5('transition-incarnation-live')::uuid,'w',5,null,null,null,null,true);
commit;
