-- ============================================================
-- Migration 005: VAPID RPC for push notifications
-- DO NOT APPLY until VAPID keys are generated and stored in Vault.
-- See supabase/functions/notify/SETUP.md for generation instructions.
-- ============================================================

create or replace function get_vapid_keys()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keys text;
begin
  -- Requires vault.decrypted_secrets to be populated with 'vapid_keys_jwk'.
  -- Only callable by service role (revoke/grant below enforce this).
  select decrypted_secret
  into v_keys
  from vault.decrypted_secrets
  where name = 'vapid_keys_jwk'
  limit 1;

  if v_keys is null then
    raise exception 'VAPID keys not found in vault. Run the setup steps in supabase/functions/notify/SETUP.md first.';
  end if;

  return v_keys;
end;
$$;

-- Lock down execution to service_role only. Explicit revokes for anon and
-- authenticated because SECURITY DEFINER functions leak the return value to
-- any caller — anon/authenticated must not be able to invoke this.
revoke all on function get_vapid_keys() from public;
revoke all on function get_vapid_keys() from anon;
revoke all on function get_vapid_keys() from authenticated;
grant execute on function get_vapid_keys() to service_role;
