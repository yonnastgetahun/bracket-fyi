# Phase 2 interim maximum oracle

## Work item

- [x] Establish an independent exact maximum contract for every synthetic full-window checkpoint.
- [x] Require the authoritative interim `null` contract and exact settled final totals.
- [x] Record derivation, WWC pre-bronze nuance, and open numeric coverage scope.

project: bracket-fyi Phase 2 browser acceptance
owner: full-window browser harness
evidence: `scripts/browser/full-window-plan.mjs`, its pure Node tests, and the lifecycle/scorer integration test

## Contract derivation

The approved v1 spec defines maximum possible score as the highest final total under one jointly consistent completion. It includes earned points once; unlocked future windows may contribute optimally selectable picks; locked wrong/eliminated/forfeited picks cannot. If trusted evidence cannot establish feasible outcomes, the maximum is temporarily unverified (`null`), rather than a guessed bound (§4, §6).

The authoritative application manifest intentionally excludes the UCL/WWC reviewed-placement feasibility components: `buildApplicationManifest` filters components whose evidence is not trusted. Consequently, the production `evaluateLifecycle` → `scoreEvent` path returns `null` at every ordinary interim checkpoint, even though the independent hand plan supplies one synthetic completion. The browser oracle reflects that application contract; it does not turn the hand plan into a numeric feasibility certificate.

| edition | windows | scored total | expected maximum |
| --- | ---: | ---: | --- |
| UCL 2026–27 | 13 | 211 | `null` for windows 1–12; **211** once all 13 settle |
| WWC 2027 | 7 | 64 | `null` for windows 1–6; **64** once all 7 settle |

The WWC runner has one deliberate intermediate observation after the champion result and before the bronze result. The participant's bronze pick was submitted with the window; earned is 63, the lifecycle remains incomplete, and the authoritative maximum remains `null` because the reviewed-placement feasibility component is absent. The final settled observation is exactly 64.

The hand-derived counts and winners validate shape, earned totals, and the final settled total. A pure lifecycle integration test builds the real application manifest and calls `evaluateLifecycle`, exercising the production scorer to prove the interim `null` and final 211/64 behavior. The oracle itself remains source-independent: it does not import or call the production scorer to generate expected values.

## Scope boundary

This oracle applies only to the current all-correct synthetic participant and this scoped application-manifest contract. Numeric jointly-feasible coverage for other trusted fixtures remains open; this change does not close all P11 numerical coverage. A future harness covering omitted/unsubmitted picks, locked wrong picks, eliminated choices, or newly trusted feasibility components must derive a separate oracle: those cases can lower the maximum or legitimately require `null` per the spec. The WWC bronze checkpoint is not evidence that a medal result is known.
