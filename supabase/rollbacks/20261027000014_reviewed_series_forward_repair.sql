-- Non-destructive safety repair. Retain every child/result/review/pick/audit row.
-- Disable only consumers linked to reviewed series, once; deployment remains separate.
begin;
update event_league_evaluations e set lifecycle_disabled=true,frozen=true,generation=e.generation+1
from leagues l,event_template_configs c
where l.id=e.league_id and c.template_id=l.template_id and c.version=e.configuration_version
and not e.lifecycle_disabled and exists(select 1 from jsonb_array_elements(c.manifest->'markets') m
 join event_series_reviews r on r.parent_id::text=m->>'contestId');
revoke all on public.event_series_reviews from public,anon,authenticated,service_role;
grant select on public.event_series_reviews to service_role;
revoke all on function public.capture_event_series(uuid),public.event_series_outcome(jsonb),public.commit_event_series(uuid,text,jsonb),
 public.review_event_series(text,uuid,integer,jsonb,text),public.serialize_event_series_child(),public.derive_event_series_child(),public.scan_event_series(uuid,integer)
 from public,anon,authenticated,service_role;
grant execute on function public.capture_event_series(uuid),public.commit_event_series(uuid,text,jsonb),public.review_event_series(text,uuid,integer,jsonb,text),public.scan_event_series(uuid,integer) to service_role;
commit;
