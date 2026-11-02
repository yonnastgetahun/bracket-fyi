-- Slice 2C.5B rollback note.
-- Intentionally non-destructive: do not drop budget tables, reservations, or
-- public wrappers after evidence may exist. Hosted rollback requires a
-- separately reviewed forward repair that preserves all reservation,
-- observation, and run history. This transactional no-op is safe to rehearse.
begin;
commit;
