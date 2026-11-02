-- Slice 2C.5B-R1 rollback note.
-- Intentionally non-destructive: persisted budget, reservation, response, and
-- run evidence must remain. Hosted rollback requires a reviewed forward repair.
begin;
commit;
