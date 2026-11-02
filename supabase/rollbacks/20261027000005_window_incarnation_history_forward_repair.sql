-- Forward-only hold. Do NOT drop history, rewind versions, or restore old guards.
-- Application fallback cannot undo an exposed optimistic token safely.
begin;
update public.event_league_evaluations set frozen=true,generation=generation+1 where not frozen;
commit;
-- Preserve history even for absent windows. Replay is idempotent.
-- Resume only individually reviewed leagues via freeze_event_league.
-- This is a safety hold, not an old-binary compatibility guarantee.
