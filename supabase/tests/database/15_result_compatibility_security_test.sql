begin;

select plan(5);

select ok(
  not has_function_privilege(
    'anon',
    'public.resolve_effective_results(uuid)',
    'execute'
  ),
  'anonymous callers cannot invoke the server-side result resolver directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.resolve_effective_results(uuid)',
    'execute'
  ),
  'authenticated browser callers cannot invoke the server-side result resolver directly'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.backfill_legacy_template_results(uuid)',
    'execute'
  ),
  'anonymous callers cannot invoke result backfill tooling'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.resolve_effective_results(uuid)',
    'execute'
  ),
  'the server-side service role can invoke the result resolver'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.backfill_legacy_template_results(uuid)',
    'execute'
  ),
  'the server-side service role can invoke bounded backfill tooling'
);

select * from finish();

rollback;
