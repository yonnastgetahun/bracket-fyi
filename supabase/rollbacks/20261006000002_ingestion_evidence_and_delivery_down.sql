-- Operator-reviewed rollback for Slice 1B.
-- Destructive once ingestion evidence exists; prefer a forward repair after deployment.

drop table if exists notification_attempts;
drop table if exists notification_outbox;
drop table if exists league_completion_holds;
drop table if exists result_audit_events;
drop table if exists contest_results;
drop table if exists ingestion_quarantine;
drop table if exists provider_observations;
drop table if exists provider_entity_refs;
drop table if exists ingestion_runs;
drop table if exists provider_bindings;

drop function if exists validate_notification_attempt_participant();
drop function if exists validate_notification_audience();
drop function if exists validate_completion_hold_edition();
drop function if exists validate_contest_result_version();
drop function if exists reject_immutable_evidence_change();
drop function if exists validate_provider_entity_ref();
