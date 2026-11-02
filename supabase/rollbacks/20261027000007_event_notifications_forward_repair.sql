-- Additive disable, safe to replay. No evidence, picks, consent or attempts erased.
-- Uncertain/issued/preauthorized work is retained; not a drained guarantee.
begin;
select set_event_notification_control(true,false);
commit;
-- Resume only after repair and operator acceptance, using the service control RPC.
-- Real transport remains prohibited by the schema check and fake-only worker.
