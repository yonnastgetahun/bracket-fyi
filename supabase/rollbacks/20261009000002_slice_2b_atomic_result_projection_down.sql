-- Local rollback only. Preserve canonical result, audit, outbox, and observation rows after hosted use.
revoke all on function project_provider_result(uuid,text) from public, anon, authenticated, service_role;
revoke all on function slice_2b_outbox_idempotency_key(text,text) from public, anon, authenticated, service_role;
revoke all on function slice_2b_audit_idempotency_key(text,text) from public, anon, authenticated, service_role;
revoke all on function slice_2b_result_idempotency_key(uuid,text,text,uuid,jsonb,jsonb,timestamptz,text) from public, anon, authenticated, service_role;
revoke all on function slice_2b_canonical_json(jsonb) from public, anon, authenticated, service_role;
drop function if exists project_provider_result(uuid,text);
drop function if exists slice_2b_outbox_idempotency_key(text,text);
drop function if exists slice_2b_audit_idempotency_key(text,text);
drop function if exists slice_2b_result_idempotency_key(uuid,text,text,uuid,jsonb,jsonb,timestamptz,text);
drop function if exists slice_2b_canonical_json(jsonb);
