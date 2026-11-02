begin;

select plan(26);

select has_table(
  'public',
  'provider_observation_conflicts',
  'same-revision evidence conflicts have an immutable preservation ledger'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.provider_observation_conflicts'::regclass),
  true,
  'evidence conflict rows are protected by RLS'
);

select is(
  (select count(*) from information_schema.role_routine_grants
   where specific_schema = 'public'
     and routine_name in (
       'record_provider_observation',
       'get_provider_entity_ref',
       'upsert_provider_entity_mapping',
       'open_ingestion_quarantine',
       'get_ingestion_quarantine'
     )
     and grantee in ('anon', 'authenticated')),
  0::bigint,
  'browser roles cannot execute Slice 2B persistence RPCs'
);

select is(
  (select count(*) from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name = 'provider_observation_conflicts'
     and grantee in ('anon', 'authenticated')),
  0::bigint,
  'browser roles cannot read or write preserved evidence conflicts'
);

insert into data_providers (id, adapter_key, display_name)
values ('96000000-0000-4000-8000-000000000001', 'slice-2b-fixture', 'Slice 2B Fixture');

insert into organizations (id, organization_key, name, kind)
values ('96000000-0000-4000-8000-000000000002', 'slice-2b-org', 'Slice 2B Organization', 'league');

insert into competitions (id, organization_id, competition_key, name, domain, sport_code)
values ('96000000-0000-4000-8000-000000000003', '96000000-0000-4000-8000-000000000002', 'slice-2b-cup', 'Slice 2B Cup', 'sport', 'synthetic');

insert into event_editions (id, competition_id, edition_key, name, season_label)
values
  ('96000000-0000-4000-8000-000000000004', '96000000-0000-4000-8000-000000000003', '2026', 'Slice 2B Cup 2026', '2026'),
  ('96000000-0000-4000-8000-000000000005', '96000000-0000-4000-8000-000000000003', '2027', 'Slice 2B Cup 2027', '2027');

insert into stages (id, event_edition_id, stage_key, name, kind, ordinal)
values
  ('96000000-0000-4000-8000-000000000006', '96000000-0000-4000-8000-000000000004', 'finals', 'Finals', 'knockout', 1),
  ('96000000-0000-4000-8000-000000000007', '96000000-0000-4000-8000-000000000005', 'finals', 'Finals', 'knockout', 1);

insert into contests (id, event_edition_id, stage_id, contest_key, name, kind)
values
  ('96000000-0000-4000-8000-000000000008', '96000000-0000-4000-8000-000000000004', '96000000-0000-4000-8000-000000000006', 'final', 'Final', 'match'),
  ('96000000-0000-4000-8000-000000000009', '96000000-0000-4000-8000-000000000005', '96000000-0000-4000-8000-000000000007', 'final', 'Final', 'match');

insert into competitors (id, competitor_key, kind, canonical_name)
values
  ('96000000-0000-4000-8000-000000000010', 'slice-2b-team-a', 'team', 'Slice 2B Team A'),
  ('96000000-0000-4000-8000-000000000011', 'slice-2b-team-b', 'team', 'Slice 2B Team B');

insert into event_entries (id, event_edition_id, competitor_id, role)
values
  ('96000000-0000-4000-8000-000000000012', '96000000-0000-4000-8000-000000000004', '96000000-0000-4000-8000-000000000010', 'team'),
  ('96000000-0000-4000-8000-000000000013', '96000000-0000-4000-8000-000000000004', '96000000-0000-4000-8000-000000000011', 'team');

insert into provider_bindings (id, provider_id, event_edition_id, binding_key, mode, health_status)
values ('96000000-0000-4000-8000-000000000014', '96000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000004', 'slice-2b-primary', 'shadow', 'healthy');

insert into ingestion_runs (id, binding_id, provider_id, event_edition_id, claim_key, trigger_kind, claimed_by, lease_expires_at)
values ('96000000-0000-4000-8000-000000000015', '96000000-0000-4000-8000-000000000014', '96000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000004', 'slice-2b-run', 'replay', 'slice-2b-test', now() + interval '10 minutes');

select throws_ok(
  $$select * from record_provider_observation(
    '96000000-0000-4000-8000-000000000099',
    '96000000-0000-4000-8000-000000000014',
    'contest', 'missing-run', null, null, now(), 1, '{}'::jsonb,
    jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','slice-2b-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity','{}'::jsonb,'semanticHash',repeat('a',64))
  )$$,
  '23503', null,
  'observation evidence requires an existing ingestion run'
);

select throws_ok(
  $$select * from record_provider_observation(
    '96000000-0000-4000-8000-000000000015',
    '96000000-0000-4000-8000-000000000014',
    'contest', 'invalid-snapshot', 'rev-invalid', null, now(), 1, '{}'::jsonb, '{}'::jsonb
  )$$,
  '22023', null,
  'observation evidence requires the approved normalized snapshot envelope'
);

create temporary table slice_2b_first_observation as
select * from record_provider_observation(
  '96000000-0000-4000-8000-000000000015',
  '96000000-0000-4000-8000-000000000014',
  'contest', 'synthetic-contest-1', 'revision-a', '2026-10-08T18:00:00Z', '2026-10-08T18:01:00Z', 1,
  '{"source":"synthetic","score":{"home":1,"away":0}}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','slice-2b-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('entityKind','contest','contestKey','final'),'semanticHash',repeat('a',64))
);

select is((select outcome from slice_2b_first_observation), 'inserted', 'a new observation stores its normalized snapshot');
select is((select metadata->>'normalizationPolicyVersion' from provider_observations where id = (select observation_id from slice_2b_first_observation)), 'identity-normalization-v1', 'the immutable observation stores the normalization version');

select is(
  (select outcome from record_provider_observation(
    '96000000-0000-4000-8000-000000000015','96000000-0000-4000-8000-000000000014','contest','synthetic-contest-1','revision-a','2026-10-08T18:00:00Z','2026-10-08T18:02:00Z',1,
    '{"score":{"away":0,"home":1},"source":"synthetic"}'::jsonb,
    jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','slice-2b-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('entityKind','contest','contestKey','final'),'semanticHash',repeat('a',64))
  )),
  'exact_replay',
  'same revision and semantic evidence returns the original observation'
);

create temporary table slice_2b_revision_conflict as
select * from record_provider_observation(
  '96000000-0000-4000-8000-000000000015','96000000-0000-4000-8000-000000000014','contest','synthetic-contest-1','revision-a','2026-10-08T18:03:00Z','2026-10-08T18:03:00Z',1,
  '{"source":"synthetic","score":{"home":2,"away":0}}'::jsonb,
  jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','slice-2b-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','normalizedEntity',jsonb_build_object('entityKind','contest','contestKey','final'),'semanticHash',repeat('b',64))
);

select is((select outcome from slice_2b_revision_conflict), 'revision_conflict', 'same-revision changed evidence is not silently discarded');
select is((select count(*) from provider_observation_conflicts), 1::bigint, 'same-revision conflict evidence is preserved exactly once');
select throws_ok(
  $$update provider_observation_conflicts set conflict_reason = 'tampered'$$,
  '55000', null,
  'preserved conflict evidence is immutable'
);

select is(
  (select outcome from record_provider_observation(
    '96000000-0000-4000-8000-000000000015','96000000-0000-4000-8000-000000000014','contest','revisionless-contest',null,null,'2026-10-08T18:04:00Z',1,
    '{"a":1,"b":2}'::jsonb,
    jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','slice-2b-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','partial','normalizedEntity',jsonb_build_object('entityKind','contest','contestKey','final'),'semanticHash',repeat('c',64))
  )),
  'inserted', 'revisionless evidence inserts once'
);
select is(
  (select outcome from record_provider_observation(
    '96000000-0000-4000-8000-000000000015','96000000-0000-4000-8000-000000000014','contest','revisionless-contest',null,null,'2026-10-08T18:05:00Z',1,
    '{"b":2,"a":1}'::jsonb,
    jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','slice-2b-fixture','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','partial','normalizedEntity',jsonb_build_object('entityKind','contest','contestKey','final'),'semanticHash',repeat('c',64))
  )),
  'exact_replay', 'revisionless semantic replay returns the original evidence'
);

select is((select outcome from upsert_provider_entity_mapping(
  '96000000-0000-4000-8000-000000000014','competitor','team-a','96000000-0000-4000-8000-000000000010','automatic',0.99,null,null,jsonb_build_object('normalizationPolicyVersion','identity-normalization-v1')
)), 'created', 'automatic mapping is created atomically');
select is((select canonical_id from get_provider_entity_ref('96000000-0000-4000-8000-000000000014','competitor','team-a')), '96000000-0000-4000-8000-000000000010'::uuid, 'automatic mapping returns its discriminated canonical ID');
select is((select outcome from upsert_provider_entity_mapping(
  '96000000-0000-4000-8000-000000000014','competitor','team-a','96000000-0000-4000-8000-000000000011','automatic',0.98,null,null,'{}'::jsonb
)), 'conflict', 'automatic mapping cannot change to a conflicting canonical target');

-- Synthetic registry authority; calls below remain SECURITY INVOKER.
insert into event_operator_principals(id) values(md5('fixture-operator-16')::uuid);
insert into event_operator_credentials values(encode(extensions.digest('fixture-scoped-operator-16','sha256'),'hex'),md5('fixture-operator-16')::uuid,true,now()+interval '1 hour');
insert into event_operator_grants(principal_id,environment,event_edition_id,action)
select md5('fixture-operator-16')::uuid,'local','96000000-0000-4000-8000-000000000004'::uuid,a from unnest(array['mapping.review']) a;
create function pg_temp.review_mapping(b uuid,k text,e text,c uuid,s text) returns text language plpgsql as $$
declare v bigint; r jsonb; begin
 select operator_version into v from provider_bindings where id=b;
 r:=event_operator_command('fixture-scoped-operator-16','local','96000000-0000-4000-8000-000000000004','mapping.review',v,'Synthetic reviewed fixture',
 jsonb_build_object('bindingId',b,'entityKind',k,'externalId',e,'canonicalId',c,'status',s));
 return r->>'outcome'; end $$;

select is(pg_temp.review_mapping('96000000-0000-4000-8000-000000000014','competitor','rejected-team',null,'rejected'), 'created', 'rejected mapping is created atomically');
select is((select outcome from upsert_provider_entity_mapping(
  '96000000-0000-4000-8000-000000000014','competitor','rejected-team','96000000-0000-4000-8000-000000000010','automatic',0.99,null,null,'{}'::jsonb
)), 'conflict', 'automatic mapping cannot replace a rejected mapping');
select throws_ok(
  $$select * from upsert_provider_entity_mapping('96000000-0000-4000-8000-000000000014','result','result-1',null,'unresolved',null,null,null,'{}'::jsonb)$$,
  '22023', null,
  'result identities cannot be stored as provider mappings'
);
select throws_ok(
  $$select * from upsert_provider_entity_mapping('96000000-0000-4000-8000-000000000014','contest','wrong-edition','96000000-0000-4000-8000-000000000009','automatic',0.99,null,null,'{}'::jsonb)$$,
  '23514', null,
  'mapping targets cannot cross the binding edition'
);

select is((select outcome from open_ingestion_quarantine(
  (select observation_id from slice_2b_first_observation), '96000000-0000-4000-8000-000000000015','96000000-0000-4000-8000-000000000014','mapping_ambiguous','blocking','competitor','team-a',array['96000000-0000-4000-8000-000000000011'::uuid,'96000000-0000-4000-8000-000000000010'::uuid],'{"synthetic":true}'::jsonb
)), 'created', 'ambiguous identity is quarantined atomically');
select is((select candidate_ids from ingestion_quarantine limit 1), array['96000000-0000-4000-8000-000000000010'::uuid,'96000000-0000-4000-8000-000000000011'::uuid], 'quarantine candidates are canonicalized deterministically');
select is((select outcome from open_ingestion_quarantine(
  (select observation_id from slice_2b_first_observation), '96000000-0000-4000-8000-000000000015','96000000-0000-4000-8000-000000000014','mapping_ambiguous','blocking','competitor','team-a',array['96000000-0000-4000-8000-000000000010'::uuid,'96000000-0000-4000-8000-000000000011'::uuid],'{"synthetic":true}'::jsonb
)), 'unchanged', 'exact quarantine replay returns the existing open row');
update ingestion_quarantine set status = 'resolved', resolved_at = now(), resolved_by = 'operator', resolution_action = 'reviewed' where issue_code = 'mapping_ambiguous';
select is((select outcome from open_ingestion_quarantine(
  (select observation_id from slice_2b_first_observation), '96000000-0000-4000-8000-000000000015','96000000-0000-4000-8000-000000000014','mapping_ambiguous','blocking','competitor','team-a',array['96000000-0000-4000-8000-000000000010'::uuid,'96000000-0000-4000-8000-000000000011'::uuid],'{"synthetic":true}'::jsonb
)), 'already_resolved', 'resolved quarantine rows are never reopened by replay');
select throws_ok(
  $$set local role anon; select * from record_provider_observation(null,null,null,null,null,null,null,null,null,null)$$,
  '42501', null,
  'anonymous callers cannot execute evidence persistence'
);

select * from finish();

rollback;
