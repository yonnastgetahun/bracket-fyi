# Phase 2 independent P1/P3 security review

2026-10-27. Read-only code review; only this report written. Base HEAD: `13ed21e0fe3f148b107ae1421e28de3a2bcbffefif`, plus current dirty P1/P3 files. No live/network/DB actions; no repairs. Normative: approved spec §6 P1/P3; full-roadmap-execution-contract §P1/P9 and §P2/P3. Verdict: **ITERATE**; page hardening is useful, but P1/P3 acceptance is not established.

## Confirmed changed-code defect

### SEC-01 — HIGH — unchecked automatic mappings acquire “verified” provenance

**Evidence:** `lib/ingestion/identity/repository.ts:150–164` writes `verifiedDeterministicBootstrap: true` for every `recordAutomatic` call, overriding even false input metadata. `toCanonicalRef` (84–98) treats that boolean plus any nonempty normalization version as provenance; `resolve.ts:85–104` then accepts the mapping. No deterministic derivation, approved bootstrap artifact, supported-policy verification, or authorization is checked. SQL `20261009000000_slice_2b_observation_evidence.sql:390–470` checks mapping shape/state and binding, not this claim.

**Reproduction:** supply a new mapping from arbitrary external ID to an existing eligible but wrong canonical ID, `normalizationVersion: "anything"`, `metadata: {}` (or flag false). Capture RPC arguments: flag becomes true. Persist/echo the returned automatic row; feed its canonicalRef into resolveIdentity: automatic acceptance. The repository unit test currently explicitly blesses the metadata-empty case.

**Impact:** a caller-supplied association is laundered into verified deterministic bootstrap. This is an internal/service boundary defect, not evidence of an anonymous browser exploit; mapping RPC grants exclude anon/authenticated.

**Required guard/proof:** only a verified, scoped bootstrap operation may persist authoritative provenance; validate algorithm/version, source association and scope before acceptance. Reject caller flags/unsupported versions; independently test incorrect same-edition mappings, false flags and unauthorized bootstrap. Do not substitute another caller-controlled boolean.

## Confirmed baseline defects not repaired by this packet

### SEC-02 — HIGH — SQL projection bypasses the stricter TypeScript identity gate

**Evidence:** production dispatcher `lib/ingestion/orchestrator/observation-dispatch.ts` calls structural/result repositories directly; it does not call resolveIdentity. Current SQL root projector in `20261009000004_slice_2b_r2_acceptance.sql:232–241` accepts any automatic/reviewed reference; parent lookups (304,333,356) also only check status. It does not validate bootstrap metadata. This is pre-existing integration scope, not a newly introduced regression.

**Reproduction:** existing automatic organization/competitor reference with empty metadata, valid canonical target and otherwise valid observation; dispatch through the real repository/SQL projector. Status check permits projection although the new TS resolver would quarantine that reference.

**Required guard/proof:** enforce the same verified provenance rule at authoritative SQL projection/mapping boundaries, including referenced parents. Add real-DB legacy automatic replay test proving quarantine/no canonical write, alongside valid verified-bootstrap and reviewed controls. Passing isolated resolver tests cannot establish P3.

### SEC-03 — HIGH — direct database access policy still exposes bearer columns

**Evidence:** `20260724000002_rls_policies.sql:60–86` permits anon SELECT on a league using its join token and participant rows using league membership. Row policies do not restrict columns; the comment explicitly relies on application filtering for magic_token/push_subscription. Initial schema stores organizer_token/join_token in leagues and magic_token/push_subscription in participants. No later column/table revocation for these objects was found. Safe server DTOs do not apply to direct PostgREST requests.

**Reproduction to run locally, not executed here:** with ordinary Supabase anon SELECT grants, send a valid `x-league-token` directly to `/rest/v1/leagues?select=id,organizer_token`, then `/rest/v1/participants?select=id,magic_token,push_subscription`. RLS admits the rows, exposing organizer authority and other participant recovery credentials. Existing `picks_insert` also checks league join authority but not ownership of participant_id; include cross-participant/cross-league writes in the direct-role harness.

**Required guard/proof:** revoke broad direct access or implement safe constrained read/write interfaces with ownership checks; prove actual anon/authenticated privileges and direct requests. This is a confirmed inadequacy in repository SQL policy, while actual deployed/default grants and live exploitability were **not inspected**.

## Known missing integration proof (not new code regressions)

- GAP-01: default owner-rights `v_pick_results`, `v_champion_status`, `v_leaderboard` and `effective_results` are not declared security_invoker; no corresponding anon/authenticated revocations found. Given SELECT grants, they can bypass underlying RLS/pre-lock privacy. Inspect actual local grants and view ownership and test direct no-token reads, not only Next route mocks. No claim of a live query result.
- GAP-02: tests inspect React element props and mocked query chains, not rendered HTML/RSC, browser cookie issuance, or real PostgREST/RPC roles. No deployment/DB grant verification or production build was performed by this reviewer. Reported builder “59/build pass” is not independently re-established.
- GAP-03: page/data visibility uses legacy whole-league locked_at. Per-window open-pick privacy for new templates still needs end-to-end integration; do not treat this packet as proving window-aware visibility.

## Guards that hold in reviewed code

- Admin page validates exact organizer token and league before participant/pick selection. Participant page independently validates exact magic token and league, even if proxy cookie fast-path was forged/stale.
- Home pre-lock recovery returns only validated own picks; compare selects no private picks before lock. Matches requires validated participant/join/organizer access before pre-lock results.
- Live route is under cookie-scoped /l path, checks exact own participant ID pre-lock, ignores forged x-magic-token as authority, and returns no-store. Post-lock public safe display is intentional approved policy, not an auth bypass.
- Recovery POST authorizes exact organizer API cookie before selecting only the requested league-scoped participant token; no-store response. Bulk admin props omit recovery credentials.
- Safe league/participant/pick/champion/leaderboard/match DTOs explicitly select and project columns. Optional absent/malformed cookies fail closed without token-bearing error bodies in these reviewed read/recovery paths. No new confirmed no-token error leak.
- Exact/fuzzy alias candidates now remain advisory; automatic refs without provenance fail closed in the standalone TS resolver. These improvements do not resolve SEC-01/02.

## Verification

Offline command: `cd /Users/yonnasgetahun/bracket-fyi && ./node_modules/.bin/vitest run tests/security tests/ingestion/identity`.

Actual result: **5 files / 50 tests passed**, including 34 page/route tests, 3 DTO tests and 13 identity tests. Static review of current diff and SQL baseline completed. No application files/tests changed.

changed: independent review report only.
matters: distinguishes successful route/DTO hardening from unresolved authoritative mapping/direct-data boundaries.
checks: 50 scoped unit tests pass; SQL/static findings above; no real-DB or network proof.
risk: default/deployed grants and full integration remain unverified.
verdict: **iterate**.
