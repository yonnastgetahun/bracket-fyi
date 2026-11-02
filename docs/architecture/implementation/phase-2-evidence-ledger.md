# Phase 2 execution ledger
Approved scope: [execution plan](phase-2-orchestrated-execution-plan.md), [spec v1.0](../bracket-fyi-spec-v1.0.md). Started 2026-10-27; integration owner: dedicated Phase 2 session. Verdict: ITERATE full scope; preparatory draft PR #4 published.

## Current acceptance — reconciled retained evidence, 2026-10-30
**Historical pre-publication snapshot; see published-draft closeout below. ITERATE full scope.** Candidate was based on committed P1 checkpoint `3ca08fbd7d3cfa5266a2114ab3bb3f9f391d83e8`; working-tree evidence is not tested-commit publication.

- Actual nine full manual/synthetic journeys are credited: seven-family 122 scored + 12 structural, plus UCL 211/13 and WWC 64/7. [Final integration review](phase-2-final-integration-review.md), [family evidence](family-runtime-evidence.json).
- Provider SQL supersedes the earlier 13/2 bundle: **15 passed, 0 failed, 0 skipped**, including all five SQL scenarios and their downstream replay/quarantine/auth/zero-send checks. [Runtime](final-numeric-runtime.md), [durable evidence](final-numeric-runtime-evidence.json). Eleven before/after hashes matched the earlier reconciliation snapshot; retained bundle equals original artifact. Later FD04 source changes require final affected-evidence rebinding.
- Trusted numeric is **9/12 persisted and rendered**, not complete. Remaining WWC reviewed 48-of-64, reviewed 64-of-64 and original unknown-placement checkpoints failed to execute after shared-VM memory pressure; failed artifact stays failed. Six Play-In states, eliminated/forfeited and trusted/unknown UCL were observed passing. Both full SQL and browser modes must finish.
- Latest repaired SQL candidate: **1,166/1,166 assertions**, 39 SQL files after 38 migrations; direct psql/pgTAP, not Supabase CLI execution. Through-15 fresh/populated-legacy/populated-current transitions: **2,429/2,429 assertions**, zero failures. [DB38 repair and independent acceptance](phase-2-db38-final-repair.md), [exact source/evidence manifest](phase-2-db38-final-repair-evidence.json). This supersedes the historical two DB38 failures and pending through-15 matrix, without rewriting those reports.
- FD04 **bounded source contract accepted**: first rejected row/envelope creates an immutable-observation/quarantine RPC witness for the entire rejected batch; no prefix projection, invented mappings or exhaustive per-row diagnosis. Five focused files/190 tests, TypeScript, scoped lint and independent source review pass. [Integration](phase-2-fd04-quarantine-integration.md). [Actual SQL rejection-seam proof](phase-2-fd04-sql-proof.md) now passes 1/1 on the exact final harness: persistence, immutable owner UPDATE/DELETE denial, replay, SQL42501 failure and partial-write repair, zero prefix projection. Seven source hashes match. In-memory fetch/attempt controls remain doubles; no PostgREST or live acceptance.
- [Durable browser bundle](browser-acceptance-retained-evidence.json) now preserves full-window UCL211/13 and WWC64/7, legacy15, recovery16 and PWA5. [Preservation review](phase-2-browser-evidence-preservation.md). Historical runtime evidence, not final-candidate reruns or physical-device acceptance.
- [Acceptance reconciliation](phase-2-acceptance-reconciliation.md) records exact sources, publication interpretation and refreshed explicit allowlist. [Parent application checks](phase-2-post-fd04-parent-checks.md): 1246 passed/32 skipped, production build pass, lint0 errors/13 warnings. Subsequent change is only the opt-in SQL harness; its final TypeScript/scoped lint and SQL1/1 pass. Numeric WWC, final candidate/check binding and tested-head PR remain pending. Source/allowlist hashes require final refresh after concurrent work. No deployment, live providers or real sends.

## Historical checkpoint interpretation
All dated continuations, packet contracts and checkboxes below the current requirement table retain their **as-recorded historical** meaning, not a present task queue. Earlier browser stalls, recovery/PWA pending, BDL scaffold rejection, 13/2 SQL result and through-13 runtime HOLD are superseded by the current evidence above. The later DB38 two-failure checkpoint and pending through-15 matrix are likewise superseded by the repaired proof above; FD04 source and bounded actual-SQL acceptance supersede the missing rejection-seam integration claim; doubles and transport limits remain explicit. Their failed attempts are preserved; no runtime reports were rewritten. Final-candidate, numeric WWC and publication gaps remain current.

## Earlier continuation — 2026-10-30 provider proof and finite closure / ITERATE
- Bounded FD and NFL synthetic production adapter → orchestrator → SQL → scorer accepted: FD 3/3, BDL 3/3, provider regressions 107/107. Parent rechecked relevant source hashes and actual retained pass logs against [runtime report](phase-2-provider-runtime-acceptance-20261030.md). Two BDL defects fixed with evidence: initial empty cursor and stopped-run budget accounting. Four disposable DBs retained/stopped; browser DB untouched. This is not full-family or live readiness.
- Browser failure privacy: independently reproduced additional setup/cleanup leaks (5/7 before) and abandoned response-waiter stderr leak (0/1). Outer sanitized boundary and immediate waiter rejection handling now pass combined 8/8; syntax, scoped lint and whitespace pass. [Details](phase-2-browser-sanitization.md). No browser journey rerun claimed.
- Full-scope independent reconciliation credits recovery16/PWA5/full UCL211/13/WWC64/7 and nine first-window smoke; smoke settles only one market and cannot count as tournament completion. Concrete remaining local work: NBA/MLB/NCAAB/NCAAF normalization+SQL seams; persisted series/seed integration; seven remaining full journeys; trusted persisted/rendered numeric oracles; final independent exact-candidate checks/publication.
- New non-overlapping batch: four-family provider source/harness; series/qualifier integration with exclusive disposable DB authority; seven-family browser harness source only. All resolved Astra; usage/cost not exposed. No commits/publication/deployment. Historical blanket Pending rows below are not current failure findings; reconcile to evidence at final candidate.

## Earlier continuation — 2026-10-30 recovery/PWA and BDL seam / ITERATE
- Parent inspected actual recovery `2026-10-30T23-12-22.223Z-event-recovery/results.json`: passed all 16 checkpoints, including own export/restore, wrong/revoked/foreign/wrong-role denial, independent B pick preservation and unique React sibling keys. Earlier independent review's recovery blocker predates this artifact and is superseded by executed evidence.
- Parent inspected actual PWA `2026-10-30T23-10-57.354Z-pwa/results.json`: passed 5 checkpoints with real local service worker, reload control, offline create shell and zero notification requests. Installed-device proof remains outside this browser-local result.
- Product recovery fix namespaces review/pick sibling keys without changing revision resets; harness scopes recovery role selector to the correct form and checks submitted role. Builder reports syntax, 9 contracts, ESLint, typecheck and browser create/join/revisit regression passed. Parent independently reran recovery handlers 10/10, fixture-plan contracts 8/8 and diff check. Initial plain node invocation failed module resolution; using the repository event-runtime-register loader passed (no source change).
- Independent browser review confirms nine-template/shared/later/full UCL/WWC/legacy evidence and justifies exact disposable DB allowlist. Confirmed unsanitized event-runner error output remains an acceptance defect; bounded repair and regression assigned.
- Real production BDL NFL adapter and actual NFL SQL integration harness now implemented; builder reports 59 passes / 1 SQL skip. This is source evidence only until isolated FD/BDL DB acceptance executes. Parent delegated runtime/provenance verification separately from privacy repair and full-scope gap reconciliation; all three resolved Astra. No commits, publication or deployment.

## Earlier continuation — 2026-10-30 recovered browser runtime / ITERATE
- Diagnostic worker timed out without a final reply; its durable checkpoint and actual results were recovered and inspected by the parent. See [root causes and exact artifact paths](phase-2-browser-root-cause-20261030.md). Timeout does not erase completed evidence.
- Actual nine-template results: **9/9 passed**, first scored window only, including NCAA structural prerequisites. Shared canonical/override/release and both UCL/WWC later-window results: **passed**.
- Actual full UI-created results: **UCL 211 scored markets / 13 windows; WWC 64 / 7, passed**. Final scores/maxima 211/211 and 64/64; interim maxima remain explicitly unverified. This is not numeric interim-feasibility proof or all-event completion.
- Actual legacy results: **passed**, custom/pickem creation, recovery, scoring, fake-push failures and rename isolation. Recovery browser currently fails after participant fresh-context restoration; PWA still outstanding. New bounded runtime owner continues these lanes only.
- Product fixes recovered: StrictMode invitation-fragment retention, pickem CTA obstruction, recovery attachment origin; helper fixes include controlled inputs, service-worker response visibility and same-document revisit. Independent source/evidence review is pending, so these are observed runtime passes, not final acceptance.
- BDL first builder produced only scaffold, not a real vertical proof. Parent inspection found a UCL-shaped fixture and an opt-in DB test that never ingests. Rejected as E2 evidence; stronger source-only owner now implements production adapter and actual NFL integration assertions. DB execution follows separately.
- Current batch: recovery/PWA and BDL implementation requested/resolved Astra; independent browser evidence reviewer requested/resolved Luna. No commits/publication/deployment. Full E/P rows remain open pending integrated verification and exact-head delivery.

## Earlier continuation — 2026-10-30 transition acceptance / ITERATE
- Owned DB readiness recovered; lifecycle and window-incarnation race lanes passed. See [runtime recovery](phase-2-continuation-20261030-runtime.md).
- Full transition suite through `20261027000013` passed in approximately 12m06s: 2,093 assertions, 250 TAP assertions per fresh/legacy/current lane (750 total). Evidence: `supabase/tests/transitions/evidence-20261030T212044Z_e8fa81.json`. Prior 120/300-second suite termination was not proof of a capacity blocker.
- Fresh application test snapshot: 1,051 passed, 13 opt-in integration tests skipped. Not integrated HTTP acceptance.
- Oracle correction and bounded local timeout cleanup independently accepted: interim maxima exactly null, final UCL/WWC 211/64; real lifecycle/scorer integration included. Timeout regressions cover escaped pipe holders and exit/kill races; parent rerun passed. This does not establish numeric interim feasibility.
- Owned HTTP runtime executed successfully on disposable DB `bracket_http_439610679a15` through migration 00013. Launcher tests 7/7 and application HTTP tests 2/2 passed; see [runtime evidence](phase-2-bounded-http-launcher.md). Shared services untouched; owned bridge and loopback-only API/app established.
- Browser helper repairs replaced unsupported `Control+Home` and changed field/button interaction; builder reports syntax and 21/21 pure tests. Actual nine-template run still stalled at initial create/navigation (90s timeout), and full-window failed before its first window. No windows/markets covered: these are failed runtime attempts, not P11 acceptance. Stronger diagnostic owner now handles reproduction/root-cause repair and all browser/runtime lanes serially; independent helper review runs without runtime access.
- Legacy/recovery preflight added an exact allowlist entry for the owned runtime DB; builder reports 8/8 pure tests, scoped ESLint and TypeScript. Fixture generation/recovery/legacy/PWA execution remains outstanding.
- Provider reconciliation found historical FD vertical SQL evidence (3 tests) but insufficient exact-head provenance; current synthetic transport/orchestrator snapshot is 178 passed/1 SQL opt-in skipped. No BDL adapter→orchestrator→DB→NFL scorer proof exists yet. A bounded source-only builder owns that missing proof; no live providers or shared DB operations authorized.
- TypeScript passes; lint 0 errors/13 warnings. Requirement rows remain open until integrated evidence is reconciled; no PR/deployment claim. Previous three scoped workers requested/resolved `openai/gpt-5.6-luna`; next diagnostic owner resolved `openai/gpt-6-astra`, BDL builder and helper reviewer resolved `openai/gpt-5.6-luna`. Usage/cost not exposed.

## Historical continuation — 2026-10-28 P11 repair verification / runtime HOLD
- Both scoped repair children settled and collected; parent inspected actual full-window error/rendered assertions, B private-pick checks and isolated adapter routing. Three review findings repaired at source level.
- Parent aggregate browser/fixture tests **36/36 PASS**, zero skips; TypeScript, scoped ESLint and whitespace PASS. Application snapshot remains 1051 PASS/13 opt-in skipped; focused awards 39/39 PASS.
- Last clean SQL proof remains historical 39 files/1163 assertions through00013, not current readiness.
- Docker initially reported owned DB exited. Exact owned-container start returned success; inspect then reported running/restart0, but SQL exec failed with container not running / missing exec instance. No successful SQL readiness. Shared runtime untouched; no global restart or unrelated stops.
- Runtime races, populated13, HTTP/browser acceptance and tested-head PR remain pending. New B-contract fixtures must be regenerated after readiness. Details: [P11 repair checkpoint](phase-2-p11-harness-review-repair.md).
- Verdict **HOLD** for unavailable runtime infrastructure. No commit/publication/deployment this continuation. Resume requires stable owned SQL readiness; shared Docker intervention requires owner coordination.

## Authority and preservation
Existing branch `agent/bracket-roadmap-20261026`, baseline `13ed21e0fe3f148b107ae1421e28de3a2bcbffef`; no branch/worktree churn. Scoped commit/push/public PR authorized; no merge, release, deployment, public activation, spending, provider configuration/capture, or real sends. Local disposable SQL and original synthetic fixtures only.
Exact initial dirty-document paths and SHA256 hashes: [preserved baseline](phase-2-preserved-baseline.json). Case studies excluded from delivery. Approved spec/plan are pre-existing owner work, not implementation evidence.

## Requirement coverage — current local acceptance
“Verified bounded” credits the named executed scope, not full-candidate or live acceptance. Every row still needs final candidate binding; none declares full Phase 2 delivered.

| ID | Required local outcome | Actual evidence / scope | Current disposition / remaining action |
| --- | --- | --- | --- |
| E1 | UCL 211 markets/13 windows, joint maxima, FD | [Full journey](phase-2-browser-root-cause-20261030.md); [FD SQL 3/3](phase-2-provider-runtime-acceptance-20261030.md); [numeric UCL](final-numeric-runtime.md) trusted max1 and unknown-null rendered | Verified bounded; FD04 review-evidence ceiling below; final candidate pending |
| E2 | NFL 13 games, reseeding/advancement, BDL | [Seven-family](family-runtime-evidence.json) NFL13 plus changed-opponent credit; [NFL SQL 3/3](phase-2-provider-runtime-acceptance-20261030.md) | Verified bounded; final candidate pending |
| E3 | NCAA 76 structural/64 scored field, 63 games | [Family](family-runtime-evidence.json) 63 scored +12 structural, actual qualifier review; [series/structural](phase-2-parent-series-evidence-review.md); [NCAAB SQL](final-numeric-runtime.md) | Verified bounded synthetic qualification; no official future field claim |
| E4 | NBA 15 series plus separate six-game Play-In | [Family](family-runtime-evidence.json) separate journeys and reviewed handoff; [persisted children](phase-2-parent-series-evidence-review.md); [provider and six numeric Play-In states](final-numeric-runtime.md) | Verified bounded; parent-market browser does not prove child derivation (separate SQL does) |
| E5 | WWC 64/7, qualification, bronze | [Full journey](phase-2-browser-root-cause-20261030.md); [source feasibility review](phase-2-final-integration-review.md) | Partial: three numeric WWC persisted/rendered checkpoints outstanding; unknown actual placement must stay null |
| E6 | MLB 11 series, 3/5/7/7, reviewed replacement | [Family](family-runtime-evidence.json), [persisted series](phase-2-parent-series-evidence-review.md), [repaired child SQL](final-numeric-runtime.md) | Verified bounded; zero-scored child-only fixture correctly remains locked |
| E7 | CFP fixed 12-team/11-game bracket | [Family](family-runtime-evidence.json) 11-game journey; [NCAAF SQL](final-numeric-runtime.md) | Verified bounded; no regular-season invention or paid/live entitlement claim |
| E8 | Nomination identity, winner sets, N categories | [Awards provisioning](phase-2-awards-provisioning-proof.md); [family](family-runtime-evidence.json) three selected categories and tied winners | Verified synthetic/manual; future official categories/provider grouping remain external |
| P1 | Exact scoped auth, credential-free DTOs | [Security acceptance](phase-2-security-postrepair-review.md); [recovery16](phase-2-browser-root-cause-20261030.md); [privacy8/8](phase-2-browser-sanitization.md) | Scoped boundaries verified; final candidate security binding pending |
| P2 | Typed/stable/versioned graph and scoring bridge | [Final seam review](phase-2-final-integration-review.md), [series/structural](phase-2-parent-series-evidence-review.md), through-13 artifact | Bounded verified; aggregate SQL1166 and through15 transitions2429 pass; WWC numeric and final binding outstanding |
| P3 | Reviewed mapping, no automatic aliases | [Security](phase-2-security-postrepair-review.md), [FD/NFL SQL](phase-2-provider-runtime-acceptance-20261030.md), [five SQL cases](final-numeric-runtime.md) | Reviewed-only local boundary verified; FD04 bounded source contract accepted, bounded actual SQL persistence accepted (1/1); production admission/PostgREST not covered |
| P4 | Ordered immutable evidence, recursive sanitizers | [Provider postrepair](phase-2-provider-postrepair-review.md), [provider SQL](final-numeric-runtime.md), [FD repair ceiling](phase-2-fd-repair.md) | Bounded FD04 source integration accepted via first-rejection witness; bounded actual SQL persistence accepted (1/1); production admission/PostgREST not covered; no exhaustive per-row claim |
| P5 | Override/release/expiry, tokens/audit | [Lifecycle repair](phase-2-window-lifecycle-repair.md), [actual current races](phase-2-continuation-20261030-runtime.md), [series retraction](phase-2-parent-series-evidence-review.md) | Bounded runtime verified; final candidate binding pending |
| P6 | Binding budgets, bounded transport, ordered stop | [Runtime authority/fake transport](phase-2-http-runtime-recovery-parent.md), [provider SQL](final-numeric-runtime.md), [routing review](phase-2-final-integration-review.md) | Five SQL cases now pass downstream controls; deployed scheduler/live account not claimed |
| P7 | Durable reconciliation and lifecycle | [Lifecycle](phase-2-window-lifecycle-repair.md), [races](phase-2-continuation-20261030-runtime.md), [series](phase-2-parent-series-evidence-review.md) | Bounded verified; six numeric Play-In states passed, WWC numeric outstanding |
| P8 | Intents/retry/consent and fake sends | [Authority60 barriers and real runtime four fake sends/dedup/restart/restop](phase-2-http-runtime-recovery-parent.md); [notification repair](phase-2-no-authority-repair.md) | Historical executed scoped proof credited; final candidate revalidation pending; real sends remain off |
| P9 | Scoped operator CLI and organizer controls | [Authority runtime](phase-2-http-runtime-recovery-parent.md), [qualifier/series review](phase-2-final-integration-review.md), actual organizer browser journeys | Bounded verified; no broad service-role compromise protection claim |
| P10 | Nine draft/manual idempotent templates | [Seed DB proof](phase-2-template-db-proof.md), [catalog repair](phase-2-catalog-repair.md), nine actual journeys | Local synthetic/manual verified; no public template activation |
| P11 | Nine journeys, mobile/PWA, legacy | [Family](family-runtime-evidence.json), [full/recovery/PWA/legacy](phase-2-browser-root-cause-20261030.md), [numeric9/12](final-numeric-runtime.md) | Journeys verified; three WWC numeric checkpoints pending; physical device and deployed beta separate |
| P12 | Fresh/populated/repair, final checks and PR | [Repaired through15/SQL proof](phase-2-db38-final-repair.md); [durable browser bundle](browser-acceptance-retained-evidence.json); [reconciliation](phase-2-acceptance-reconciliation.md) | Partial: through15 2429/2429 and SQL1166/1166 pass; durable journey bundle retained; full-candidate checks/binding and tested-head PR pending |

## Active packet contracts
### W1-P1
- Owner: credential-read builder; writes app read/auth pages/routes, affected components/read helpers, security tests only. No schema/ingestion/scoring writes.
- Done: invalid/stale/cross-league credentials reveal no private data; all bulk DTOs omit bearer credentials; explicit owner-scoped recovery works.
- Evidence: focused negative/positive tests, independent review, build and eventual browser payload proof. Builder cannot approve own work.

### W1-core
- Owner: integration owner; writes new typed domain/scoring modules, forward schema/test additions after baseline inspection. No overlap with P1 paths.
- Done: typed outcomes validated against edition/market; canonical/override effective basis and joint-feasible maxima distinguish unknown from numeric; legacy unchanged.
- Dependencies: approved spec and current DB/schema.
- Evidence: hand-derived UCL/Play-In/WWC/series/awards oracles, DB constraints and vertical integration. Pure unit success alone does not close P2/P5.

## Integrated checkpoints
- Local reviewed P1 read/DTO/recovery checkpoint committed as 3ca08fbd7d3cfa5266a2114ab3bb3f9f391d83e8 (16 explicit paths only); focused security/admin59/59 immediately before commit. Independent security review found no new page/DTO defect, but SEC01–03 SQL/mapping scope remains open; commit is not full P1 acceptance. No push/PR.
- Combined TS snapshot before replay fixture repair: 769 pass/2 fail (47 files), failures were historical automatic-alias assumptions. Focused replay after approved-policy fixture reconciliation:3/3 pass. This is not a final full-suite pass.
- Whole-repository tsc --noEmit --incremental false passes after OSC test mock typing repair; OSC4/4 focused pass.
- Catalog strong repair reports20/20 semantic tests; FD strong repair reports90/90 focused adapter/HTTP/dispatcher/failure tests. Independent post-repair acceptance remains required; FD04 per-row quarantine remains open.
- Typed outcome schema strong builder:55 pgTAP,58 legacy assertions,79 contracts; populated forward-hold probe59 assertions (temporary artifact must be checked in/reproduced for final). Schema applied local only, no final upgrade proof.
- Runtime safety: existing .env.local points at hosted Supabase. No application runtime journey launched against it. scripts/local-event-runtime.py injects local-only URL/keys in child process without printing or rewriting supplied configuration; actual UI fixture runtime still pending.

## Window persistence checkpoint
Migration 20261027000002 applied directly via transactional psql to existing disposable local DB (not yet recorded in Supabase migration history; fresh/upgrade harness still required). 25 pgTAP assertions pass: exact credential, complete submission atomicity, stale version, freeze, own/open embargo, cutoff, idempotent due sweep, overall lock and no legacy unlock bypass. UTC time sampled after lock acquisition. New repository wrapper maps safe error codes/DTOs. No UI or lifecycle reconciliation completion claim; deterministic row-lock/cutoff race harness now exists at scripts/verify-event-window-races.py and passed: worker demonstrably waiting on database lock, cutoff tightened by blocker before release, submission rejected and zero picks. No sleep-based scheduling assumption. Independent review pending.

## Model use
| Task | Requested | Resolved at spawn | Usage/cost |
| --- | --- | --- | --- |
| P1 builder | inherited strong route | openai/gpt-6-astra | Not exposed yet |
| Read-only full scope inventory | openai/gpt-6-luna | openai/gpt-6-luna | Not exposed yet |
| Baseline command triage | openai/gpt-6-luna | openai/gpt-6-luna | Not exposed yet |

## Verification and findings
Fresh baseline at unchanged HEAD: 36 TS files/632 tests pass; 26 DB files/676 tests pass; build passes, eslint 0 errors/10 warnings. Node v26.12.0, npm 11.20.0, Supabase CLI 2.114.0. DB lint exits 0 but extension-schema errors plus three public unused-parameter warnings require triage (not clean lint). Direct SQL via docker/psql stdin returned BRACKET_SQL_READY:2. These are starting-state results, not final candidate proof. Findings ledger will record reproduction, independent skeptic dispositions (3 high / 2 other substantial batch), repair and exact regression. No findings accepted by vote alone.

## External gates retained
All provider live account/terms/coverage/correction gates in provider contract remain open; NCAA/CFP paid entitlement, WWC competition identity, Oscars grouping/settlement, MLB cross-ID relationship, NBA membership and UCL timing remain named gates. No real provider requests or recipients. Physical-device and deployed-beta issue #3 acceptance remain unrun. Publication not yet performed.

## Executed/delegated packet checkpoints
- Typed outcomes: `lib/events/outcomes.ts`, four original oracle tests pass after missing-module RED. Joint feasible components, explicit unverified maximum, winner-set membership, override/provenance tokens. Not DB/UI integrated.
- Derivation: `lib/events/derivation.ts`, series/Play-In/reseed/graph tests written RED; focused verification collected: 8/8 across derivation/outcomes before O1 regression. O1 then independently reproduced RED and repaired GREEN (outcomes 5/5).
- Luna FD builder: `football-data.ts`, `http.ts`, focused test file; builder reports 7 passes, independent strong review active. Unknown mapping omission and edition identity require scrutiny; not accepted.
- Luna catalog builder: two files, builder reports 4 passes; independent strong review active. Integrator spotted wrong NCAA structural/champion and WWC/UCL semantics, withheld acceptance. No repair before skepticism.
- Luna identity builder first attempt made no changes: incorrect missing-files claim caused by wrapper cwd. Retried with explicit absolute paths. This is rework, not access blocker.
- Model metadata: FD builder resolved Luna; subagent totalTokens 71470; catalog Luna 33254; inventory Luna 33795; baseline Luna 29595; failed identity Luna 56088. These are exposed run metrics, not cost estimates; UI rounded token summaries differ and dollar savings are not inferred.
- Actual concurrency discovery: runtime rejected a sixth active child (maxChildrenPerAgent=5); reviews/builds now queued accordingly. This replaces approval-time estimated four slots; no configuration changed.
- BDL transport Luna builder: two bounded files, reported3 tests/typecheck pass; independent review queued. OSC parser Luna builder dispatched with scalar-validation contract to avoid nested-field leakage.
- Owner correction applied: economical models assigned actual bounded code/test packets, not read-only-only delegation.
- Parent appended owner clarification to approved plan after initial hash inventory; authorized documentation delta, preserve it.

## Resumed repair verification — 2026-10-27
- Shell and native delegation successfully rechecked; earlier authority blocker no longer reproduced.
- Parent reran combined Vitest: 48 files / 801 tests passed, exit 0. This does not invalidate adversarial provider findings.
- Security builder reports DB30 54/54; DB17 (12 failures) and DB20 (7 failures) assigned reviewed-fixture integration without weakened admission.
- Window builder reports DB29 47/47, DB28 25/25, TS13/13 and two deterministic races; independent acceptance pending.
- Accepted active children: security postrepair 2988bb91; window postrepair b9545931; fixture integration ada20933; provider third skeptic 7e65a376. Launches are not completion evidence.
- PS01–05 remain unrepaired; full product integration and publication remain outstanding. No deployment/provider calls/publication this checkpoint.

## Continuation after optional-model deferral — 2026-10-27
Owner requests continued approved implementation while optional model configuration is handled separately. No provider experiments/configuration work. Fresh shell and native spawns succeed; model registry warning remains but OpenAI OAuth route resolves.

- Previous batch settled: security scoped independent ACCEPT (DB30 54/54; independent nested edge 58/58); fixture DB17 23/23 and DB20 52/52 independently corroborated. Full P1/P3 integration not closed.
- Provider PS01–05 repair report now exists; independent postrepair acceptance run 6672c043 pending. Builder counts are not acceptance.
- Window WPR1 delete/recreate ABA confirmed by both independent skeptics. Durable version/cutoff history repair run bb102066 owns new 00005/DB31 only; prior F2–F4 protections credited.
- P2 scoring bridge run d645f2c5 owns new scoring-bridge module/test; P10 economical seeder run 63e93ea8 owns new template-seeder module/test. Both require independent acceptance and later real integration.
- All four requested/resolved routes: OpenAI GPT-6 Astra for review/schema/core; GPT-6 Luna for bounded seeder. Cost not exposed; no savings estimate.
- P12 transition harness run 6510c54d owns new scripts/verify-event-transitions.py and isolated transition fixtures/report, initially pinned through 00004; no existing DB reset/history changes. Independent review and later 00005 replay required.
- Shared ledger/integration remains parent-owned. Existing case studies and dirty owner documents preserved. No push/deploy.

### Current parent acceptance item
project: BRACKET-FYI
done when:
- [x] Full current DB test result is captured without altering hosted data/history: guarded `supabase test db --workdir /Users/yonnasgetahun/bracket-fyi`, 30 files / 860 assertions PASS (before 00005).
- [ ] New packet interfaces and review results are reconciled before integration.
evidence: actual guarded local checks and child reports; scope remains E1–E8/P1–P12.

## Post-packet integration — 2026-10-27
- Provider PS01–05 scoped independent ACCEPT: 107 independent synthetic probes and 29 focused tests; full integration remains open.
- WPR1 builder delivered 00005/DB31 and race harness. Parent reconciled exactly three DB29 version expectations; independent reviewer 9d4d1d34 active. Prior deleted histories remain unrecoverable.
- Bridge/seeder independent review 85e524cb active; transition integration through00005 1d541044 active; durable P5/P7 builder1794eaf4 owns00006 and new lifecycle modules; economical seeder DB adapter5d3b82f8 owns new adapter only.
- Parent full DB CLI attempt failed connection timeout before tests. Container pg_isready succeeds. Fallback /tmp/bracket-db-suite-local.py runs all31 SQL files through docker exec/psql ON_ERROR_STOP and rejects TAP not-ok; all31 PASS /928 TAP assertions counted from actual logs, including reconciled DB29 and newDB31. Per-file logs /tmp/bracket-suite-*.log. Standard CLI connectivity remains unverified; no reset/history changes.
- Parent combined TypeScript snapshot: 52 files/849 tests PASS, including newly visible adapter tests; this is not independent adapter acceptance. Guarded git diff --check passed. Other builders may subsequently change their owned files.

### Runtime fake-send prerequisite
project: BRACKET-FYI
done when:
- [x] Local preview/fake mode broadcast saves announcement but performs zero fanout HTTP requests.
- [x] Authorized nonlocal legacy behavior remains covered; no real sends exercised.
evidence: tests/admin/broadcast-transport.test.ts RED reproduced one mocked fanout despite fake mode; guard GREEN 4/4 plus authorization6/6. Parent owns route/test. Nonlocal legacy behavior tested only with mocked fetch. This is a runtime prerequisite, not P8 completion.

## Returned lifecycle batch and next integration — 2026-10-27
- Previous batch fully settled. Window independent reviewer failed without output: no acceptance inferred; replacement review `60fd78e3` covers 00005/00006 and lifecycle semantics.
- Bridge/seeder independent review found structural NCAA eliminated-pick maximum and lost-ack template identity gaps; repair `35388986` owns only scoring/seeder modules and regression tests.
- Transition through00005: 140 harness assertions / 747 pgTAP assertions reported passing; fresh/populated/repair scope only. Parent now running explicit `--through 20261027000006`.
- Durable lifecycle builder returned00006, DB32, repository/scorer/sweep: reports32 SQL files/974 assertions,11 units plus real DB integration. Independent acceptance and HTTP/job integration pending.
- Template DB adapter bounded builder reports4 tests/typecheck. Parent new real SQL adapter/seeder integration passed in `bracket_seed_9693f3b4a2d7`: nine exact drafts, byte-identical config replay, drift rejection, anon/authenticated denial, zero leagues. SQL transport bridge is not PostgREST/browser proof. One readonly-array test type error found after runtime pass and corrected; exact-cwd scoped ESLint and project TypeScript checks now pass. Whitespace check passes. Report: phase-2-template-db-proof.md.
- Active new independent packets: notification backend `70f56950` (new00007/DB33/notifications*), shared app `690d267a` (new app/events/**, application*), operator/provider controls `45da67e8` (new00008/DB34/operator*, designated orchestrator integration). All requested/resolved GPT-6 Astra for security-critical integration; exposed costs unavailable. Prior economical builder outputs retained.
- No new commit/push/deploy/provider call/real send. Full E/P coverage and nine browser journeys remain open; no milestone substituted for delivery.

## Reflection checkpoint 0
Approved full-scope plan retained. Three bounded native children dispatched (one builder, two economical read-only tasks); one integration owner. Actual baseline and path ownership established before application mutations. No claimed full-roadmap completion.

## Integration checkpoint — lifecycle/operator batch returned
- Parent snapshot: npm test 59 files /958 tests pass;6 opt-in files /7 tests skipped. Not full integration evidence.
- WL-01 late enrollment, WL-02 poison scan, WL-03 missing recompletion audit reproduced by independent reviewer; repair owner b7eb472d owns00009/lifecycle only.
- Runtime integration1f170800 owns runtime glue/legacy broadcast; pairing b02a2961 owns00010/application; local HTTP recovery04c0d114 owns launcher; independent backend review38b6a176 read-only.
- Local Supabase only DB exists; start reports already running and does not restore API. No hosted fallback or DB restart performed.
- Transition through00008 failed at whole-row00005 assertion: it applied00007 additive outbox columns before comparing00005 rows. Parent owns harness correction, not schema weakening.
### Transition harness extension criteria (before implementation)
project: BRACKET-FYI
done when:
- [ ] 00005 preservation checked before later migrations; each later migration preserves all prior row values.
- [ ] 00007 four new nullable legacy outbox fields verified null, not silently ignored.
- [ ] Full fresh/legacy/current runs through current target and applicable repairs pass.
evidence: scripts/verify-event-transitions.py and retained per-run JSON.

### Operator fixture integration acceptance
project: BRACKET-FYI
done when:
- [ ] Old projection fixtures explicitly activate disposable global control; no production default changed.
- [ ] Reviewed mapping/shared result/notification fixtures use scoped operator authority, denied direct writes remain denied.
- [ ] Full SQL suite through00008 and migration matrix pass without weakened production grants.
evidence: disposable DB bracket_transition_20261027t215203z_105306_fresh; initial full suite has11 failing files, including removed grant assertions and uncredentialed calls.

## Published preparatory draft — 2026-10-30 closeout

[Draft PR #4](https://github.com/yonnastgetahun/bracket-fyi/pull/4) is open against main. Initial publication head was 5de02b2d39be0cc327e96765b7b84dcd7304248a; this closeout is documentation-only. Exact final remote/head equality is recorded in the private publication receipt and PR body, avoiding a self-referential commit hash.

400 explicitly allowlisted paths were committed; all26 protected working-tree hashes remain intact. SQL/transition/FD04 evidence binds84 distinct source paths to committed bytes. The branch also includes its earlier foundation (583 changed files against main); no case studies or protected uncommitted owner work were added. Staged diff-check returned exit2 for Markdown hard-break whitespace and blank EOF in nine files; earlier unstaged checks did not include those newly tracked files. These formatting findings remain disclosed, not silently waived as a passing check.

Publication is complete only for this preparatory draft. Numeric9/12 shared-memory/OOM gate, full final-head runtime/DB-lint acceptance and external live/device/deployed-beta gates remain open. No merge/deploy/spend/live sends or runtime/VM/container changes. Git push used the configured CA; GitHub API used verified default SSL with that CA and retained proxy after gh's platform trust failure. No TLS verification disabled. Full Phase2 verdict remains **ITERATE**.
