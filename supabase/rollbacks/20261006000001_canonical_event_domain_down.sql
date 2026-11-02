-- Operator-reviewed rollback for Slice 1A.
-- Destructive once canonical data exists; prefer a forward repair after deployment.

drop trigger if exists template_edition_change_trigger on templates;
drop trigger if exists template_match_contest_edition_trigger on template_matches;
drop function if exists enforce_template_edition_change();
drop function if exists enforce_template_match_contest_edition();

alter table template_matches
  drop column if exists counts_toward_completion,
  drop column if exists contest_id;

alter table templates
  drop column if exists event_edition_id;

drop table if exists bracket_edges cascade;
drop table if exists brackets cascade;
drop table if exists contest_entries cascade;
drop table if exists contests cascade;
drop table if exists rounds cascade;
drop table if exists stages cascade;
drop table if exists event_entries cascade;
drop table if exists competitor_aliases cascade;
drop table if exists competitors cascade;
drop table if exists event_editions cascade;
drop table if exists competitions cascade;
drop table if exists organizations cascade;
drop table if exists data_providers cascade;
