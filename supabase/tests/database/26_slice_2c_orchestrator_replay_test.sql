begin;

select plan(12);

insert into data_providers (id, adapter_key, display_name)
values ('c6000000-0000-4000-8000-000000000001', 'slice-2c-6-synthetic', 'Slice 2C.6 Synthetic');
insert into organizations (id, organization_key, name, kind)
values ('c6000000-0000-4000-8000-000000000002', 'slice-2c-6-org', 'Slice 2C.6 Organization', 'league');
insert into competitions (id, organization_id, competition_key, name, domain)
values ('c6000000-0000-4000-8000-000000000003', 'c6000000-0000-4000-8000-000000000002', 'slice-2c-6-event', 'Slice 2C.6 Event', 'hybrid');
insert into event_editions (id, competition_id, edition_key, name, season_label)
values ('c6000000-0000-4000-8000-000000000004', 'c6000000-0000-4000-8000-000000000003', '2026', 'Slice 2C.6 2026', '2026');
insert into provider_bindings (
  id, provider_id, event_edition_id, binding_key, mode, health_status, next_poll_at, provider_cursor
) values (
  'c6000000-0000-4000-8000-000000000005', 'c6000000-0000-4000-8000-000000000001',
  'c6000000-0000-4000-8000-000000000004', 'synthetic-replay', 'write', 'healthy', now(), '{}'::jsonb
);

create temporary table replay_claim as
select * from claim_due_ingestion_run('slice-2c-6-replay', now(), 'worker-2c-6', 900);
select is((select count(*) from replay_claim), 1::bigint, 'synthetic due binding is claimed once');
select ok((select lease_acquired from replay_claim), 'replay worker owns the lease');
select lives_ok(
  $$ select * from start_ingestion_run((select run_id from replay_claim), (select lease_token from replay_claim), now()) $$,
  'synthetic replay starts'
);

create temporary table sports_page as
select * from commit_ingestion_page(
  (select run_id from replay_claim), (select lease_token from replay_claim),
  slice_2c_page_key('c6000000-0000-4000-8000-000000000005', 0, '{}'::jsonb, null),
  0, '{}'::jsonb, null, '{"page":1}'::jsonb, 'sports-etag', 3, 3, 2, 1, 0, 0, 0
);
select is((select outcome from sports_page), 'committed', 'sports-shaped page commits');

create temporary table sports_replay as
select * from commit_ingestion_page(
  (select run_id from replay_claim), (select lease_token from replay_claim),
  slice_2c_page_key('c6000000-0000-4000-8000-000000000005', 0, '{}'::jsonb, null),
  0, '{}'::jsonb, null, '{"page":1}'::jsonb, 'sports-etag', 3, 3, 2, 1, 0, 0, 0
);
select is((select outcome from sports_replay), 'replayed', 'exact sports replay is idempotent');
select is((select count(*) from ingestion_page_ledger), 1::bigint, 'exact replay creates no duplicate page ledger row');

create temporary table ceremony_page as
select * from commit_ingestion_page(
  (select run_id from replay_claim), (select lease_token from replay_claim),
  slice_2c_page_key('c6000000-0000-4000-8000-000000000005', 1, '{"page":1}'::jsonb, 'sports-etag'),
  1, '{"page":1}'::jsonb, 'sports-etag', '{"page":2}'::jsonb, 'ceremony-etag', 2, 2, 1, 1, 0, 0, 0
);
select is((select outcome from ceremony_page), 'committed', 'ceremony-shaped continuation commits');
select is((select checkpoint_generation from ceremony_page), 2::bigint, 'continuation advances checkpoint generation');
select is((select count(*) from ingestion_page_ledger), 2::bigint, 'materially different pages retain two ledger rows');
select is((select normalized_count from ingestion_runs where id = (select run_id from replay_claim)), 5, 'aggregate normalized count excludes exact replay');

select lives_ok(
  $$ select * from finish_ingestion_run(
    (select run_id from replay_claim), (select lease_token from replay_claim), 'succeeded', now(),
    null, null, true, null, null, '{"fixtures":["sports","ceremony"]}'::jsonb
  ) $$,
  'synthetic replay finishes through the sole finish boundary'
);
select is(
  (select row(ir.status, pb.health_status, pb.next_poll_at)
   from ingestion_runs ir join provider_bindings pb on pb.id = ir.binding_id
   where ir.id = (select run_id from replay_claim)),
  row('succeeded'::text, 'healthy'::text, null::timestamptz),
  'successful replay is healthy and explicitly unscheduled'
);

select * from finish();
rollback;
