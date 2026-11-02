-- P2 task: immutable scoped winner membership + legacy compatibility. Proof: pgTAP.

begin;

select no_plan();

select lives_ok(
  $$
    insert into data_providers (id, adapter_key, display_name)
    values (
      '93000000-0000-4000-8000-000000000001',
      'result-fixture',
      'Result Fixture'
    );

    insert into organizations (id, organization_key, name, kind)
    values (
      '93000000-0000-4000-8000-000000000002',
      'result-org',
      'Result Organization',
      'governing_body'
    );

    insert into competitions (
      id,
      organization_id,
      competition_key,
      name,
      domain,
      sport_code
    ) values (
      '93000000-0000-4000-8000-000000000003',
      '93000000-0000-4000-8000-000000000002',
      'result-cup',
      'Result Cup',
      'sport',
      'soccer'
    );

    insert into event_editions (
      id,
      competition_id,
      edition_key,
      name,
      season_label
    ) values (
      '93000000-0000-4000-8000-000000000004',
      '93000000-0000-4000-8000-000000000003',
      '2026',
      'Result Cup 2026',
      '2026'
    );

    insert into stages (
      id,
      event_edition_id,
      stage_key,
      name,
      kind,
      ordinal
    ) values (
      '93000000-0000-4000-8000-000000000005',
      '93000000-0000-4000-8000-000000000004',
      'finals',
      'Finals',
      'knockout',
      1
    );

    insert into contests (
      id,
      event_edition_id,
      stage_id,
      contest_key,
      name,
      kind
    ) values (
      '93000000-0000-4000-8000-000000000006',
      '93000000-0000-4000-8000-000000000004',
      '93000000-0000-4000-8000-000000000005',
      'final',
      'Final',
      'match'
    );

    insert into competitors (id, competitor_key, kind, canonical_name)
    values
      (
        '93000000-0000-4000-8000-000000000007',
        'result-team-a',
        'team',
        'Result Team A'
      ),
      (
        '93000000-0000-4000-8000-000000000008',
        'result-team-b',
        'team',
        'Result Team B'
      ),
      (
        '93000000-0000-4000-8000-000000000009',
        'result-team-c',
        'team',
        'Result Team C'
      );

    insert into event_entries (
      id,
      event_edition_id,
      competitor_id,
      role
    ) values
      (
        '93000000-0000-4000-8000-000000000010',
        '93000000-0000-4000-8000-000000000004',
        '93000000-0000-4000-8000-000000000007',
        'team'
      ),
      (
        '93000000-0000-4000-8000-000000000011',
        '93000000-0000-4000-8000-000000000004',
        '93000000-0000-4000-8000-000000000008',
        'team'
      ),
      (
        '93000000-0000-4000-8000-000000000012',
        '93000000-0000-4000-8000-000000000004',
        '93000000-0000-4000-8000-000000000009',
        'team'
      );

    insert into contest_entries (
      event_edition_id,
      contest_id,
      event_entry_id,
      role,
      side,
      ordinal
    ) values
      (
        '93000000-0000-4000-8000-000000000004',
        '93000000-0000-4000-8000-000000000006',
        '93000000-0000-4000-8000-000000000010',
        'competitor',
        'home',
        1
      ),
      (
        '93000000-0000-4000-8000-000000000004',
        '93000000-0000-4000-8000-000000000006',
        '93000000-0000-4000-8000-000000000011',
        'competitor',
        'away',
        2
      );

    insert into provider_bindings (
      id,
      provider_id,
      event_edition_id,
      binding_key,
      mode,
      health_status
    ) values (
      '93000000-0000-4000-8000-000000000013',
      '93000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000004',
      'result-primary',
      'shadow',
      'healthy'
    );

    insert into ingestion_runs (
      id,
      binding_id,
      provider_id,
      event_edition_id,
      claim_key,
      trigger_kind,
      claimed_by,
      lease_expires_at
    ) values (
      '93000000-0000-4000-8000-000000000014',
      '93000000-0000-4000-8000-000000000013',
      '93000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000004',
      'result-run-1',
      'schedule',
      'result-test-worker',
      now() + interval '5 minutes'
    );

    insert into provider_observations (
      id,
      ingestion_run_id,
      binding_id,
      provider_id,
      event_edition_id,
      external_object_kind,
      external_object_id,
      provider_revision,
      sanitized_payload
    ) values (
      '93000000-0000-4000-8000-000000000015',
      '93000000-0000-4000-8000-000000000014',
      '93000000-0000-4000-8000-000000000013',
      '93000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000004',
      'contest',
      'provider-final-1',
      'revision-1',
      '{"away":1,"home":2,"status":"FINISHED","winner":"HOME"}'::jsonb
    );
  $$,
  'a canonical contest, participants, and source observation can be prepared'
);



update contests set kind='category' where id='93000000-0000-4000-8000-000000000006';

insert into event_editions(id,competition_id,edition_key,name,season_label) values ('93000000-0000-4000-8000-000000000104','93000000-0000-4000-8000-000000000003','2027','Other edition','2027');

insert into stages(id,event_edition_id,stage_key,name,kind,ordinal) values ('93000000-0000-4000-8000-000000000105','93000000-0000-4000-8000-000000000104','ceremony','Ceremony','ceremony',1);

insert into contests(id,event_edition_id,stage_id,contest_key,name,kind) values ('93000000-0000-4000-8000-000000000106','93000000-0000-4000-8000-000000000104','93000000-0000-4000-8000-000000000105','cat-106','Category','category');

insert into contests(id,event_edition_id,stage_id,contest_key,name,kind) values ('93000000-0000-4000-8000-000000000107','93000000-0000-4000-8000-000000000004','93000000-0000-4000-8000-000000000005','cat-107','Category','category');

insert into contests(id,event_edition_id,stage_id,contest_key,name,kind) values ('93000000-0000-4000-8000-000000000108','93000000-0000-4000-8000-000000000004','93000000-0000-4000-8000-000000000005','cat-108','Category','category');

insert into award_nominations(id,contest_id,event_edition_id,nomination_key,name,eligible) values ('93000000-0000-4000-8000-000000000030','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004','nom-30','Nomination',true);

insert into award_nominations(id,contest_id,event_edition_id,nomination_key,name,eligible) values ('93000000-0000-4000-8000-000000000031','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004','nom-31','Nomination',true);

insert into award_nominations(id,contest_id,event_edition_id,nomination_key,name,eligible) values ('93000000-0000-4000-8000-000000000032','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004','nom-32','Nomination',false);

insert into award_nominations(id,contest_id,event_edition_id,nomination_key,name,eligible) values ('93000000-0000-4000-8000-000000000033','93000000-0000-4000-8000-000000000106','93000000-0000-4000-8000-000000000104','nom-33','Nomination',true);

insert into award_nominations(id,contest_id,event_edition_id,nomination_key,name,eligible) values ('93000000-0000-4000-8000-000000000034','93000000-0000-4000-8000-000000000107','93000000-0000-4000-8000-000000000004','nom-34','Nomination',true);

select lives_ok($test$insert into award_nomination_credits(nomination_id,contest_id,event_edition_id,event_entry_id,credit_role) values ('93000000-0000-4000-8000-000000000030','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004','93000000-0000-4000-8000-000000000010','person'),('93000000-0000-4000-8000-000000000031','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004','93000000-0000-4000-8000-000000000010','person'),('93000000-0000-4000-8000-000000000030','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004','93000000-0000-4000-8000-000000000011','work'),('93000000-0000-4000-8000-000000000031','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004','93000000-0000-4000-8000-000000000012','work')$test$, 'same person with two works retains two distinct nominations');

select throws_ok($test$insert into award_nomination_credits(nomination_id,contest_id,event_edition_id,event_entry_id,credit_role) values ('93000000-0000-4000-8000-000000000033','93000000-0000-4000-8000-000000000106','93000000-0000-4000-8000-000000000104','93000000-0000-4000-8000-000000000010','person')$test$, '23503', null, 'cross-edition credit rejected');

select throws_ok($test$insert into award_nominations(contest_id,event_edition_id,nomination_key,name) values ('93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000104','bad','bad')$test$, '23514', null, 'cross-edition nomination rejected');

select throws_ok($test$update contests set kind='game' where id='93000000-0000-4000-8000-000000000006'$test$, '23514', null, 'nominated category cannot turn into game');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,null,'operator',null,null,'typed-40')$test$, '23514', null, 'operator rejects missing nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,'{}'::uuid[],'operator',null,null,'typed-40')$test$, '23514', null, 'operator rejects empty nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,ARRAY['93000000-0000-4000-8000-000000000030','93000000-0000-4000-8000-000000000030']::uuid[],'operator',null,null,'typed-40')$test$, '23514', null, 'operator rejects duplicate nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,ARRAY['93000000-0000-4000-8000-000000000030',NULL]::uuid[],'operator',null,null,'typed-40')$test$, '23514', null, 'operator rejects null member nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,ARRAY['93000000-0000-4000-8000-000000000032']::uuid[],'operator',null,null,'typed-40')$test$, '23514', null, 'operator rejects ineligible nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,ARRAY['93000000-0000-4000-8000-000000000033']::uuid[],'operator',null,null,'typed-40')$test$, '23514', null, 'operator rejects cross-edition nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,ARRAY['93000000-0000-4000-8000-000000000034']::uuid[],'operator',null,null,'typed-40')$test$, '23514', null, 'operator rejects cross-category nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,ARRAY['93000000-0000-4000-8000-000000000999']::uuid[],'operator',null,null,'typed-40')$test$, '23514', null, 'operator rejects unknown nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,null,'provider','93000000-0000-4000-8000-000000000015',null,'typed-40')$test$, '23514', null, 'provider rejects missing nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,'{}'::uuid[],'provider','93000000-0000-4000-8000-000000000015',null,'typed-40')$test$, '23514', null, 'provider rejects empty nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,ARRAY['93000000-0000-4000-8000-000000000030','93000000-0000-4000-8000-000000000030']::uuid[],'provider','93000000-0000-4000-8000-000000000015',null,'typed-40')$test$, '23514', null, 'provider rejects duplicate nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,ARRAY['93000000-0000-4000-8000-000000000030',NULL]::uuid[],'provider','93000000-0000-4000-8000-000000000015',null,'typed-40')$test$, '23514', null, 'provider rejects null member nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,ARRAY['93000000-0000-4000-8000-000000000032']::uuid[],'provider','93000000-0000-4000-8000-000000000015',null,'typed-40')$test$, '23514', null, 'provider rejects ineligible nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,ARRAY['93000000-0000-4000-8000-000000000033']::uuid[],'provider','93000000-0000-4000-8000-000000000015',null,'typed-40')$test$, '23514', null, 'provider rejects cross-edition nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,ARRAY['93000000-0000-4000-8000-000000000034']::uuid[],'provider','93000000-0000-4000-8000-000000000015',null,'typed-40')$test$, '23514', null, 'provider rejects cross-category nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,ARRAY['93000000-0000-4000-8000-000000000999']::uuid[],'provider','93000000-0000-4000-8000-000000000015',null,'typed-40')$test$, '23514', null, 'provider rejects unknown nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,null,'system',null,null,'typed-40')$test$, '23514', null, 'system rejects missing nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,'{}'::uuid[],'system',null,null,'typed-40')$test$, '23514', null, 'system rejects empty nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,ARRAY['93000000-0000-4000-8000-000000000030','93000000-0000-4000-8000-000000000030']::uuid[],'system',null,null,'typed-40')$test$, '23514', null, 'system rejects duplicate nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,ARRAY['93000000-0000-4000-8000-000000000030',NULL]::uuid[],'system',null,null,'typed-40')$test$, '23514', null, 'system rejects null member nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,ARRAY['93000000-0000-4000-8000-000000000032']::uuid[],'system',null,null,'typed-40')$test$, '23514', null, 'system rejects ineligible nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,ARRAY['93000000-0000-4000-8000-000000000033']::uuid[],'system',null,null,'typed-40')$test$, '23514', null, 'system rejects cross-edition nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,ARRAY['93000000-0000-4000-8000-000000000034']::uuid[],'system',null,null,'typed-40')$test$, '23514', null, 'system rejects cross-category nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set',null,ARRAY['93000000-0000-4000-8000-000000000999']::uuid[],'system',null,null,'typed-40')$test$, '23514', null, 'system rejects unknown nominations');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner_set','93000000-0000-4000-8000-000000000010',ARRAY['93000000-0000-4000-8000-000000000030']::uuid[],'operator',null,null,'typed-40')$test$, '23514', null, 'set cannot carry arbitrary scalar winner');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'unresolved','winner_set',null,ARRAY['93000000-0000-4000-8000-000000000030']::uuid[],'operator',null,null,'typed-40')$test$, '23514', null, 'unresolved cannot carry settled winner set');

select throws_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'final','draw',null,ARRAY['93000000-0000-4000-8000-000000000030']::uuid[],'operator',null,null,'typed-40')$test$, '23514', null, 'draw cannot carry nomination set');

select lives_ok($test$insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_event_entry_id,winner_nomination_ids,source_type,source_observation_id,supersedes_result_id,idempotency_key) values ('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',1,'awarded','winner','93000000-0000-4000-8000-000000000010',null,'operator',null,null,'typed-40')$test$, 'existing scalar winner is compatible');


-- Real service command uses explicit synthetic scoped authority, not direct INSERT.
update event_runtime_control set global_stopped=false;
insert into event_operator_principals(id) values(md5('fixture-operator-27')::uuid);
insert into event_operator_credentials values(encode(extensions.digest('fixture-scoped-operator-27','sha256'),'hex'),md5('fixture-operator-27')::uuid,true,now()+interval '1 hour');
insert into event_operator_grants(principal_id,environment,event_edition_id,action)
values(md5('fixture-operator-27')::uuid,'local','93000000-0000-4000-8000-000000000004','result.record');
create function pg_temp.typed_result(v bigint,w jsonb) returns jsonb language sql as $$
select event_operator_command('fixture-scoped-operator-27','local','93000000-0000-4000-8000-000000000004','result.record',v,
'Synthetic typed correction',jsonb_build_object('contestId','93000000-0000-4000-8000-000000000006','status','awarded','outcome','winner-set','winnerEntryId',null,'winningNominationIds',w));
$$;

set local role service_role;

select throws_ok($test$insert into contest_results(contest_id,event_edition_id,version,result_status,outcome_type,source_type,idempotency_key) values('93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004',2,'awarded','pending','operator','forbidden-direct')$test$,'42501',null,'service direct result insertion denied');
select lives_ok($test$select pg_temp.typed_result(1,'["93000000-0000-4000-8000-000000000031","93000000-0000-4000-8000-000000000030"]')$test$, 'credentialed service correction appends tied nomination winners');

select ok((select winner_nomination_ids=ARRAY['93000000-0000-4000-8000-000000000030','93000000-0000-4000-8000-000000000031']::uuid[] and winner_event_entry_id is null from contest_results where id=(select id from contest_results where contest_id='93000000-0000-4000-8000-000000000006' and version=2)), 'set membership stored canonically without scalar coercion');

select ok(read_contest_result_typed((select id from contest_results where contest_id='93000000-0000-4000-8000-000000000006' and version=2))->>'status' = 'unsupported_format', 'legacy capability gets explicit unsupported format');

select ok(read_contest_result_typed((select id from contest_results where contest_id='93000000-0000-4000-8000-000000000006' and version=2),true)->>'outcomeType' = 'winner_set', 'typed reader retains winner-set semantics');

select ok(jsonb_array_length(read_contest_result_typed((select id from contest_results where contest_id='93000000-0000-4000-8000-000000000006' and version=2),true)->'winnerNominationIds')=2, 'typed reader exposes both nomination identities');

select throws_ok($test$update contest_results set winner_nomination_ids=ARRAY['93000000-0000-4000-8000-000000000030']::uuid[] where id=(select id from contest_results where contest_id='93000000-0000-4000-8000-000000000006' and version=2)$test$, '42501', null, 'service cannot mutate settled membership');

select throws_ok($test$delete from award_nominations where id='93000000-0000-4000-8000-000000000030'$test$, '42501', null, 'service cannot delete membership identity');

select throws_ok($test$truncate award_nominations cascade$test$, '42501', null, 'service cannot truncate identities');

select lives_ok($test$select pg_temp.typed_result(2,'["93000000-0000-4000-8000-000000000030"]')$test$, 'credentialed manual correction appends singleton set');

reset role;

select throws_ok($test$update award_nominations set eligible=false where id='93000000-0000-4000-8000-000000000030'$test$, '55000', null, 'immutable eligibility prevents historical membership drift');

select throws_ok($test$delete from award_nomination_credits where nomination_id='93000000-0000-4000-8000-000000000030'$test$, '55000', null, 'credits cannot be deleted');

select throws_ok($test$update contest_results set winner_nomination_ids=ARRAY['93000000-0000-4000-8000-000000000030']::uuid[] where id=(select id from contest_results where contest_id='93000000-0000-4000-8000-000000000006' and version=2)$test$, '55000', null, 'owner DML cannot rewrite historical set');

set local role anon;

select throws_ok($test$select * from award_nominations$test$, '42501', null, 'anon cannot read nominations');

select throws_ok($test$select * from award_nomination_credits$test$, '42501', null, 'anon cannot read credits');

select throws_ok($test$select read_contest_result_typed((select id from contest_results where contest_id='93000000-0000-4000-8000-000000000006' and version=2),true)$test$, '42501', null, 'anon cannot invoke privileged typed read');

select throws_ok($test$insert into award_nominations(contest_id,event_edition_id,nomination_key,name) values ('93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004','blocked','blocked')$test$, '42501', null, 'anon cannot write nominations');

reset role;

set local role authenticated;

select throws_ok($test$select * from award_nominations$test$, '42501', null, 'authenticated cannot read nominations');

select throws_ok($test$select * from award_nomination_credits$test$, '42501', null, 'authenticated cannot read credits');

select throws_ok($test$select read_contest_result_typed((select id from contest_results where contest_id='93000000-0000-4000-8000-000000000006' and version=2),true)$test$, '42501', null, 'authenticated cannot invoke privileged typed read');

select throws_ok($test$insert into award_nominations(contest_id,event_edition_id,nomination_key,name) values ('93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000004','blocked','blocked')$test$, '42501', null, 'authenticated cannot write nominations');

reset role;

select ok((select bool_and(relrowsecurity) from pg_class where oid in ('award_nominations'::regclass,'award_nomination_credits'::regclass)), 'new tables enable RLS');

select ok(not has_function_privilege('anon','validate_contest_result_nomination_set()','execute') and not has_function_privilege('authenticated','validate_award_nomination_category()','execute'), 'trigger helpers revoke client execution');

select * from finish();

rollback;
