# Batch 1 skeptic 2 — independent contract review
Date: 2026-10-27. Scope: exact working-tree catalog.ts, outcomes.ts, football-data.ts, http.ts; read-only application/tests. No provider calls, DB mutation or repairs.

## Method / proof
Read controlling spec v1 §§3–4,7–8, full-roadmap-template-manifests.md, full-roadmap-provider-contracts.md and ucl-observed-field-mapping.md. Executed existing focused tests with npm --prefix /Users/yonnasgetahun/bracket-fyi test -- tests/events/catalog.test.ts tests/events/outcomes.test.ts tests/ingestion/providers/football-data.test.ts: **15/15 pass**. Independently transpiled exact TS modules in memory using installed TypeScript, injected original local Response objects, and exercised counterexamples without creating test files or HTTP requests.

## Dispositions and strongest attempted defenses

### C1 — CONFIRMED
Defense: total 211 and 13 windows are correct; champion may be a marker rather than an extra unit. Neither rescues typing/identity. Runtime counts result168/qualifier24/champion19; champion market193/window11 (QF), not final211/window13. Spec §3.1 requires 188 regulation legs/matches,22 qualifiers,one final. catalog.ts specs row and kinds indexed by window cause this.

### C2 — CONFIRMED
Defense: expanded76 field is intentional and 63 scored markets remain correct. But 76 entrants are not 76 contests: spec explicitly12 Opening Round games +63 scored =75. Runtime structural13/result62/champion1, champion063/window3 (Sweet16), total76. Extra final structural market cannot be justified by expanded field.

### C3 — CONFIRMED (wording qualification)
Defense: champion can legitimately also represent the last series; requiring literal kind=series on all15 is not independently normative. However runtime series8/champion7 and champion009/window2 is objectively wrong. Spec has one Finals series champion, not seven; no catalog best-of/target membership rescues it.

### C4 — CONFIRMED
Defense: 64 markets and seven windows are correct; two generic medal slots could in principle be assigned externally. Exact output instead points champion048 to groupMD3. Neither SyntheticMarket nor EventMarket has bronze/final role, and edges=[] cannot attach semifinal losers. Spec §§3.3,7 requires bronze identity and correct final.

### C5 — PARTIAL
Six/four window objects alone do NOT prove six/four independent lock times: EventWindow has only id/label, no cutoff; a caller could synchronize all cutoffs. Thus allegation of actual per-round reopening is not demonstrated. Nevertheless catalog/manifest supplies no whole-bracket lock mode/group or common cutoff, contrary to v1 E3/E4. windows.ts evaluates/submits each window independently, with no group synchronization. Confirm missing configuration contract; do not claim observed UI exploit.

### C6 — CONFIRMED
Defense: categories are caller-selected and official future IDs unavailable. That does not excuse accepting empty/duplicate supplied identities. Runtime categories ['best','best',''] yields three scored markets including synthetic-oscars-2027::nomination:3. ID includes array index, so ['a','b'] vs ['b','a'] changes each category ID. All markets share the same generic entrant objects, lacking ceremony+category+nomination identity. Spec §3.4/P2 mandates those identities and one market per selected category. Empty category-list guard exists but does not address these cases.

### C7 — CONFIRMED, narrowed to emitted manifest
Defense: derivation.ts separately implements validated Play-In branches and graph-cycle checking. This disproves any blanket statement that the repository cannot test advancement. It does not repair buildSyntheticManifest: runtime every edition edges0, every market all shared entrants; Play-In6 entrants vs required two conferences of4; NCAA8 vs76. No reference links the independent helpers to these manifest slots. Provider common manual contract explicitly requires structure/parent/leg links. Draft status prevents official-data claims but is not complete synthetic/manual acceptance.

### O1 — CONFIRMED with feasibility qualification
Defense: spec §4.2 says unknown feasible domains must display unverified, and scorer comment makes unknown factor conservative. But §4.1 explicitly settles forfeited markets to zero possible points. Reproduced one market m weight1 locked unresolved, picks={}: components=[] => earned0/max0/wrong1/pending0; components=[{marketIds:['m'],worlds:null}] => max=null with other values same. This is a redundant-factor inconsistency for an entirely forfeited factor, not permission to ignore unknown worlds affecting other still-scoreable markets.

### FD-01 — CONFIRMED at adapter boundary
Defense: fixed CL endpoint, bounded season request, explicit reviewed match/team mapping, and SQL canonical-edition checks greatly restrict admission; unmapped unrelated rows are not blindly admitted. Counterexample keeps mapped id9001/teams101,202 but competition WRONG, season1999, utcDate2035; returned final observation still assigned configured ucl-2026-27. Inbound metadata never checked/preserved. Mapping document explicitly requires configured competition/season agreement. SQL cannot recover discarded evidence. Actual corrupted persisted result not claimed.

### FD-02 — PARTIAL (mismatch confirmed; universal failure disproved)
Runtime contest externalId='9001', result.data.contestExternalId='match-9001'. SQL structural projection looks up external_object_id (20261009000004...sql:235); result projection uses contestExternalId (20261009000002...sql:187). One reviewed ref for 9001 therefore cannot serve both. However config can set contestExternalId='9001', and separately reviewed aliases could theoretically map both to the same canonical contest. There is no unconditional failure for every valid configuration, nor evidence here of actual seeded SQL mappings. Confirm unsafe/non-enforced reference consistency and built-in fixture mismatch, not guaranteed DB corruption.

### FD-03 — CONFIRMED as missing final-market normalization
Defense: regulation draw is CORRECT for nonfinal knockout legs; normalizer must not blindly turn every shootout into a qualifier. It also retains declaredWinner='HOME_TEAM' in resultData, so winner evidence is not entirely lost. Counterexample explicitly maps FINAL: FINISHED/PENALTY_SHOOTOUT, regularTime1–1, penalties5–4, declaredWinner HOME_TEAM => resultStatus final/outcomeType draw/no winner entry. Spec §3.1 final is a single inclusive champion market. There is no stage-special handling or final derivation in inspected event helpers. Downstream may quarantine draw-for-final, preventing wrong settlement, but cannot make this accepted final journey complete. Do not apply repair logic to ordinary leg markets.

### FD-04 — CONFIRMED omission/diagnostic gap, not unsafe final settlement
Defense: top-level malformed matches throw unsupported_shape; ambiguous statuses/durations and contradictory REGULAR winners fail closed to unresolved, which satisfies part of common lifecycle contract. Counterexample id9999 absent mapping => observations=[], fetchedCount1, no quarantine/reason. Contradictory REGULAR fullTime0–2/winner HOME_TEAM => contest final/result unresolved, no reason; safe evidence includes conflicting values but no affected-observation quarantine signal. Existing downstream quarantine cannot inspect an omitted row. Observed-field mapping requires safe reason for missing identity/unknown fields and quarantine for score contradiction. Avoid claiming contradiction becomes a winner.

### FD-05 — CONFIRMED provenance loss only
Defense: lastUpdated is not established correction authority; deliberately avoiding providerUpdatedAt could be correct. But explicit observed mapping says retain allowlisted provenance. Input timestamp disappears from sanitizedPayload, resultData and normalized observation; observedAt is request time. Runtime confirms omission. Retain source fact separately from trust: no basis for automatically promoting this timestamp into ordering/correction authority.

## Transport and ceiling
http.ts uses injected fetch, redirect:error, AbortController timeout, streamed 2MiB bound, UTF-8/JSON checks, safe error classification. These guards defend against transport risks, not the semantic defects above. Passing15 tests do not cover the new adversarial cases. All E* definitions honestly remain draft/manual/unavailable; findings are local acceptance failures, not evidence of public activation or real provider corruption. SQL inspected, not executed. No finding fully disproven; C5/FD-02 materially narrowed, C3/C7/FD-03/FD-04/O1 interpreted narrowly as above.

changed: this report only (tool audit/test-run incidental runtime files excluded).
matters: distinguishes confirmed contract failures from overclaimed downstream impacts.
checks: 15 existing tests pass; in-memory exact-module counterexamples reproduce counts, identity, forfeit, admission, final and omission cases.
risk: no integrated DB/UI result asserted; concurrent working-tree work may change candidate.
verdict: iterate.
