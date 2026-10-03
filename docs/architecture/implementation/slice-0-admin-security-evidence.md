# Slice 0: Organizer Admin Security and Test Baseline

**Date:** 2026-10-03
**Status:** Implemented and verified locally; not deployed
**Evidence ceiling:** Static/local and mocked database-boundary verification

## Approved scope

- Shared server-side organizer authorization for `/api/admin/**` mutations.
- Organizer API-session cookie established only after middleware validates the organizer link/session.
- League, participant, template match, winner, and lock-state checks needed at the current mutation boundary.
- Bounded JSON parsing and field validation.
- Focused automated test harness and route-level tests.
- G0 provider-budget and terms-owner decision record.

Excluded: database migrations, provider access, scheduler work, notifications, production data, deployment, issue #3 implementation/closure, and live browser/device testing.

## Behavior delivered

- Every admin mutation requires an HTTP-only, same-site organizer credential scoped to `/api/admin` and verifies that token against the requested league before using the service-role client.
- Per-league API cookie names preserve simultaneous organizer sessions for different leagues.
- Missing, malformed, and wrong-league credentials return a generic `403`.
- Admin JSON bodies are limited to 16 KiB; malformed JSON and invalid field types fail before authorization/database access.
- Participant rename/removal includes `leagueId`, filters by both participant and league, and returns `404` when the participant is outside the organizer's league.
- Result overrides require the match to belong to the league's template and the winner to exist in that template's competitor registry.
- Lock requires `active`; unlock requires `locked`.
- Existing organizer UI participant mutations now send the league identity required by the server boundary.

## TDD evidence

The tracer test first demonstrated the vulnerability: an admin lock request without organizer credentials returned `200` and invoked the privileged client. It then passed after the shared authorization boundary was introduced.

Subsequent red/green cases covered:

- missing and wrong-league credentials;
- organizer-link validation creating the API cookie;
- all six admin routes rejecting unauthenticated mutations before service-role access;
- malformed and oversized payloads;
- participant ownership for rename and removal;
- template-match ownership and winner membership;
- legal lock and unlock transitions;
- successful authenticated lock, unlock, participant mutation, and result override paths.

## Verification results

| Check | Result | Evidence level |
|---|---|---|
| `npm test` | Pass: 6 files, 22 tests | Static/local with mocked database boundary |
| `npx tsc --noEmit` | Pass | Static/local |
| `npm run build` | Pass: Next.js production build, 17 static pages generated | Static/local |
| `git diff --check` | Pass | Static/local |
| `npm run lint` | Not runnable: repository has no ESLint configuration and `next lint` opens an interactive setup prompt | Tooling gap |
| `npm audit --omit=dev` | Fails: one critical and one high production dependency finding, rooted in Next.js 14.2.35 and its bundled PostCSS | Dependency risk |

## Residual risks and follow-up

1. **Framework security upgrade:** npm reports Next.js 14.2.35 in multiple advisory ranges, with the available aggregate fix requiring a major Next.js upgrade. The app does not currently use `next/image`, Server Actions, custom rewrites, CSP nonces, or WebSocket upgrades, which narrows several listed exploit paths but does not make the unsupported version acceptable for future production rollout. A separate bounded Next.js upgrade slice requires owner approval because it can change runtime behavior broadly.
2. **Lint baseline:** ESLint policy/dependencies must be selected and committed in a separate tooling slice; this slice did not answer an interactive prompt automatically.
3. **Database evidence:** Tests exercise public route handlers with the Supabase client treated as the external boundary. No disposable Supabase integration test has run yet.
4. **Shared competitor registry:** The existing competitor rename operation writes the template registry. An authenticated organizer can therefore affect other leagues if they share that template. A durable fix needs explicit catalog/template ownership in the G1 schema; do not rely on naming heuristics.
5. **Deployment:** Production still runs the previous routes until an explicit deployment gate is approved and live smoke tests are defined.

## Rollback

Before deployment, rollback is a normal git revert. After deployment, reverting removes the API cookie and route authorization requirement; because that would restore the original vulnerability, prefer a corrective forward patch unless the routes are simultaneously disabled.
