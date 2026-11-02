-- Local rollback only. Preserve canonical rows and observation evidence after any hosted use.
revoke all on function project_structural_observation(uuid) from public, anon, authenticated, service_role;
drop function if exists project_structural_observation(uuid);
drop table if exists canonical_structural_projection_state;
