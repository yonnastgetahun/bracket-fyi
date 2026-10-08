-- Run with:
-- psql "$DATABASE_URL" \
--   -v ON_ERROR_STOP=1 \
--   -v template_id='<reviewed-template-uuid>' \
--   -f supabase/backfills/20261008000001_legacy_template_results.sql
--
-- Eligibility is intentionally strict. A legacy result is copied only when:
--   1. its template match has an approved canonical contest link;
--   2. exactly one contest entry declares the winner's legacy identifier in
--      contest_entries.metadata.legacy_team_id;
--   3. linked legacy sources do not disagree about the canonical winner; and
--   4. the contest has no other canonical result history.
-- The function returns explicit counts and is safe to rerun.

begin;

-- If template_id was not provided, psql leaves the token unsubstituted and
-- PostgreSQL rejects the statement. There is no unbounded default.
select *
from backfill_legacy_template_results(:'template_id'::uuid);

commit;
