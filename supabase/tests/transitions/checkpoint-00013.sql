-- Committed league-local names on existing scored legacy leagues, not rollback-only evidence.
-- Each template has two renamed leagues sharing A/B IDs and a third untouched league.
begin;
set local role service_role;
insert into public.league_competitor_names(league_id,template_id,team_id,name)
select md5('transition-league-'||kind||state)::uuid,
       md5('transition-template-'||kind)::uuid,team,
       'Local '||kind||' '||state||' '||team
from unnest(array['bracket','pickem']) kind
cross join unnest(array['active','locked']) state
cross join unnest(array['A','B']) team
on conflict (league_id,template_id,team_id) do nothing;
commit;
