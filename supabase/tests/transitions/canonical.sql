-- Add canonical associations without replacing legacy records.
begin;
insert into organizations(id,organization_key,name,kind)
values(md5('transition-org')::uuid,'transition-org','Synthetic transition org','governing_body') on conflict do nothing;
insert into competitions(id,organization_id,competition_key,name,domain)
values(md5('transition-competition')::uuid,md5('transition-org')::uuid,'transition-cup','Synthetic transition cup','sport') on conflict do nothing;
insert into event_editions(id,competition_id,edition_key,name,season_label)
values(md5('transition-edition')::uuid,md5('transition-competition')::uuid,'synthetic','Synthetic edition','synthetic') on conflict do nothing;
insert into stages(id,event_edition_id,stage_key,name,kind,ordinal)
values(md5('transition-stage')::uuid,md5('transition-edition')::uuid,'final','Final','knockout',1) on conflict do nothing;
insert into competitors(id,competitor_key,kind,canonical_name)
select md5('transition-competitor-'||c)::uuid,'transition-'||lower(c),'team','Synthetic '||c from unnest(array['A','B']) c on conflict do nothing;
insert into event_entries(id,event_edition_id,competitor_id,role)
select md5('transition-entry-'||c)::uuid,md5('transition-edition')::uuid,md5('transition-competitor-'||c)::uuid,'team' from unnest(array['A','B']) c on conflict do nothing;
insert into contests(id,event_edition_id,stage_id,contest_key,name,kind)
select md5('transition-contest-'||type)::uuid,md5('transition-edition')::uuid,md5('transition-stage')::uuid,
'transition-'||type,'Synthetic '||type,'match' from templates on conflict do nothing;
insert into contest_entries(event_edition_id,contest_id,event_entry_id,role,ordinal,metadata)
select md5('transition-edition')::uuid,c.id,md5('transition-entry-'||choice)::uuid,'competitor',
case when choice='A' then 1 else 2 end,jsonb_build_object('legacy_team_id',choice)
from contests c cross join unnest(array['A','B']) choice on conflict do nothing;
update templates set event_edition_id=md5('transition-edition')::uuid where event_edition_id is null;
update template_matches m set contest_id=md5('transition-contest-'||t.type)::uuid from templates t
where m.template_id=t.id and m.contest_id is null;
insert into result_audit_events(id,event_edition_id,event_type,actor_type,actor_reference,idempotency_key)
values(md5('transition-audit')::uuid,md5('transition-edition')::uuid,'transition.fixture','system','synthetic-harness','transition-audit') on conflict do nothing;
insert into notification_outbox(id,event_edition_id,audit_event_id,intent_type,audience_kind,payload,idempotency_key)
values(md5('transition-outbox')::uuid,md5('transition-edition')::uuid,md5('transition-audit')::uuid,
'provider_stale','operator','{"synthetic":true}','transition-outbox') on conflict do nothing;
insert into league_result_overrides(id,league_id,template_match_id,winner_team_id,overridden_at,status,released_at,released_by_fingerprint,release_reason)
select md5('transition-released-'||l.id)::uuid,l.id,m.id,'B','2026-01-02','released','2026-01-04',repeat('a',64),'Synthetic released override'
from leagues l join template_matches m on m.template_id=l.template_id where l.name like '%complete'
on conflict do nothing;
commit;
