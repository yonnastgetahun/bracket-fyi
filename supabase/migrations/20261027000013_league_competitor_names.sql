-- League-local legacy competitor display names. Stable IDs and template data are unchanged.
-- Service access only: application routes enforce organizer authority before writes.
begin;
create table if not exists public.league_competitor_names (
  league_id uuid not null references public.leagues(id) on delete cascade,
  template_id uuid not null references public.templates(id) on delete cascade,
  team_id text not null check (length(team_id) between 1 and 128),
  name text not null check (length(name) between 1 and 60 and length(btrim(name)) > 0),
  primary key (league_id, template_id, team_id)
);
alter table public.league_competitor_names enable row level security;
revoke all on public.league_competitor_names from public, anon, authenticated;
grant select, insert, update, delete on public.league_competitor_names to service_role;
commit;
