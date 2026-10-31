# P2-CORE-BRIDGE work item
project: BRACKET-FYI
done when:
  - [x] Shared bridge validates catalog/binding/outcome/pick/window identities and preserves regulation orientation.
  - [x] Hand-derived UCL, WWC, Play-In, series and nomination oracles pass; incompatible maxima remain unknown or joint.
  - [x] Focused tests/lint/types pass; exported integration contract documented.
evidence: tests/events/scoring-bridge.test.ts and commands below.

## Scope and implementation

Three new files only: `lib/events/scoring-bridge.ts`, `tests/events/scoring-bridge.test.ts`, this report. No existing shared file, schema, UI, provider, network, configuration or Git publication changes. Approved spec v1.0 §7 and normative execution contract §D are the oracle sources. Integration packet map packet 1 is the dependency target, not a closure claim. TDD skill applied within the already-authorized interface/test scope.

The bridge calls existing `parseOutcome`, `scoreParticipant` and `competitionRanks`; it does not maintain a second scoring engine. Explicit null is invalid; an absent outcome means typed unresolved. A no-contest remains non-settled for maximum purposes. Missing locked submissions forfeit, while future unlocked markets can contribute selectable points. Each market scores once, with complete optional custom weights or default one, no champion/qualification/credits bonus.

## Exported next-integration contract

- `EventEdition`: immutable reviewed `EventDefinition | SyntheticManifest` catalog plus positive `graphVersion`. Catalog IDs are canonical identities, not provider references. Stable market IDs must survive pairing/result corrections.
- `ReviewedGraphBinding`: `reviewed: true`, matching graph version and exactly one `ReviewedMarketBinding` per catalog market. Each binding repeats the exact ordered source slots, supplies all potential canonical entrant IDs, and actual ordered `orientation: [home, away] | null`. Potential eligibility is not today's actual pairing. Deterministic source membership cannot be truncated; reviewed placement membership remains an upstream review responsibility.
- `EventScoreInput.outcomes`: market-ID keyed **effective** typed results after canonical/override resolution. Call `resolveEffective` or the durable effective-result service upstream; retain its effective/provenance tokens at the repository boundary. The bridge does not choose override precedence, mutate result versions, or reconcile lifecycle.
- `participants`: ID, persisted matching `graphVersion`, and immutable market-ID picks. Regulation choices must be `home | draw | away`; all other picks are canonical entrant/nomination IDs. The bridge normalizes regulation picks to canonical home/away entrants before scoring; effective outcomes and feasible worlds always use canonical entrant IDs (or `draw`), never home/away strings. Saved predicted opponents are not replaced by actual opponents. Known winner/loser paths reject impossible predictions.
- `windows`: exact catalog-window keyed `unopened | open | locked` state. Lock service is authoritative; bridge does not calculate cutoffs, admission, privacy or submission eligibility.
- `components`: explicit `TrustedFeasibleComponent[]`. Each world covers exactly its component markets with nonempty typed winning-choice sets. Evidence requires a nonblank review reference and matching graph version, attesting **exhaustive joint feasibility and independence across components**. This is an internal trusted-service interface, **not** a browser-submittable DTO. A boolean review marker is not authentication. Null evidence/worlds cannot manufacture a numeric maximum.
- Known scored winner/loser/reseed/leg-result edges cannot cross component boundaries (including a component versus omitted neighboring market). Use one joint component for the entire connected dependency group or omit it and accept an unverified maximum. Reviewed placement edges are a distinct upstream review boundary. This deliberately conservative contract may require larger components; the bridge does not infer independence or multiply local tie maxima.
- `scoreEvent(input): EventScoreRow[]`: rank-sorted rows with ID, earned, maximum (`number | null`), wrong, pending, competition rank. Null maximum is “temporarily unverified”, never numeric zero. Pending is a scoring count, **not a completion/lifecycle flag**.
- Unknown IDs, duplicates, stale versions, unsupported outcome types, ineligible winners, malformed worlds, split dependencies, conflicting ordered graph sources/edges, cycles and contradictory known advancement are rejected.

Upstream obligations: edition identity/authorization and reviewed canonical mappings, configuration freezing, versioned durable picks, exhaustive feasibility generation (including UCL regulation scores and aggregate membership), reviewed placements/reseeding, effective-result provenance, atomic repository loading and window security. This helper cannot authenticate evidence or prove that a supplied feasible-world enumeration is exhaustive. Missing trusted feasibility must remain unverified. No HTTP route should accept this internal input unchecked.

## TDD and evidence

Observed red → green cycles:

1. Regulation tracer: missing bridge module → correct WWC draw/home correction.
2. Unknown outcome ID/type/stale binding → strict identity and graph validation.
3. Untrusted UCL worlds incorrectly produced numeric maximum → evidence gate and dependency factor rejection.
4. Impossible Play-In predicted decider accepted → predicted-path validation independent of actual paths.
5. Truncated eligible membership accepted → complete deterministic source membership and exact IDs.
6. Explicit null silently became unresolved → own-key-aware parsing rejects null.

Additional independent regression oracles: UCL reversed second-leg orientation and canonical/override/draw table; R's 2–0 tie maximum is 1, not 2; complete five-state Play-In per-conference table with changed opponent; NBA fourth-win and MLB second-win clinch/retraction; WWC draw/correction and medal shared rank; nomination tie/correction with 1,1,3 ranks; unknown/no-contest/forfeited zero/unlocked future distinctions. Expected numeric values are hand-written from the spec, not computed by the production scorer or feasibility generators. Series derivation is exercised with explicit child games and independently fixed expectations.

Commands executed from `/Users/yonnasgetahun/bracket-fyi` through `/Users/yonnasgetahun/clawd/bin/exec`:

- `./node_modules/.bin/vitest run tests/events/scoring-bridge.test.ts` — 11/11 passed after final interface changes.
- `./node_modules/.bin/eslint lib/events/scoring-bridge.ts tests/events/scoring-bridge.test.ts` — passed, no diagnostics.
- `./node_modules/.bin/tsc --noEmit --incremental false` — passed, no diagnostics (project-wide types, no emitted artifacts).
- Five-file event regression run (catalog/outcomes/derivation/ucl-tie/bridge) — 42/42 at the ten-test bridge checkpoint; subsequent null regression and pick-version changes independently reran bridge tests/lint/types.
- `git diff --check` — passed at regression checkpoint; owned paths are new/untracked, not committed.

## Remaining evidence boundary

No full P2 closure: DB round-trip, old-reader/API compatibility, durable effective projection, migration/repair, override/reconciliation races, full 211-market/64-market event runtime totals, and end-to-end UI/provider journeys remain integration work. These are focused helper oracles, not whole-event lifecycle proofs. No deployment/live/provider/device claim.

changed: dependency-ready typed catalog-to-scoring adapter and independently expected oracle tests.
matters: regulation-side picks now agree with canonical winners without corrupting joint maxima or stored hypothetical opponents.
checks: focused tests/lint and project types passed as above.
risk: upstream review/authentication, full feasible-domain generation, persistence and UI wiring still required.
verdict: accept scoped helper; full P2 remains open.

## Skeptical review follow-up work item
done when:
- [x] Partial advancement rejects impossible outcomes and predictions.
- [x] Known actual pairings condition trusted worlds without rewriting saved picks.
- [x] Equivalent reordered source objects, including nested sources, compare structurally.
evidence: new public scoreEvent regressions, focused lint and project types.

### Review dispositions and final verification

All three core-bridge-skeptic findings accepted and fixed within owned files:

1. Partial Play-In outcome/pick regression first failed (no exception), then passed after unresolved winner/loser slots retained possible graph membership. Known winners are excluded from loser paths even when another slot is unresolved.
2. Known final pairing B/C with predicted B/C/A first returned maximum 3 instead of hand-derived 1. Trusted worlds now condition on actual ordered pairing membership and its upstream winner/loser slots; predictions remain unchanged. Regression passes.
3. Reordered entrant source properties first threw inconsistent binding. Structural deep comparison now ignores object key insertion order, including nested reseed objects, while preserving ordered slot/pool arrays. Nested reseed acceptance and reversed-slot rejection also pass.

Final verification: five-file catalog/outcomes/derivation/ucl-tie/bridge suite **47/47 passed** (bridge **15/15**). Focused ESLint passed. A nested fixture union typing error was repaired by narrowing the known EventDefinition fixture; subsequent project `tsc --noEmit --incremental false`, ESLint and 15 bridge tests all passed. `git diff --check` passed. Guarded commands use absolute repository paths (or Python subprocess with explicit repository cwd); initial relative-binary invocation failed before test execution and was corrected.

The feasibility trust boundary remains: reviewed placements/reseeding and complete joint world generation require trusted upstream evidence, not this adapter. Actual pairings additionally constrain supplied worlds; an empty compatible domain remains unverified. No DB/UI/full-P2 closure claim.
