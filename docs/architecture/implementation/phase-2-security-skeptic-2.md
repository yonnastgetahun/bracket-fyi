# Phase 2 security skeptic 2 — independent disproof attempt

2026-10-27. Scope: SEC-01/02/03 and GAP-01; repository → dispatcher → projection reachability and bootstrap authority. Reviewer 2/3; this is independent evidence, not a three-reviewer acceptance decision. **Verdict: ITERATE.**

Only this report is written. No repairs, schema changes, provider/network requests, or deployment inspection. Local Docker PostgreSQL only; original synthetic fixtures in explicit BEGIN/ROLLBACK transactions. Failed intermediate probes exited their connection with uncommitted transactions (automatic rollback). No actual bearer values were selected: credential assertions compare synthetic sentinels to booleans.

Acceptance criteria for this review: inspect current implementation and actual local grants; attempt contrary explanations; reproduce or narrow each claim; distinguish local results from deployed exposure.

## Dispositions

### SEC-01 — CONFIRMED authority defect; reachability narrowed

Actual modules executed in memory with jiti (filesystem/module cache disabled); mocked RPC echoes precisely the repository's outgoing metadata. Input normalizationVersion=`unsupported-synthetic-version`, metadata.verifiedDeterministicBootstrap=false, arbitrary wrong canonical association. Output:
```
metadata = {"verifiedDeterministicBootstrap":true,"normalizationPolicyVersion":"unsupported-synthetic-version"}
repository → resolver: status=automatic, canonicalId=wrong-eligible-id
negative control (same automatic ref without provenance): unresolved / mapping_ambiguous
```

The Boolean is manufactured at /Users/yonnasgetahun/bracket-fyi/lib/ingestion/identity/repository.ts:150; read conversion at :84 accepts it plus nonblank version. /Users/yonnasgetahun/bracket-fyi/lib/ingestion/identity/resolve.ts:85 checks neither supported policy nor evidence of derivation. Thus provenance-free inputs pass after repository laundering despite a working standalone negative guard.

**Attempted disproof:** RPC caller is trusted service_role; existing reviewed/rejected decisions resist automatic replacement; binding determines provider/edition in SQL rather than trusting redundant input fields. These meaningfully narrow severity/reach. Actual local anon/authenticated EXECUTE=false on upsert_provider_entity_mapping, service_role=true. Search of lib and scripts found no application call site invoking recordAutomatic outside its definition/interface; no browser-to-recordAutomatic exploit established. This is a privileged/bootstrap API integrity defect and potential future caller hazard, not proof of active production corruption. SQL accepts a new arbitrary external organization → eligible canonical organization with empty metadata in SEC-02 below, so SQL does not repair the manufactured authority. Existing reviewed mappings and wrong-edition constraints do not validate a new semantically wrong association.

### SEC-02 — CONFIRMED through actual local service-role RPC

Original synthetic provider, organization, competition, edition, binding, run. No forged direct provenance table writes. With SET LOCAL ROLE service_role:
```
upsert_provider_entity_mapping(... automatic ..., metadata={})
  → created | automatic | {}
project_structural_observation(observation)
  shadow mode → skipped_non_write
  write mode → projected
canonical organization name changed to synthetic unverified observation name → true
ROLLBACK
```

Thus browser grant restrictions and write-mode gating work, but are not a provenance gate. The same empty-metadata automatic reference is rejected by standalone resolver yet accepted by the authoritative projector. Canonical mutation is demonstrated locally, not inferred from a status string.

Reachability: /Users/yonnasgetahun/bracket-fyi/lib/ingestion/orchestrator/observation-dispatch.ts:58 validates schema, records immutable evidence, skips shadow, then calls structural.projectObservation directly (:80); /Users/yonnasgetahun/bracket-fyi/lib/ingestion/projection/structural-repository.ts:32 invokes project_structural_observation. No resolver is in that path. /Users/yonnasgetahun/bracket-fyi/supabase/migrations/20261009000004_slice_2b_r2_acceptance.sql:232 root reference and :304/:333/:356 parent references accept status automatic/reviewed without bootstrap metadata.

**Counterevidence:** actual root helper EXECUTE=false even for service_role; public wrapper EXECUTE=true only for service_role, not anon/authenticated. Probe used that wrapper, not the protected helper. Stale timestamp, binding mode, canonical existence, scope and parent-consistency guards remain real; the probe satisfies them rather than disabling them. No HTTP dispatcher-to-DB execution claimed: dispatcher/repository link is source-traced, real DB wrapper and mutation are runtime-proven.

### SEC-03 — CONFIRMED actual local credential exposure and cross-participant insert

Actual roles anon/authenticated: nonsuperuser, BYPASSRLS=false. Tables leagues/participants/picks have RLS enabled and SELECT grants to both roles. Existing SELECT policies target anon, not authenticated. Under anon with synthetic league join header:
```
organizer_token equals synthetic organizer sentinel → true
victim magic_token equals synthetic victim sentinel → true
victim push_subscription endpoint equals synthetic sentinel → true
insert pick for that victim using join header only → INSERT 0 1
privileged count of forged synthetic pick → 1
```

Negative control with request.headers={} on base picks → count 0. Table RLS is active; row predicates authorize the entire credential-bearing row. Safe Next DTO projections do not protect direct SQL/PostgREST column selection. The insert succeeds without victim magic token because picks_insert checks league join access only.

Sources: /Users/yonnasgetahun/bracket-fyi/supabase/migrations/20260724000002_rls_policies.sql:60–86 and :125 onward; inspected actual pg_policies matches. Only original synthetic league/participant rows were queried.

**Narrowing:** authenticated role has grants but no matching table policies shown; do not describe authenticated direct-table exploitation as proven. Cross-participant same-league insert proven; cross-league mismatch was not tested. No deployed grants, HTTP exposure, real tokens, or deployed exploit tested.

### GAP-01 — PARTIAL: blanket private-pick bypass disproved in this local candidate; effective_results exposure confirmed

Actual four views are postgres-owned, reloptions NULL (not security_invoker), anon/authenticated SELECT=true. postgres BYPASSRLS=true. However the current v_pick_results, v_champion_status and v_leaderboard depend on resolve_effective_results, whose EXECUTE grant is false for anon/authenticated, true for service_role.

No-token anon queries for synthetic private pick, champion, and leaderboard each failed:
```
ERROR: permission denied for function resolve_effective_results
```
Savepoints isolated each error. These are material contrary evidence: broad view grants alone do not prove current private-pick read success. Treat those three paths as blocked in tested queries, not confirmed leaks. This is not a comprehensive proof against every planner/query shape.

But effective_results is a direct owner-rights join with no function check. Synthetic pre-lock league override winner read without any token:
```
select count(*) from effective_results
where league_id=<synthetic league> and winner_team_id='synthetic-private-result'
→ 1
```
Base picks no-token count remained 0. Thus owner-rights bypass of league-scoped result privacy is runtime-confirmed for effective_results; it does not establish private-pick disclosure. Actual view definitions and function privileges were inspected, not inferred solely from migration history. Current protected scoring-view behavior is more restrictive than the original report's grant-only concern.

## Verification details and limits

Commands were routed through /Users/yonnasgetahun/clawd/bin/exec with full-command shell quoting (wrapper resets cwd). SQL ran via Python subprocess input to:
```
docker exec -i supabase_db_bracket-fyi psql -X -U postgres -d postgres -At
```
Catalog inspection used pg_roles, pg_class, pg_policies, pg_views, has_table_privilege and has_function_privilege. An initial misquoted rg command, absent esbuild loader, jiti export mismatch and incorrect view column were corrected; none are passing evidence. Initial view query revealed the function guard and was retested with savepoints instead of suppressing its meaning. No test files, schemas or fixtures persist. No full suite/build claimed.

changed: this independent report only.
matters: privileged provenance defects and local direct-data exposure proven; current scoring-view function guard narrows GAP-01.
checks: actual local catalogs; in-memory actual TS modules; rollback-only service-role projection and anon synthetic tenant probes.
risk: deployment and HTTP reachability uninspected; SQL parent-path variants not independently replayed; three-reviewer requirement remains parent-owned.
verdict: **iterate**.

## Reproduction appendix — original local SQL

Run only against the disposable local database; no deployed URL. These scripts create original synthetic fixtures and roll back. Privacy script deliberately allows errors because three expected function-permission failures are isolated with savepoints.

### Provenance and mode control

```sql
begin;
insert into data_providers(id,adapter_key,display_name) values('a2100000-0000-4000-8000-000000000001','skeptic2','synthetic');
insert into organizations(id,organization_key,name,kind) values('a2100000-0000-4000-8000-000000000002','skeptic2','Original','league');
insert into competitions(id,organization_id,competition_key,name,domain,sport_code) values('a2100000-0000-4000-8000-000000000003','a2100000-0000-4000-8000-000000000002','skeptic2','synthetic','sport','synthetic');
insert into event_editions(id,competition_id,edition_key,name,season_label) values('a2100000-0000-4000-8000-000000000004','a2100000-0000-4000-8000-000000000003','skeptic2','synthetic','2026');
insert into provider_bindings(id,provider_id,event_edition_id,binding_key,mode,health_status) values('a2100000-0000-4000-8000-000000000005','a2100000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000004','skeptic2','write','healthy');
insert into ingestion_runs(id,binding_id,provider_id,event_edition_id,claim_key,trigger_kind,claimed_by,lease_expires_at) values('a2100000-0000-4000-8000-000000000006','a2100000-0000-4000-8000-000000000005','a2100000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000004','skeptic2','replay','skeptic2',now()+interval '10 minutes');
update provider_bindings set mode='shadow' where id='a2100000-0000-4000-8000-000000000005';
set local role service_role;
select 'mapping',outcome,resolution_status,metadata from upsert_provider_entity_mapping('a2100000-0000-4000-8000-000000000005','organization','wrong-organization','a2100000-0000-4000-8000-000000000002','automatic',1,null,null,'{}');
select observation_id as obs from record_provider_observation('a2100000-0000-4000-8000-000000000006','a2100000-0000-4000-8000-000000000005','organization','wrong-organization','synthetic-1',now(),now(),1,'{"synthetic":true}',jsonb_build_object('contractVersion','slice-2a-v1','adapterKey','skeptic2','adapterConfigVersion',1,'normalizationPolicyVersion','identity-normalization-v1','completeness','full','semanticHash',repeat('1',64),'normalizedEntity',jsonb_build_object('name','Unverified rewrite','organizationKind','league','metadata','{}'::jsonb))) \gset
select 'shadow_control',outcome from project_structural_observation(:'obs');
reset role;
update provider_bindings set mode='write' where id='a2100000-0000-4000-8000-000000000005';
set local role service_role;
select 'write_projection',outcome from project_structural_observation(:'obs');
reset role;
select 'canonical_write',name='Unverified rewrite' from organizations where id='a2100000-0000-4000-8000-000000000002';
rollback;
```

### Direct-role privacy and expected scoring-view denials

```sql
begin;
insert into templates(id,name,type) values('a2000000-0000-4000-8000-000000000001','skeptic2 synthetic','bracket');
insert into leagues(id,name,template_id,organizer_token,join_token) values('a2000000-0000-4000-8000-000000000002','skeptic2 tenant','a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000004');
insert into participants(id,league_id,display_name,magic_token,push_subscription) values('a2000000-0000-4000-8000-000000000005','a2000000-0000-4000-8000-000000000002','synthetic victim','a2000000-0000-4000-8000-000000000006','{"endpoint":"synthetic-sentinel"}');
insert into picks(league_id,participant_id,slot_id,team_id) values('a2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000005','champion','synthetic-private');
insert into template_matches(id,template_id,round,match_number,home_slot,away_slot) values('a2000000-0000-4000-8000-000000000007','a2000000-0000-4000-8000-000000000001',1,1,'home','away');
insert into picks(league_id,participant_id,slot_id,team_id) values('a2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000005','a2000000-0000-4000-8000-000000000007','synthetic-private');
insert into league_result_overrides(league_id,template_match_id,winner_team_id) values('a2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000007','synthetic-private-result');
set local role anon;
set local request.headers='{}';
select 'no_token_effective_result',count(*) from effective_results where league_id='a2000000-0000-4000-8000-000000000002' and winner_team_id='synthetic-private-result';
select 'no_token_base_picks',count(*) from picks where league_id='a2000000-0000-4000-8000-000000000002';
savepoint view_probe;
select 'no_token_view',count(*) from v_pick_results where league_id='a2000000-0000-4000-8000-000000000002' and picked_team_id='synthetic-private';
rollback to view_probe;
select 'no_token_champion',count(*) from v_champion_status where league_id='a2000000-0000-4000-8000-000000000002';
rollback to view_probe;
select 'no_token_leaderboard',count(*) from v_leaderboard where league_id='a2000000-0000-4000-8000-000000000002';
rollback to view_probe;
set local request.headers='{"x-league-token":"a2000000-0000-4000-8000-000000000004"}';
select 'join_organizer_exposed',organizer_token='a2000000-0000-4000-8000-000000000003' from leagues where id='a2000000-0000-4000-8000-000000000002';
select 'join_victim_credentials',magic_token='a2000000-0000-4000-8000-000000000006',push_subscription->>'endpoint'='synthetic-sentinel' from participants where id='a2000000-0000-4000-8000-000000000005';
insert into picks(league_id,participant_id,slot_id,team_id) values('a2000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000005','unauthorized-slot','synthetic-forged');
reset role;
select 'cross_participant_insert',count(*) from picks where league_id='a2000000-0000-4000-8000-000000000002' and team_id='synthetic-forged';
rollback;
```
