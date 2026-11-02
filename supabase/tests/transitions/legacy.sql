-- Original synthetic fixture, safe to replay only in harness-owned disposable DB.
begin;
insert into templates(id,name,type,team_registry)
select md5('transition-template-'||kind)::uuid,'Transition '||kind,kind::template_type,
'[{"id":"A","name":"Synthetic A"},{"id":"B","name":"Synthetic B"}]'::jsonb
from unnest(array['bracket','pickem']) kind on conflict do nothing;
insert into template_matches(id,template_id,round,match_number,home_slot,away_slot)
select md5('transition-match-'||type)::uuid,id,1,1,'A','B' from templates on conflict do nothing;
insert into template_results(id,template_id,template_match_id,winner_team_id,entered_by,entered_at)
select md5('transition-result-'||type)::uuid,t.id,m.id,'A','organizer','2026-01-01'
from templates t join template_matches m on m.template_id=t.id on conflict do nothing;
insert into leagues(id,name,template_id,organizer_token,join_token,scoring_config,status,created_at)
select md5('transition-league-'||type||s)::uuid,'Transition '||type||' '||s,t.id,
md5('transition-organizer-'||type||s)::uuid,md5('transition-join-'||type||s)::uuid,
case when type='pickem' then '{"scheme":"pickem_flat","other_points":1}'::jsonb
else '{"round_points":{"1":1},"champion_bonus":0}'::jsonb end,'active','2026-01-01'
from templates t cross join unnest(array['active','locked','complete']) s on conflict do nothing;
insert into participants(id,league_id,display_name,magic_token,created_at)
select md5(l.id::text||choice)::uuid,l.id,choice,md5('transition-magic-'||l.id||choice)::uuid,'2026-01-01'
from leagues l cross join unnest(array['A','B']) choice on conflict do nothing;
insert into picks(id,league_id,participant_id,slot_id,team_id,submitted_at)
select md5('transition-pick-'||p.id)::uuid,l.id,p.id,m.id::text,p.display_name,'2026-01-01'
from participants p join leagues l on l.id=p.league_id join template_matches m on m.template_id=l.template_id
on conflict do nothing;
insert into league_result_overrides(id,league_id,template_match_id,winner_team_id,overridden_at)
select md5('transition-override-'||l.id)::uuid,l.id,m.id,'B','2026-01-02'
from leagues l join template_matches m on m.template_id=l.template_id
where l.name like '%locked' on conflict do nothing;
update leagues set locked_at='2026-01-03' where name not like '%active' and locked_at is null;
update leagues set status='complete' where name like '%complete' and status <> 'complete';
commit;
