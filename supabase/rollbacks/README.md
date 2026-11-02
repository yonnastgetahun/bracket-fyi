Rollback scripts are retained here for operator-reviewed rollback procedures.

They must not live under `supabase/migrations/`, where the Supabase CLI treats
every timestamp-prefixed SQL file as a forward migration. Apply a rollback only
after validating its target migration, data-loss impact, and approval gate.
