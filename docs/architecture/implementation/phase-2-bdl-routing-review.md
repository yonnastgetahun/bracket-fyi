# Independent four-family review + binding-aware BDL integration

2026-10-30. Local synthetic/source scope only. Existing branch and unrelated dirty files preserved. No commit, DB/Docker, browser, runtime server, live request, credential lookup or spend.

## Scope and consumer decision

Read repository AGENTS, approved Phase-2 execution plan, full-roadmap provider contracts, four-family source packet, actual adapters/transport, runtime factory, orchestrator registry/ports and synthetic fixtures.

Actual consumer: AdapterRegistry.get(providerKey) receives no binding. createEventIngestionRuntime accepts that registry explicitly; orchestrator later passes claimed binding configuration in PullContext. Therefore one BdlRouterAdapter occupies key "balldontlie" and selects its immutable family consumer per pull. No orchestrator signature changes, global current-sport state, renamed provider keys, alternate accounts or separate per-family budget ledgers.

Production composition helper: lib/events/runtime-providers.ts exports createEventProviderRegistry({fetch, otherAdapters?}). Supply its result as createEventIngestionRuntime(..., { ...dependencies, adapters: registry }). Fetch is mandatory/injected; no automatic global fetch or scheduler activation. Optional non-BDL adapters retain identity; duplicate keys reject. Existing explicit registries remain supported, including current SQL harnesses; adopting the helper is explicit, not a silent override of another owner's dependencies.

Six accepted routes:
- NFL: sport=nfl; existing phase-absent contract, or explicit phase=playoffs.
- NBA: sport=nba with mandatory playoffs/playin phase and existing phase-matched reviewed membership.
- MLB: sport=mlb, phase=postseason.
- NCAAB: sport=ncaab, phase=tournament.
- CFP: sport=ncaaf, phase=cfp.

Binding UUIDs/key/config version/provider key and sport/phase validate before family dispatch. Missing/foreign values cannot select a default. Each family still validates the complete reviewed map, season/window, identity, lifecycle and pagination. Manual mode returns an empty batch before any binding/credential/transport access; manual manifests must not be scheduled as provider jobs. The generic orchestrator resolves credentials for scheduled provider jobs, so this packet does not claim a manually mis-scheduled binding avoids orchestration admission/budget/credential resolution.

## Independent findings / dispositions

| ID | Finding / severity | Evidence and disposition |
| --- | --- | --- |
| BDL-R1 | Same-key registry lacks mixed-family selection / integration gap | Confirmed by ports and orchestrator.get(run.adapterKey). Fixed with production router + explicit runtime registry; six real-adapter orchestration tests pass. |
| BDL-R2 | Timestamp carried in date can contradict reviewed kickoff / medium | Confirmed: each of NBA/MLB/NCAAB/NCAAF admitted date=2027-01-20T19:00:00Z while reviewed kickoff was 18:00Z. Existing datetime-only check did not cover this field; day truncation discarded the contradiction. Four red tests (4 failed/4 passed) before repair. Minimal exact-instant guard now rejects; 8/8 green, including equivalent offset and date-only cases. Diagnosis did not need additional instrumentation/hypothesis probes: minimized one-field repro and exact missing comparison establish cause. |
| BDL-R3 | Negative/invalid final scores might pass winner comparison | Disproven for transport inputs: shared allowlisted leaf validation requires safe nonnegative integer scores/runs; existing adapter final checks reject null/tie. No speculative duplicate validator added. |
| BDL-R4 | Play-In might leak playoff membership | Disproven for coherent config admission: family config rejects membership mismatch before HTTP. Router adds explicit phase admission and a no-I/O regression; same provider key does not collapse phase. Query remains independently selected. |
| BDL-R5 | Final corrections may gain authority from fetch time | Disproven: observations have no manufactured provider revision; fetched time only observedAt. Downstream correction authority remains repository-owned. |
| BDL-R6 | New adapters might claim full series/qualification completion | Not claimed: emit games; source packet explicitly defers series/qualifiers. No series/lifecycle ownership taken. |
| BDL-R7 | Full terminal page may be legitimate | Known conservative hold, not an unsafe acceptance defect. Existing documented pagination contract retained. No live parity/entitlement claims. |

Source review acceptance is bounded normalization/routing only. SQL persistence, series clinch/retraction, qualification handoff, full-graph lifecycle and live provider parity remain separate owner gates.

## Verification

Commands executed from /Users/yonnasgetahun/bracket-fyi through workspace exec wrapper, installed local binaries only:

- Red: vitest run tests/ingestion/providers/balldontlie-family-review.test.ts: 4 failed / 4 passed.
- Green after exact-instant guard: same command: 8 passed.
- Final: vitest run tests/events/runtime-provider.test.ts tests/ingestion/providers: **9 files, 247 passed**. Includes original 82 four-family normalization tests, 24 routing/registry negatives and positives, 8 independent date regressions, 6 real-adapter runtime routing cases plus 4 existing SQL-control-port source tests. RPC/repository ports are source doubles, not DB proof.
- Scoped ESLint across six changed TypeScript files: exit 0.
- git diff --check: exit 0 (tracked changes). New files also parsed/linted where TypeScript.
- tsc --noEmit: exit 2, **only unrelated concurrent work** tests/events/trusted-numeric-fixture.ts:85,89 (assignments to readonly markets/edges). An initial own union-property test error was fixed; second run retained only those two external errors. No claim of globally green typecheck.

Isolation adversaries include missing binding UUID/edition/key/config version/provider key, missing or unsupported sport/phase, wrong phase-family, manual credential property getter that throws, Play-In membership mismatch, foreign response, unknown registry keys, duplicate BDL adapter registration, redacted unknown errors and overlapping NBA/CFP pulls with same external game ID but independent editions/cursors/credentials.

## Exact touched files

1. lib/ingestion/providers/balldontlie-family.ts — two-line demonstrated timestamp repair.
2. lib/ingestion/providers/balldontlie-router.ts — new binding-aware production adapter.
3. lib/events/runtime-providers.ts — new explicit registry composition helper.
4. tests/ingestion/providers/balldontlie-family-review.test.ts — new independent regression cases.
5. tests/ingestion/providers/balldontlie-router.test.ts — new router/isolation tests.
6. tests/events/runtime-provider.test.ts — imports + six production-adapter registry integration tests; original cases preserved.
7. docs/architecture/implementation/phase-2-bdl-routing-task.md — pre-mutation binary criteria.
8. docs/architecture/implementation/phase-2-bdl-routing-review.md — this report.

changed: per-binding routing and independently reproduced kickoff contradiction repair.
matters: shared provider/account key no longer requires a family-specific registry; contradictory time evidence cannot settle.
checks: 247 source tests and focused lint pass; global typecheck blocked only by two outside-scope fixture errors.
risk: registry must be explicitly wired by runtime composition owner; DB/live/full-tournament gates not exercised.
verdict: accept bounded normalization/routing source packet; hold overall runtime acceptance for owning lanes.
