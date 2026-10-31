-- Additive forward repair, never a down migration. Retains registry, audit,
-- mappings, results, reviewed manifests, permits and all user data.
-- Already-issued/uncertain requests remain outstanding: stopping is not draining.
begin;
select singleton from public.event_runtime_control where singleton for update;
update public.event_runtime_control set global_stopped=true,version=version+1 where singleton;
do $$
declare t text; f regprocedure;
begin
 foreach t in array array['event_operator_principals','event_operator_credentials','event_operator_grants','event_runtime_control',
 'event_operator_audit','event_operator_manifests','event_provider_attempts'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('operator_upsert_provider_entity_mapping','assert_event_operator','project_provider_result_before_operator_controls','project_structural_observation_before_operator_controls') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
 end loop;
end $$;
revoke all on function public.set_event_notification_control(boolean,boolean) from public,anon,authenticated,service_role;
revoke insert on public.contest_results from service_role;
revoke insert,update,delete,truncate on public.provider_entity_refs from service_role;
commit;
