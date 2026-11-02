# Phase 2 provider repair — PS-01–05

## Binary work item (before implementation)
project: BRACKET-FYI
done when:
- [x] Every retained BDL leaf rejects malformed nested values; MLB runs reject noninteger/negative values.
- [x] NFL/MLB emit only approved query keys and reject ambiguous date ranges before credential/fetch.
- [x] Runtime modes and own-key sports reject before credential/fetch; manual stays offline.
- [x] OSC rejects contradictory counts/page bounds and >100 rows; sparse/empty controls stay valid and provisional.
evidence: original synthetic public-interface red/green regressions; focused tests and static checks.

Scope: only BDL/OSC adapters, focused tests and this report. TDD skill used; existing repair authority supplies the behavior approval. No network, provider/credential access, schema changes or commits. No self-acceptance.

## Changes and bounded semantics

- **PS-01:** all retained top-level and nested BDL leaves pass explicit type schemas. IDs/counts/scores are nonnegative safe integers; flags are booleans; text fields are strings; college OT arrays contain only nonnegative safe integers. Missing/null optional fields stay unknown. Unknown siblings remain stripped. Unknown status text remains evidence, not final status. Objects/arrays under scalar keys fail with typed invalid_response.
- **PS-02:** NFL/MLB accept no dates or **both explicit equal date bounds**, emitting one dates[] value. Unequal ranges and one-sided bounds fail before credential/fetch; no assumed range/list intersection, bounded enumeration, or implicit single-day conversion of an open bound. NBA/college use approved start_date/end_date alone, without simultaneous dates[]. Calendar rollover and non-string/empty bounds reject. This intentionally narrows the previously ambiguous input contract; future multi-day NFL/MLB support requires a reviewed list/range contract.
- **PS-03:** the same recursive validator checks BOTH nested MLB runs leaves. Negative, fractional, numeric-string, boolean, object, array and unsafe-integer values reject. Zero, positive integers, null and omitted scores remain distinct.
- **PS-04:** exact manual/provider admission in both transports; BDL additionally requires string-valued own-key sport membership before the manual shortcut or credential resolution. constructor/__proto__/toString and array-coerced keys cannot select config. Valid manual remains credential/fetch-free.
- **PS-05:** OSC bounds row count by 100 and total; nonempty pagination must stay within declared totalPages and total cannot exceed totalPages*100 capacity. Empty exception is explicitly total=0/page=1/totalPages=0/data=[]. No ceil(total/100) equality or full-page occupancy assumption: total=2/totalPages=2 with one row still passes. Boolean winners remain provisional; duplicate and scope quarantine unchanged. Terminal pagination is not settlement/completeness evidence.

## Executed red/green evidence

Original invented responses use native Response and injected fetch through the real transport/parser; no HTTP/provider/credential-store calls. Credential strings are synthetic.

| Slice | Observed red | Observed green |
| --- | --- | --- |
| PS-01 recursive leaves | BDL 1 failed / 3 passed; object-valued id retained | Combined PS-01/03 BDL 6 passed |
| PS-03 both runs leaves | Combined BDL 2 failed / 4 passed; runs=-3 retained | BDL 6 passed; both-side numeric matrix and unknown controls |
| PS-02 exact queries | BDL 3 failed / 6 passed; forbidden/duplicate keys, accepted range | BDL 9 passed |
| PS-04 runtime guards | BDL/OSC 3 failed / 13 passed; invalid modes accepted and inherited sport native TypeError | 2 files / 16 passed |
| PS-05 counts/pages | OSC 6 failed / 10 passed; all six contradictory envelopes accepted | 2 files / 27 passed |
| Final added scalar controls + test typing | Initial tsc reported implicit-any test callback, repaired | **2 files / 29 passed; tsc and scoped eslint exit 0** |

PS-01 and PS-03 share one leaf validator, so their independently failing regressions preceded that common implementation. Runtime regression casts intentionally cross the TypeScript boundary. The exhaustive leaf matrix uses the existing field registry; additional hand-authored primitive/OT controls and both-side runs tests constrain behavior independently.

Final exact checks (all via /Users/yonnasgetahun/clawd/bin/exec; shell bodies requiring cd passed as one quoted argument):

~~~sh
npm --prefix /Users/yonnasgetahun/bracket-fyi test -- --root /Users/yonnasgetahun/bracket-fyi tests/ingestion/providers/balldontlie.test.ts tests/ingestion/providers/oscarbase.test.ts
/Users/yonnasgetahun/bracket-fyi/node_modules/.bin/tsc --project /Users/yonnasgetahun/bracket-fyi/tsconfig.json --noEmit --incremental false
cd /Users/yonnasgetahun/bracket-fyi && ./node_modules/.bin/eslint lib/ingestion/providers/balldontlie.ts lib/ingestion/providers/oscarbase.ts tests/ingestion/providers/balldontlie.test.ts tests/ingestion/providers/oscarbase.test.ts
~~~

Focused lint: 0 errors/0 warnings (removed two unused named arguments from existing mock). Typecheck emitted no files. No build, full-suite or DB proof claimed.

## Remaining integration gaps / independent review handoff

- PS-G1 remains: transport does not require complete game/team/date identity or establish NFL postseason, CFP membership, or separate NBA Play-In/playoff membership. Reviewed canonical contest/phase mapping and required identity admission belong in the downstream integration; season/query filters are not proof.
- PS-G2 remains: reviewed per-row nomination mapping, grouped credits, cross-page duplicate/conflict handling and operator settlement/correction attestation. false never becomes settled-loser here.
- No shared-account budget/orchestrator/stop/shadow integration, durable cursor replay, lifecycle/final normalization, revision ordering, persistence/scoring or end-to-end DB evidence supplied by this repair.
- No live provider schema, field-type parity, account entitlement, date semantics, redistribution permission or deployment verified. Stricter parsers fail closed on alternate runtime types until reviewed.
- Typed nomination schema/reader/race/forward-repair proof remains outside this ownership; no schema edits made.
- Existing dirty/untracked work belongs to other owners and was not reverted. This worker wrote only the four listed source/test files and this report. No commits or activation.

changed: PS-01–05 transport boundary guards plus original regression tests.
matters: malformed evidence and ambiguous/forbidden requests now reject locally without inventing settlement.
checks: 29 focused tests; project no-emit typecheck; focused lint; owned-file whitespace scan.
risk: remaining integration/live gaps above; independent skeptical post-repair verification pending.
verdict: **HOLD for independent acceptance**; implementation complete within assigned boundary, not self-accepted.

## Final source/test identities

| File | SHA-256 |
| --- | --- |
| lib/ingestion/providers/balldontlie.ts | 5ee5e2c1b9c850d43b55c091034b626483dfdd4476f516bbd94d738f3c6ebb94 |
| lib/ingestion/providers/oscarbase.ts | 2b28ff304cda19c72a3d58808b1c870a1038de6a1a6d550d765bde7feab9e653 |
| tests/ingestion/providers/balldontlie.test.ts | d3086de9bb6e4b26077c60de5b771bb290fdb8e6386ef3a14617ba87af1a87de |
| tests/ingestion/providers/oscarbase.test.ts | 607d324119e4f95d99e8bd4ee029c8f99fb3c81586fa92eae9f9ad4f330a36ce |
