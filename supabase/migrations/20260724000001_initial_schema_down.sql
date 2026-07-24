-- ============================================================
-- Bracket.fyi — Migration 001 DOWN: reverse initial schema
-- ============================================================

drop view if exists effective_results;

drop trigger if exists league_lock_trigger on leagues;
drop function if exists lock_picks_on_league_lock();

drop table if exists league_result_overrides cascade;
drop table if exists template_results cascade;
drop table if exists template_matches cascade;
drop table if exists picks cascade;
drop table if exists participants cascade;
drop table if exists leagues cascade;
drop table if exists templates cascade;

drop type if exists league_status;
drop type if exists result_source;
drop type if exists template_type;
