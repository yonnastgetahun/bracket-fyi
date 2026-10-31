# P11 runtime continuation

Existing full-scope criteria remain in phase-2-continuation-20261028-p11.md; no delivery acceptance yet.

## Collected
Four prior builders settled: rename migration13, own recovery handoff, browser lane expansion, numerical feasibility. Source integration:1033 PASS/13 opt-in skips, TypeScript PASS, production build PASS. Lint0errors14warnings; parent removed new unused browser import and targeted lint PASS, leaving13 known warnings. Readiness8/8 and browser oracle4/4 PASS. No publication/deployment.

## Runtime observed / terminal processes
- Owned HTTP helper applied11/12/13, refreshed copied app, schema reload on shared DB. No shared reset/restart.
- Provider vertical runtime PASS3tests, retained bracket_provider_vertical_365c6e8e312a. quick-kelp terminal0.
- Parent erroneously reused populated provider DB for empty-schema full suite:39files/9failures, explained by retained rows/duplicate fixture IDs. young-atlas terminal1. Do not weaken tests or count as valid clean regression. Logs /tmp/bracket-p11-suite-*.
- Fresh sharedDB rehearsal bracket_final_sql_39177846f414 interrupted during migration; rapid-breeze terminal1. Shared restart count15→16. Docker events prove OOM then die137 then start at1793217518/1793217531. VM8322945024bytes/4CPU/308 running containers. No unrelated container stopped, no shared restart/config change.
- Started own cached-image DB bracket-p11-db-9bd170c85c0f,512MiB memory+swap cap,1CPU,network none,shared_buffers64MB/max_connections30. Same postgres17.6.1.147 image. Private env/state under ignored tmp/p11-isolated-db. No port publication.
- Fresh isolated SQL PASS39files/1163assertions after all36 migrations through13. DB bracket_final_sql_395f48a82dad. briny-pine terminal0. /tmp/bracket-p11-fresh-suite.py; tmp/p11-fresh-sql-result.json; /tmp/bracket-fresh-*.log.
- Added validated BRACKET_TEST_DB_CONTAINER environment override to three current race scripts: window-lifecycle-independent-review, event-lifecycle-races, window-incarnation-races. Only shared known name or bracket-p11-db-12hex allowed; default unchanged. pycompilePASS.
- Isolated independent race attempt wild-glade-2 terminalFAIL60s docker exec timeout while DB32 supporting test, afterDB31PASS; actual barriers not reached. Separate own REST container inspect crisp-slug terminalFAIL12s timeout. Thus Docker-wide availability remains blocker despite isolated SQL success.
- /tmp/bracket-retarget-owned-http.py PREPARED NOT RUN. Creates fresh HTTP DB/auth role on isolated container, applies all migrations, connects only own DB to existing network, verifies/stops only exact own REST bounded container, creates isolatedREST on54332 with existing private creds, updates state. Inspect before execute; requires healthyDocker. Old/shared HTTP data preserved; new target fresh. Current owned old REST name bracket-http-rest-3ff79a5ca427-bounded (label still must verify). Do not execute during otherDB lane.

## New active children (no runtime)
- ac7b035b /23076bf3: independent read-only rename/recovery/numeric review.
- de388bec /d3e5b039: new legacy and event recovery browser runners.
- 861ffb06 /7b518b20: new private shared/later durable fixture seeder.
- 892304b6 /35760ce4: owns transition runner and migration13 populated checkpoint. Do not run/edit inputs until settles. Needs explicit isolated container support after return (currently hardcoded shared).
- 774ace75 /3a7232a8: full UCL13/211 andWWC7/64 UI journey runner, new files only.
All ordinary announcing children: wait for NEW batch completion events, not prior settled four.

## Next
Collect/review children and fix findings. Need runtime readiness; no globalDocker/shared restart/unrelated container cleanup authorized. Once healthy, verify isolatedDB restart0/SQL readiness, rerun current races, execute inspected HTTP retarget helper, HTTPnine/browsernine, seed and execute shared/later/recovery/legacy/PWA/full-window journeys. Populated transition through13 after builder returns and target adaptation. Need exact-head final checks/skeptical evidence/scoped PR. No merge/deploy/purchases/real sends. Puppeteer/Chrome present. Remaining failures may require host capacity decision if Docker cannot sustain bounded probes, but continue independent authorized work.
