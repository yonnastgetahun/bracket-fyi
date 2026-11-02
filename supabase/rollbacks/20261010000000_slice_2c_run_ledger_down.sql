-- Slice 2C.2 rollback note: local/disposable only.
-- This forward-repair companion removes the run-ledger boundary and restores
-- the pre-2C.2 service-role table grants. Do not apply to hosted data without
-- an explicit migration review and a backup/repair plan.

revoke all on function claim_due_ingestion_run(text, timestamptz, text, integer) from public, anon, authenticated, service_role;
revoke all on function claim_manual_ingestion_run(uuid, text, text, timestamptz, integer) from public, anon, authenticated, service_role;
revoke all on function start_ingestion_run(uuid, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function renew_ingestion_run(uuid, text, timestamptz, integer) from public, anon, authenticated, service_role;
revoke all on function record_ingestion_response(uuid, text, integer, integer, integer, timestamptz, timestamptz, timestamptz) from public, anon, authenticated, service_role;
revoke all on function reclaim_expired_ingestion_runs(timestamptz, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function commit_ingestion_page(uuid, text, text, bigint, jsonb, text, jsonb, text, integer, integer, integer, integer, integer, integer, integer) from public, anon, authenticated, service_role;
revoke all on function finish_ingestion_run(uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, text, text, jsonb) from public, anon, authenticated, service_role;

drop function if exists claim_due_ingestion_run(text, timestamptz, text, integer);
drop function if exists claim_manual_ingestion_run(uuid, text, text, timestamptz, integer);
drop function if exists start_ingestion_run(uuid, text, timestamptz);
drop function if exists renew_ingestion_run(uuid, text, timestamptz, integer);
drop function if exists record_ingestion_response(uuid, text, integer, integer, integer, timestamptz, timestamptz, timestamptz);
drop function if exists reclaim_expired_ingestion_runs(timestamptz, text, timestamptz);
drop function if exists commit_ingestion_page(uuid, text, text, bigint, jsonb, text, jsonb, text, integer, integer, integer, integer, integer, integer, integer);
drop function if exists finish_ingestion_run(uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, text, text, jsonb);
drop function if exists slice_2c_page_key(uuid, bigint, jsonb, text);
drop function if exists slice_2c_page_disposition_fingerprint(bigint, jsonb, text, jsonb, text, integer, integer, integer, integer, integer, integer, integer);
drop function if exists slice_2c_run_row(uuid, boolean);
drop function if exists slice_2c_assert_lease(uuid, text, timestamptz);
drop function if exists slice_2c_lease_seconds(integer);
drop function if exists slice_2c_normalize_manual_claim_key(uuid, text);
drop function if exists slice_2c_normalize_automated_claim_key(text);

drop trigger if exists ingestion_runs_claim_request_key_backfill_trigger on ingestion_runs;
drop function if exists slice_2c_backfill_claim_request_key();

drop table if exists ingestion_page_ledger;

drop index if exists ingestion_runs_retry_due_idx;
drop index if exists ingestion_runs_retry_parent_idx;
drop index if exists ingestion_runs_one_retry_child_idx;
drop index if exists ingestion_runs_claim_request_key_idx;

alter table ingestion_runs
  drop constraint if exists ingestion_runs_retry_parent_fk,
  drop constraint if exists ingestion_runs_retry_parent_self_check,
  drop constraint if exists ingestion_runs_retry_at_requires_retryable_status,
  drop constraint if exists ingestion_runs_skipped_count_nonnegative,
  drop constraint if exists ingestion_runs_retry_index_valid,
  drop constraint if exists ingestion_runs_claim_generation_nonnegative,
  drop constraint if exists ingestion_runs_claim_request_key_not_blank,
  drop column if exists skipped_count,
  drop column if exists next_retry_at,
  drop column if exists retry_of_run_id,
  drop column if exists retry_index,
  drop column if exists lease_token,
  drop column if exists claim_generation,
  drop column if exists claim_request_key;

alter table provider_bindings
  drop constraint if exists provider_bindings_checkpoint_generation_nonnegative,
  drop constraint if exists provider_bindings_claim_generation_nonnegative,
  drop column if exists checkpoint_generation,
  drop column if exists claim_generation,
  drop column if exists provider_etag;

revoke all privileges on table provider_bindings, ingestion_runs from service_role;
grant select, insert on table provider_bindings, ingestion_runs to service_role;
grant update on table provider_bindings, ingestion_runs to service_role;
