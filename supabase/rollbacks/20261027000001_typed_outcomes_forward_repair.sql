-- Data-preserving emergency forward repair; run only AFTER typed_outcomes.
-- Never drop nominations, membership, evidence, or narrow the outcome CHECK.
-- Stop future winner-set admissions while preserving all committed set results
-- and capability-gated reads. Old scalar/draw/pending/no_contest inserts work.
-- App operators must disable winner-set activation while repairing consumers.
begin;
create or replace function public.pause_winner_set_admission()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.outcome_type = 'winner_set' then
    raise exception 'winner_set admission paused for forward repair' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function public.pause_winner_set_admission() from public, anon, authenticated, service_role;
drop trigger if exists pause_winner_set_admission on public.contest_results;
create trigger pause_winner_set_admission before insert on public.contest_results
for each row execute function public.pause_winner_set_admission();
commit;
-- Resume only in a reviewed forward migration after reader/ingestion repair:
-- DROP TRIGGER pause_winner_set_admission ON public.contest_results;
-- Retain the typed schema and historical rows.
