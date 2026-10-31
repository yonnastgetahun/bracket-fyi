-- Forward-only compatibility hold; retain typed results, revisions, picks and audit.
begin;
update public.event_league_evaluations
set lifecycle_disabled=true,frozen=true,generation=generation+1
where not lifecycle_disabled;
commit;
-- Replay is idempotent. New typed lifecycle readers report held and hide scores.
-- No old binary may serve new formats; legacy_event_format_supported still gates them.
-- Resume requires reviewed owner maintenance of lifecycle_disabled and reconciliation.
