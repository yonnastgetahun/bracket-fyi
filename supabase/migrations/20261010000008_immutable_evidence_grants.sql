-- Fresh Supabase databases may apply default service_role table privileges
-- before the Slice 1B selective grants. Remove mutation privileges explicitly
-- so immutable evidence can only be inserted and read by the service role.

revoke update, delete, truncate, references, trigger on table
  public.provider_observations,
  public.contest_results,
  public.result_audit_events
from service_role;

grant select, insert on table
  public.provider_observations,
  public.contest_results,
  public.result_audit_events
to service_role;
