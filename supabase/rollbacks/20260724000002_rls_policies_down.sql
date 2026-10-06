-- ============================================================
-- Bracket.fyi — Migration 002 DOWN: remove RLS policies
-- ============================================================

drop policy if exists "templates_anon_read"            on templates;
drop policy if exists "template_matches_anon_read"     on template_matches;
drop policy if exists "template_results_anon_read"     on template_results;
drop policy if exists "leagues_token_read"             on leagues;
drop policy if exists "participants_league_read"       on participants;
drop policy if exists "picks_read"                     on picks;
drop policy if exists "picks_insert"                   on picks;
drop policy if exists "picks_update"                   on picks;
drop policy if exists "overrides_organizer_read"       on league_result_overrides;

drop function if exists get_request_token(text);

alter table templates                disable row level security;
alter table leagues                  disable row level security;
alter table participants             disable row level security;
alter table picks                    disable row level security;
alter table template_matches         disable row level security;
alter table template_results         disable row level security;
alter table league_result_overrides  disable row level security;
