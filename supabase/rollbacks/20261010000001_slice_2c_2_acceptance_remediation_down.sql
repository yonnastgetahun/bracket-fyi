-- Slice 2C.2-R rollback note: local/disposable forward repair only.
-- The remediation changes public RPC bodies. After any hosted deployment, do
-- not remove those bodies or evidence with this file; deploy a reviewed
-- forward repair that preserves run/page history and restores a compatible
-- function implementation first.

drop index if exists ingestion_page_ledger_checkpoint_idx;

alter table ingestion_runs
  drop constraint if exists ingestion_runs_metadata_no_sensitive_keys,
  drop constraint if exists ingestion_runs_metadata_size,
  drop constraint if exists ingestion_runs_error_message_length,
  drop constraint if exists ingestion_runs_error_class_length;

revoke all on function slice_2c_claim_due_impl(text, timestamptz, text, integer) from public, anon, authenticated, service_role;
revoke all on function slice_2c_claim_manual_impl(uuid, text, text, timestamptz, integer) from public, anon, authenticated, service_role;
revoke all on function slice_2c_metadata_has_sensitive_key(jsonb) from public, anon, authenticated, service_role;
drop function if exists slice_2c_claim_due_impl(text, timestamptz, text, integer);
drop function if exists slice_2c_claim_manual_impl(uuid, text, text, timestamptz, integer);
drop function if exists slice_2c_metadata_has_sensitive_key(jsonb);

alter function slice_2c_run_row(uuid, boolean) security definer;

-- Public RPC bodies remain the hardened forward implementation. Restoring the
-- pre-remediation bodies requires a separate reviewed forward migration; this
-- down file intentionally does not delete or rewrite evidence.
