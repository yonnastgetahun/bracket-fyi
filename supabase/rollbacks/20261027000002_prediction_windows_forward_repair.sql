-- Non-destructive forward hold for typed-window leagues. No picks, windows or
-- evidence are removed; legacy leagues remain unchanged. This intentionally
-- changes generation so no stale leaderboard is advertised as evaluated.
begin;
update public.event_league_evaluations set frozen=true,generation=generation+1;
commit;
-- Re-enable only reviewed leagues through freeze_event_league after the repaired
-- typed reader is available. An unmodified legacy binary is not supported.
