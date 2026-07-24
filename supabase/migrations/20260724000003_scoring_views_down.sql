-- ============================================================
-- Bracket.fyi — Migration 003 DOWN: remove scoring views
-- ============================================================
drop view if exists v_contention;
drop view if exists v_leaderboard;
drop view if exists v_champion_status;
drop view if exists v_pick_results;
