-- Bracket.fyi Slice 2B-R3 — close direct provenance mutation privileges.
-- Forward-only. SECURITY DEFINER projection wrappers remain the write boundary.

revoke all on table canonical_structural_projection_state from public, anon, authenticated, service_role;
grant select on table canonical_structural_projection_state to service_role;

