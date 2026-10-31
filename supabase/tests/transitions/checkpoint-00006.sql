-- Committed owner-seeded synthetic historical evidence, not RPC behavior proof.
begin;
insert into event_lifecycle_revisions(id,league_id,market_id,revision,outcome,action,reason,actor_fingerprint,idempotency_key,request)
values(md5('transition-history-revision')::uuid,md5('transition-incarnation-live')::uuid,'m',1,
 '{"kind":"winner","entrant":"a"}','override','Synthetic preserved override',repeat('a',64),'transition-history-revision','{"synthetic":true}');
insert into event_lifecycle_audit(id,league_id,generation,kind,basis_token,revision_id,details)
values(md5('transition-history-audit')::uuid,md5('transition-incarnation-live')::uuid,1,'coronation','synthetic-completed-basis',
 md5('transition-history-revision')::uuid,'{"synthetic":true,"state":"complete"}');
commit;
