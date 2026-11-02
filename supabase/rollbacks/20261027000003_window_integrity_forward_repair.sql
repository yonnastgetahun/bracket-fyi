-- Forward-only safety hold; never restore mutable snapshots or weaken guards.
-- Apply after 00003 if typed-window application integration must be held.
begin;
update public.event_league_evaluations set frozen=true,generation=generation+1 where not frozen;
commit;
-- Preserve versions, picks, windows and historical basis. After reviewed repair,
-- re-enable individual leagues via freeze_event_league. No old-binary support
-- is claimed for new formats. Replay leaves already-frozen generations unchanged.
