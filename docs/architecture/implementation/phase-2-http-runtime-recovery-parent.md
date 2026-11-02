# Parent HTTP/runtime recovery — 2026-10-28

## Criteria and authority
Parent recovery criteria recorded before changes in phase-2-parent-recovery-20261028.md. Parent sole DB execution owner; no shared DB restart/reset; local synthetic/fake-only. Original paused HTTP worker explicitly cancelled before takeover (04c0d114). Three new builders: security f0fcf7e4, transitions3f5aef90, runtime fixture e2dbcbb8; all prohibited from DB/Docker execution.

## Observed
- clear-cloud full pristine through00010:36 SQL files1123 assertions pass, DB bracket_regression_58f727cc3259.
- Incomplete HTTP state had zero applied migrations, no role/proc, no container and all ports free. Retained by rename to tmp/local-event-http-incomplete-1793215052; databases untouched.
- New HTTP DB bracket_http_3ff79a5ca427 through00010; authenticator catalog flags super/inherit/bypassRLS all false. Loopback Next3137, proxy54331, REST54332. Local preview1 / fake transport. Generated credentials remain only ignored private state.
- Initial HTTP404: Next failed to discover symlinked app directory. Replaced only isolated app symlink with copied route tree; launcher now copies app on new start, still uses safe environment allowlist. Restarted only owned local Next. Any later app source edits need copy refresh before exact-candidate verification.
- HTTP ran actual create/join/pick/privacy/lock/result actions. Initial privacy assertion false positive: basis.*participants regex matched allowed basisToken then public participants field. Replaced with recursive forbidden exact-key checks, preserving no private basis check.
- Further real HTTP test failed stale conflict expected409 got503; locked submit also took60 seconds and returned503. No broad acceptance claim. Docker reports REST container OOMKilled=true, exit137 at2026-10-28T19:22:43Z. Shared DB currently running/OOMKilled=false, restartcount13 (historical baseline not proof of stability). Parent did not restart sharedDB.
- Chrome isolated mobile390x844 catalog inspection rendered all9 templates, no horizontal overflow. Screenshot tmp/browser-acceptance/events-mobile.png. This is catalog-only, not9 completed UI journeys.
- New scripts/verify-event-browser.mjs implements actual UI interaction harness; NOT YET RUN. Needs inspection/fix of stale element handle after reload; dependencies resolve from existing user node_modules. No package dependency added.
- Runtime DB test: first failed invalid manifest; parent switched getEventDefinition to buildSyntheticManifest. Second reached lifecycle sweep but reconciled0/3 unavailable (DB bracket_runtime_60e01abbcbd5). Runtime fixture builder now owns test and diagnosis; don't edit concurrently.

## Pending
Collect docker processes warm-shell(example config) and plaid-valley(stats), assess isolated PostgREST memory/runtime options before restarting ONLY owned REST container. Existing Next supervisor still live; REST dead. Browser full journeys await healthy HTTP; no concurrent DB tests. Await3 new builders, execute deterministic security regressions and populated transitions serially, independent repair review, complete provider→DB→scorer proofs and exact-head PR. No commit/push/deploy/merge/purchases/real sends this continuation. Earlier980pass12skip is historical snapshot not final current evidence.

### Repair batch collected / parent continuation
- Security00011, populated PF-R1–R3, and runtime fixture repairs all returned; their DB claims initially unverified.
- Fresh authority harness PASS in bracket_no_authority_20a1c3e3289d:60 observed lock barriers, SQL assertions17+17, twice-applied forward repair. Source migration/repair SHA256 efc5c242e3c6f05430dc4b620165d0b9eabb156331ca15f5c6571000403a404c.
- Independent security review9056b8c2 and transition review59e8f293 active, read-only/noDB. Provider vertical proof builderd7296e5a owns NEW test/report only; browser harness repairb2ac7743 owns browser script/report only, neither may execute DB/browser.
- Parent updated runtime DB test pin through00011. Focused runtime17pass/1skip; combined current981pass12skip. Production build and typecheck pass. These precede subsequent independent edits and are not exact-head proof.
- Added ESLint tmp/** exclusion for generated disposable Next preview. Fixed two genuine lint errors in template-seed-repository fake client; its4tests pass, types/source lint rerun pending.
- /tmp/bracket-http-layer-probe.py: directSQL stale request rejected in0.285s; REST timesout10s. pg_stat_activity shows repeated short active prior REST query and second blocked on transaction. Minimal40001vsPT409 oracle executing; independent design review0afc1429 pending. Typecheck/lint now pass (0errors13warnings).
- Parent remains sole DB executor; no shared DB restart/reset or unrelated Docker stop. No publication/deployment/real sends.
- Runtime full DB PASS through00011 in bracket_runtime_69221f9e0936:2tests, real scorer→four producers→default stop→authorized four fake sends→dedup/restart→restop.
- Transition --through20261027000011 currently running process cool-shoal (no output until end). Do not run another DB lane concurrently or mutate its fixture/test inputs.
- Minimal REST oracle confirms PT409→HTTP409 in0.010s vs40001→timeout4.001s; ONLY own REST container restarted before/after oracle. See phase-2-http-conflict-diagnosis.md. Next: design reviewer result, durable non-retryable business-conflict fix (new migration), mappings and tests, independent review then exact final HTTP/UI/SQL acceptance.
- Completed processes: oceanic-nudibranch securityPASS; marine-shore17runtimePASS1skip; mellow-ocean981PASS12skip; vivid-falcon typesPASS; brisk-zephyr buildPASS; nimble-shoal initial lintFAIL generated tmp+2real errors; keen-ember showed2real errors; faint-falcon typed fixture4PASS/typesPASS/lint0errors13warnings; swift-shoal layer probe; cool-comet invalid example commandFAIL(noDBeffect); nimble-falcon minimaloraclePASS; briny-nexus real runtimePASS. All collected.
- Parent source changes this continuation: runtime DB migration pin11; eslint tmp/** ignore; typed FakeClient closure/methods in template-seed-repository.test.ts. Parent task/checkpoint docs updated. Browser script currently child-owned; do not edit concurrently.

### Follow-up observed
- Docker stats shows hundreds of unrelated running containers, typically10–22MiB each, shared VM7.75GiB. Do not stop unrelated containers. Statistics command completed.
- Cached PostgREST --example completed; no transaction retry knob shown. Search unavailable429.
- Retained exited REST container, launched own replacement bracket-http-rest-3ff79a5ca427-bounded with512MiB memory/swap cap,1CPU,GHCRTS -N1 -M256m andpool2, same existing disposableHTTP DB and credential file. It returned readiness200. Launcher source still needs these defaults after diagnosis.
- Direct REST stale mutate probe (/tmp/bracket-http-conflict-probe.py) bypassed proxy/Next and timed out12seconds; no accepted409. A preceding SQL read failed once, then succeeded. This suggests failure below Next; root cause unresolved.
- Tightened locked-submit HTTP assertion from merely non200 to exact409, so503 cannot masquerade as acceptance. Browser stale element lookup adjusted but harness still unrun.
- Parent diagnostic files contain only synthetic identifiers/queries; actual local credentials are read into memory, never emitted.

### Review batch collected
- Independent security and populated-transition source reviews accept with runtime limits; provider and browser harnesses returned and await parent execution.
- PT409 design accepted. Builder d68da3cc owns additive00012, forward repair, mappings and focused regression; no DB execution.
- P3 barrier readiness unbounded-read issue delegated eaa106cd; no DB execution.
- Parent launcher now encodes observed bounded REST settings: pool2,512MiB memory/swap,1CPU,GHCRTS -N1 -M256m. This is resource containment, not the conflict fix.
- cool-shoal still running through11; parent retains serial DB lane.

### Durable repair batch collected
- Both children settled: additive00012/PT409 repair and P3 nonblocking readiness fix. No DB execution by either child.
-00012 builder reports50focused tests/typecheck/lint; P3 builder reports8subprocess regressions. Parent runtime acceptance pending.
- Independent00012 review9ea464e6 and full-scope/P11 residual audit70029773 active, read-only/noDB.
- Through11 transition has advanced from fresh to legacy lane; no shared assertion/fixture edits until terminal result. Next integrate target-aware historical40001/currentPT409 assertions, then serial final-schema/provider/HTTP/browser proof.
- Parent current nonDB snapshot:997tests PASS/13opt-in skipped; readiness8/8 PASS; types PASS; lint0errors13warnings; production build PASS. Processes tender-trail/gentle-bloom/marine-basil collected.
- Prepared (NOT EXECUTED) /tmp/bracket-integrate-pt409-assertions.py: eight explicit SQL files + incarnation-held fixture + transition runner dispatch; must wait for cool-shoal completion before running. Final SQL defaults PT409, historical runner explicitly sets bracket.test_business_sqlstate=40001.
- Prepared (NOT EXECUTED) /tmp/bracket-upgrade-owned-http.py: exact owned DB bracket_http_3ff79a5ca427 additive missing migrations through12, local copied-app refresh and PostgREST schema notification. No restart/reset.
- Race integration child513232d3 owns three race scripts only (lifecycle/incarnation/independent-window-lifecycle), adds explicit disposable DB and expected-code options; noDB. Await completion before executing them.
