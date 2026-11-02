-- Local rollback only. Do not use after evidence exists in a hosted environment.
revoke all on function get_ingestion_quarantine(uuid, text) from public, anon, authenticated, service_role;
revoke all on function open_ingestion_quarantine(uuid, uuid, uuid, text, text, text, text, uuid[], jsonb) from public, anon, authenticated, service_role;
revoke all on function upsert_provider_entity_mapping(uuid, text, text, uuid, text, numeric, text, timestamptz, jsonb) from public, anon, authenticated, service_role;
revoke all on function get_provider_entity_ref(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function slice_2b_candidate_belongs_to_edition(text, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function record_provider_observation(uuid, uuid, text, text, text, timestamptz, timestamptz, integer, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function validate_slice_2b_normalized_snapshot(jsonb) from public, anon, authenticated, service_role;
drop function if exists get_ingestion_quarantine(uuid, text);
drop function if exists open_ingestion_quarantine(uuid, uuid, uuid, text, text, text, text, uuid[], jsonb);
drop function if exists upsert_provider_entity_mapping(uuid, text, text, uuid, text, numeric, text, timestamptz, jsonb);
drop function if exists get_provider_entity_ref(uuid, text, text);
drop function if exists slice_2b_candidate_belongs_to_edition(text, uuid, uuid);
drop function if exists record_provider_observation(uuid, uuid, text, text, text, timestamptz, timestamptz, integer, jsonb, jsonb);
drop function if exists validate_slice_2b_normalized_snapshot(jsonb);
drop table if exists provider_observation_conflicts;
