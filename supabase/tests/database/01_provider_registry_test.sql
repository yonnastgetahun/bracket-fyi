begin;

select plan(1);

select has_table(
  'public',
  'data_providers',
  'canonical provider registry exists'
);

select * from finish();

rollback;
