-- No worker/transport execution. Preserve a completed fake delivery and consent.
begin;
insert into event_notification_subscriptions(id,league_id,participant_id,audience,endpoint_fingerprint,kinds)
values(md5('transition-history-subscription')::uuid,md5('transition-incarnation-live')::uuid,
 md5('transition-incarnation-person-live')::uuid,'participant',repeat('b',64),array['league_complete']);
select enqueue_event_notification(md5('transition-history-audit')::uuid,'league_complete','transition-history-completion');
insert into notification_attempts(id,outbox_id,participant_id,endpoint_fingerprint,attempt_number,idempotency_key,status,
 finished_at,disposition,worker_incarnation,basis_token,metadata)
select md5('transition-history-attempt')::uuid,id,participant_id,repeat('b',64),1,'transition-history-attempt','sent',
 clock_timestamp(),'finished',md5('transition-history-worker')::uuid,notification_basis,'{"synthetic":true,"transport":"fake"}'
from notification_outbox where subscription_id=md5('transition-history-subscription')::uuid;
insert into event_notification_snapshots(league_id,effective,leaderboard)
values(md5('transition-incarnation-live')::uuid,'{"m":{"outcome":{"kind":"winner","entrant":"a"}}}',
 '[{"participantId":"synthetic","points":1,"rank":1}]');
commit;
