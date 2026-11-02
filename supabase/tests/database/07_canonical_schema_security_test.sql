begin;

select plan(3);

select is(
  (
    select count(*)
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in (
        'data_providers',
        'organizations',
        'competitions',
        'event_editions',
        'competitors',
        'competitor_aliases',
        'event_entries',
        'stages',
        'rounds',
        'contests',
        'contest_entries',
        'brackets',
        'bracket_edges'
      )
      and relrowsecurity
  ),
  13::bigint,
  'all canonical Slice 1A tables have row level security enabled'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'data_providers',
        'organizations',
        'competitions',
        'event_editions',
        'competitors',
        'competitor_aliases',
        'event_entries',
        'stages',
        'rounds',
        'contests',
        'contest_entries',
        'brackets',
        'bracket_edges'
      )
  ),
  0::bigint,
  'canonical tables expose no anonymous policy by default'
);

select throws_ok(
  $$
    set local role anon;
    insert into data_providers (adapter_key, display_name)
    values ('unapproved-provider', 'Unapproved Provider')
  $$,
  '42501',
  null,
  'anonymous callers cannot write canonical provider state'
);

select * from finish();

rollback;
