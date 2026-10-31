# Batch 1 skeptic 3 — integration reachability and fail-closed review

Scope: read-only review of catalog.ts, outcomes.ts, football-data.ts and http.ts against spec v1.0, template/provider contracts and observed-field mapping. No application/test edits, provider calls, database execution or repairs. Only this report is written.

## Method and evidence limits

Independently executed the actual TypeScript through an in-memory CommonJS transpilation hook using installed TypeScript; no generated files. FootballDataAdapter used injected fetch returning local Response(JSON.stringify(...)); no network. Runtime cases below are observed outputs, not inferred expectations. Inspected dispatcher, SQL reference/correction paths, window validation and derivation helpers to challenge claimed impacts. A source search across app/lib/scripts finds catalog functions, scoreParticipant and FootballDataAdapter only at their definitions, not integrated production callers. All catalog definitions explicitly remain draft/manual/automation-unavailable. Thus these are candidate acceptance defects, NOT demonstrated live user corruption. No DB state/SQL execution was examined, so database reachability claims below are conditional.

## Dispositions

### C1 — CONFIRMED
Runtime UCL: result=168, qualifier=24, champion=19, total=211; championMarketId=market:193/window:11 (QF). Correct total211 and13 windows are real guards against an overly broad “wrong total” claim, but do not rescue semantics. Spec §3 requires144+44 regulation results,22 qualifiers,one final. catalog.ts:26 indexes kinds by window and caps at last kind; :29 picks first champion rather than designated final211. Definition's champion index210 therefore does not save it.

### C2 — CONFIRMED
Runtime NCAA: total76, structural13, result62+champion1=63 scored; champion market063/window3 (Sweet16). The scoring cardinality63 is correct, disproving any claim that all76 are scored. Nonetheless spec §3 requires75 contests (12 structural qualifiers+63), and :26 incorrectly makes the last Championship-window market structural. Correct qualifier count cannot be recovered by the unused marketCount variable.

### C3 — CONFIRMED (representation defect; scoring impact unproved)
Runtime NBA: eight series/seven champion, champion009/window2 (conference semifinals). Total15 and final market015 exist. A championship series can legitimately carry a champion role, so “all markets must literally have kind=series” is stricter than the prose spec; no literal enum is mandated. But seven champion roles and selecting009 cannot represent the exact Finals champion required by §3. Existing deriveSeries has best-of/clinching guards, but no catalog membership wiring rescues this representation. Do not claim only8 points awarded: every one of15 markets is scored=true.

### C4 — CONFIRMED
Runtime WWC:64 markets; champion048/window3 (group MD3), not medal window7. The two medal slots exist, so bronze is not absent numerically. However neither has final/bronze role or semifinal-loser linkage; edges are empty. Generic opaque IDs alone are not inherently defective, but absent roles/links plus wrong champion fail §3 WWC final/bronze semantics.

### C5 — PARTIAL
Confirmed NCAA6 and NBA4 catalog windows and no lock-mode/group data. Spec requires one whole-bracket cutoff for each. Attempt to disprove: multiple window records can all share the same cutoff; windows.ts evaluateWindow enforces cutoff and validateWindowSubmission requires complete eligible picks. Therefore number of windows DOES NOT establish actual per-round unlocking or a bypass. Catalog lacks the required executable lock policy; actual lock violation is unresolved because there is no integration consuming these definitions.

### C6 — CONFIRMED
buildSyntheticManifest Oscars accepts categories=[""] (one market with blank category), ["acting","acting"] (two scored markets for same category). Reordering ["acting","film"] to ["film","acting"] changes both market IDs because positional suffix is part of identity. All category markets share synthetic-entrant-1..4, not category nomination identities. Guard rejects only empty category array. Empty-array rejection and draft/synthetic labeling prevent accidental official activation, not invalid synthetic identity. P2 and E8 require stable distinct nomination/category identity; no production corruption demonstrated.

### C7 — CONFIRMED, limited to manifests
Runtime NCAA has8 entrants, Play-In6; edges=[] for both, all markets share entire entrant pool. Required fields are76 and8 respectively. deriveSeries, playInPredictions, playInWorlds and validateGraph independently enforce useful constraints; therefore broad claim “code cannot test advancement” would be false. But these manifests contain no branches/seed roles and cannot exercise those domain cases as an event journey. validateGraph permits empty edges; it cannot invent omitted topology.

### O1 — CONFIRMED discrepancy; conservative failure
Input [{id:"m",weight:1,locked:true,result:{kind:"unresolved"}}], picks={}:
components=[] -> {earned:0,maximum:0,wrong:1,pending:0};
components=[{marketIds:["m"],worlds:null}] -> same except maximum:null.
outcomes.ts returns null for unknown worlds before applying fixed-forfeit zero. Spec §4 permits unverified maximum when feasible outcomes cannot be trusted, but here maximum contribution is independently known zero; no outcome can restore a locked missing pick. This is unnecessary unavailability/inconsistency, not an optimistic fabricated score. No production caller found.

### FD-01 — CONFIRMED at adapter boundary
Local valid reviewed ID9001, FINAL, teams1/2, FINISHED REGULAR2–1 emits final. Changing competition toPL/id999, season dates to1999–2000 and utcDate to2000-01-01 still emits final in configured ucl-2026-27, with stale scheduledAt. safeConfig validates outbound bounds and mappings; pull clamps request season/date range. These only constrain request, not returned metadata. Mapping guards mean arbitrary unknown foreign ID is dropped, so arbitrary cross-edition import is not proven. Contradictory metadata on an accepted ID is accepted. Fixed-origin bounded http transport does not validate scope.

### FD-02 — PARTIAL (confirmed mismatch; unconditional SQL failure disproven)
Runtime configured9001->match-9001 emits contest.externalId="9001", result.data.contestExternalId="match-9001". SQL 20261009000002_slice_2b_atomic_result_projection.sql:181–207 looks up exact contestExternalId under binding and quarantines mapping_missing if absent. There is no inherent requirement that a provider have only one reviewed reference per canonical entity: an independently seeded reviewed match-9001 alias can resolve; configuring contestExternalId="9001" also avoids mismatch. Therefore mismatch is confirmed for supplied configuration/tests, but actual database failure needs ref-state evidence. Missing refs fail closed, not mis-settle. Adapter tests assert output result but never downstream reference continuity.

### FD-03 — CONFIRMED missing final semantics; live harm unproved
FINAL/PENALTY_SHOOTOUT/HOME_TEAM, regularTime1–1 and penalties5–4 -> final draw, no winnerEventEntryExternalId; resultData retains declaredWinner HOME_TEAM. This challenges the claim that winner information is totally lost: declaredWinner survives. Regulation normalization is correct for nonfinal legs, and generic raw-contest results could in principle feed a distinct final-market mapper. But no such mapper reads declaredWinner anywhere in lib; spec §3 says final champion includes ET/penalties, and observed-field mapping explicitly identifies FINAL as one champion market. Current adapter has no FINAL-specific semantics and emits final draw. Correction must not simply change all shootout rows to winner, which would break regulation-leg semantics.

### FD-04 — CONFIRMED omission; blanket unsafe-final claim disproven
Local unmapped id666 produces observations=[]/fetchedCount=1, no evidence or quarantine record. Adapter loop skips undefined normalized rows, so downstream dispatcher cannot quarantine invisible rows. Contracts P3 require unknown/conflicting mappings quarantine. Conversely malformed envelope rows are rejected wholesale; unknown status becomes suspended plus unresolved result; REGULAR2–1/AWAY_TEAM produces unresolved/pending, not guessed final. Contradiction has no explicit reason, but partial evidence retains declaredWinner and sanitized regulation scores, allowing human reconstruction. A previously final result also has downstream conflicting-terminal guards. Hence omission/auditability defect stands; not every invalid row silently settles.

### FD-05 — CONFIRMED provenance loss, NOT automatic correction
Input lastUpdated2027-06-12T15:00:00Z disappears from both observations and sanitizedPayload; observedAt/receivedAt become requestedAt2027-06-15. observed-field-mapping.md:23 explicitly requires retaining allowlisted provenance. contracts.ts supports providerUpdatedAt and dispatcher forwards it, but adapter never populates it or retains lastUpdated elsewhere.
Important counterevidence: SQL result projector :264–292 quarantines changed terminal outcomes without comparable trusted timestamps, and even newer timestamps need correction reason/provenance plus allowTrustedCorrections policy. Loss does NOT establish latest-fetch-wins. Merely copying source time into a trusted ordering field should not be taken as sufficient correction authority.

## Transport review

http.ts supplies redirect:error, AbortController timeout, streamed byte ceiling, fatal UTF-8, JSON parsing and safe classified errors. These are meaningful transport guards, not defenses for C*/O1 or inbound event semantics. Manual mode returns empty batch before credential/fetch. No transport issue was asserted from the ledger; none invented.

## Reproduction details

In-memory hook used installed typescript.transpileModule(CommonJS,ES2022) and require.extensions[".ts"], resolving @/ to absolute repo root. Catalog calls used startsAt="2027-01-01". Provider config: reviewed FINAL stage;9001->{contestExternalId:"match-9001",contestKey:"final",name:"Final"}; teams1/2->a/b; season2026; bounds2026-07-01..2027-06-30; window2027-06-01..06-30; requestedAt2027-06-15. Every response was injected local JSON and passed providerBatchSchema.parse.

No full suite/build claimed; narrow runtime probes plus exact source inspection are sufficient to decide listed boundary behaviors, not all-eight integration acceptance. Initial guarded rg invocations lost shell quoting and failed harmlessly; rerun with full-command quoting succeeded. No files besides this report were written by this review.

Verdict: HOLD acceptance of this candidate. C5 and FD-02 must retain partial/conditional dispositions; other findings stand with narrowed reachability and safety claims above. Draft gates, reference quarantine and terminal-correction guards are effective counterevidence against claims of demonstrated live corruption.
