-- Parent DB lane only. Synthetic fixtures roll back; no original template rewrites.
begin;
select no_plan();
insert into templates(id,name,type,team_registry) values
 ('a3900000-0000-4000-8000-000000000004','Synthetic DB39','bracket',
 '[{"id":"seed-0","name":"Original","aliases":["Alias"]},{"id":"seed-1","name":"Other","aliases":[]}]');
insert into leagues(id,name,template_id) values
 ('a3900000-0000-4000-8000-000000000001','DB39 A','a3900000-0000-4000-8000-000000000004'),
 ('a3900000-0000-4000-8000-000000000002','DB39 B','a3900000-0000-4000-8000-000000000004');
select ok((select relrowsecurity from pg_class where oid='public.league_competitor_names'::regclass),'RLS enabled');
select ok(not has_table_privilege('anon','public.league_competitor_names','SELECT'),'anonymous cannot read raw overrides');
select ok(not has_table_privilege('anon','public.league_competitor_names','INSERT'),'anonymous cannot insert overrides');
select ok(not has_table_privilege('authenticated','public.league_competitor_names','UPDATE'),'authenticated cannot rename directly');
set local role service_role;
insert into league_competitor_names(league_id,template_id,team_id,name) values
 ('a3900000-0000-4000-8000-000000000001','a3900000-0000-4000-8000-000000000004','seed-0','Local A')
 on conflict(league_id,template_id,team_id) do update set name=excluded.name;
select is((select name from league_competitor_names where league_id='a3900000-0000-4000-8000-000000000001'),'Local A','service persists league A display name');
select is((select count(*) from league_competitor_names where league_id='a3900000-0000-4000-8000-000000000002'),0::bigint,'league B has no override');
select is((select team_registry->0->>'name' from templates where id='a3900000-0000-4000-8000-000000000004'),'Original','shared template unchanged');
insert into league_competitor_names(league_id,template_id,team_id,name) values
 ('a3900000-0000-4000-8000-000000000002','a3900000-0000-4000-8000-000000000004','seed-0','Local B'),
 ('a3900000-0000-4000-8000-000000000001','a3900000-0000-4000-8000-000000000004','seed-1','Second A');
insert into league_competitor_names(league_id,template_id,team_id,name) values
 ('a3900000-0000-4000-8000-000000000001','a3900000-0000-4000-8000-000000000004','seed-0','Updated A')
 on conflict(league_id,template_id,team_id) do update set name=excluded.name;
select is((select name from league_competitor_names where league_id='a3900000-0000-4000-8000-000000000002'),'Local B','same-team upsert never changes B');
select is((select name from league_competitor_names where league_id='a3900000-0000-4000-8000-000000000001' and team_id='seed-1'),'Second A','same-team upsert preserves other team names');
reset role;
select throws_ok($q$insert into league_competitor_names values('a3900000-0000-4000-8000-000000000001','a3900000-0000-4000-8000-000000000004','seed-2','   ')$q$,
 '23514',null,'blank names rejected');
select throws_ok($q$insert into league_competitor_names values('a3900000-0000-4000-8000-000000000001','a3900000-0000-4000-8000-000000000004','seed-2',repeat('x',61))$q$,
 '23514',null,'oversize names rejected');
select * from finish();
rollback;
