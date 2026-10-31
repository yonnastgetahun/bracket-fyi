# FD01–05 adjudicated repair
project: BRACKET-FYI
done when:
  - [x] Exact inbound scope, reference continuity, final deciders and provenance regressions pass.
  - [x] Unsafe rows retain bounded identifiers/reasons; quarantine integration ceiling is explicit.
evidence: scoped Vitest, TypeScript parser/type check and source-inspected dispatcher/failure path.

## Changes and configuration contract

- FD01: require reviewed numeric `providerCompetitionId` and `providerSeasonId` in provider config, separately from internal competition/edition external references and the outbound season year. `seasonStart`/`seasonEnd` are now exact provider season dates (YYYY-MM-DD), not loose coverage bounds; season year equals start year. Envelope and each match must agree on CL code and reviewed competition ID; each match must match reviewed season ID and exact dates. Missing/conflicting metadata rejects. UTC match instant must lie in the intersection of requested instant window and inclusive season calendar dates; outbound date-only filters cannot broaden admission. Config without these explicit identities fails before credential/fetch.
- FD02 (partial allegation): contest.externalId now equals the reviewed match mapping's contestExternalId; result.data.contestExternalId uses that emitted reference. Raw numeric match ID remains sanitized evidence and result observation ID, not an implicitly seeded contest alias. Duplicate reviewed contest external identities/keys reject. This closes the mismatch, not a claim that every old configuration failed SQL. Existing bindings must review/migrate their configured reference before enabling this candidate; no aliases are created by the adapter.
- FD03: FINAL is one inclusive result: valid fullTime determines regular/ET champion, while non-tied numeric penalties corroborated by declared winner determine shootout champion. Final regulation must be tied before ET/penalties and fullTime tied before penalties. Contradictions/missing deciders cannot settle. Nonfinal ET/shootout rows retain regularTime regulation outcome, never an inferred qualifier. Penalty scores remain separate evidence, not added to match score.
- FD04: removed silent undefined/drop path. Unknown mapping/stage/status/duration, conflicting entries, malformed final score or declared/numeric contradiction rejects the entire batch atomically with typed invalid_response/never. Fixed reviewRequired/reason plus bounded numeric match/home/away IDs, rowIndex and fetchedCount survive the existing failure sanitizer. No successful prefix escapes. Arbitrary provider text is excluded; unsafe IDs are omitted but row index remains. AWARDED is explicitly held for reviewed authority.
- FD05: validated lastUpdated is retained in sanitizedPayload only, along with safe identity/scope/score provenance. It does NOT populate providerUpdatedAt, providerRevision, providerEffectiveAt, correctionReason or correctionProvenance. Existing trusted correction policy is untouched.

## FD04 integration ceiling — do not close end-to-end quarantine

Inspected normalizedObservationSchema, createObservationDispatcher and orchestrator pull catch. The schema has no rejected-observation variant; a fabricated contest would need invented mapped stage/entries. An unresolved result using an unmapped/raw ID is also not a guaranteed quarantine signal: the DB may already have a reviewed raw-ID reference, and known-contest stage/score conflicts can resolve. Therefore this repair uses the explicitly authorized fail-entire-batch option, not invented normalized identity.

The existing orchestrator classifies the typed failure and finishes the run failed, with sanitized details persisted as run metadata. It **does not** write immutable per-row observation/quarantine records or increment quarantine count for adapter failures. Local tests prove the real failure sanitizer preserves actionable identifiers; source inspection establishes the run-metadata path. No orchestrator/DB execution or per-row quarantine claim is made.

Remaining owner integration: route these fixed review reason codes/identifiers into a proper rejected-observation evidence/quarantine contract (or explicit run-review UI) without fabricating normalized entities. This is outside exclusive provider/test write scope. Until then, the safe failed-run diagnostic is auditable, but per-row quarantine acceptance remains OPEN. One unsafe row holds all rows; only the first unsafe row is identified, intentionally bounding error size.

## Actual verification

All inputs were original synthetic JSON via injected fetch. No real provider calls, spending, credentials, DB mutation or commits.

1. Before implementation: 36 football-data tests, **29 failed / 7 passed**. Reproduced scope admission, missing-reference continuity, missing final winner, silent drops and provenance loss.
2. After implementation and added boundary coverage:
   `npm test -- tests/ingestion/providers/football-data.test.ts tests/ingestion/providers/http.test.ts tests/ingestion/orchestrator/observation-dispatch.test.ts tests/ingestion/orchestrator/failure-policy.test.ts`
   **4 files / 90 tests passed** (49 adapter,12 HTTP,16 existing dispatcher,13 existing failure-policy).
3. Integration-facing regression runs the **real dispatcher** with repository test doubles: persisted contest external object ID equals persisted result normalized contestExternalId under the same binding; safe lastUpdated survives evidence recording without trusted correction fields. This is a dispatcher contract test, NOT an end-to-end SQL/projector test.
4. HTTP original source TypeScript parser diagnostics: **[]**. Displayed `status *** 404` was tool redaction, not corruption; http.ts was not edited. Added runtime 404→not_found regression alongside 401/403/429/503/400, single request/redirect rejection, 2MiB byte cap, malformed UTF-8/JSON and timeout cases.
5. Scoped ESLint: **0 errors / 2 existing unused injected-fetch argument warnings**.
6. `npx tsc --noEmit --incremental false`: no remaining errors in owned files; global check fails on concurrently added out-of-scope `tests/ingestion/providers/oscarbase.test.ts` at lines18,28,54 (four diagnostics). No global green type-check claim.

Transport remains fixed CL endpoint/query allowlist, one injected fetch, manual zero-fetch/zero-credential read, maximum 10s and 2MiB. Invalid nonfinite adapter limit overrides now reject.

changed: football-data.ts, football-data.test.ts, new http.test.ts and this report only.
matters: closes the confirmed adapter-boundary counterexamples without inferred correction authority.
checks: 90 focused passes; scoped lint0 errors; global type check blocked only by stated out-of-scope diagnostics.
risk: FD04 per-row quarantine integration and real DB/provider parity unverified; changed config requires reviewed provider IDs/exact season dates.
verdict: accept bounded adapter repairs; HOLD end-to-end FD04 quarantine acceptance.
