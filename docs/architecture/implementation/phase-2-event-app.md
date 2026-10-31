# Shared event application — Phase 2 bounded integration

## Criteria (recorded before implementation)

- [x] Nine draft templates create local synthetic lifecycle-enabled leagues without public activation.
- [x] Scoped HttpOnly credentials gate private organizer and participant operations; public output allowlisted.
- [x] Join, versioned windows, freeze, typed results, release/hold/disposition, provenance and leaderboard wired.
- [x] Focused application tests and typecheck pass; actual local service route evidence recorded.
- [ ] Browser/PostgREST acceptance and unresolved later-round pairing transition integration (parent).

## Delivered files and surfaces

Only new `lib/events/application*.ts`, `app/events/**`, `tests/events/application*.test.ts`, and this report. No core repository, migration, legacy app, runtime launcher, provider, notification transport, or credential-file edits. No commits.

- `/events`: nine-template manual catalog/create UI using existing Card/Button and dark/amber design tokens. Explicit local synthetic rehearsal labels; no official future schedules/entrants invented.
- `POST /events/create`: bounded strict JSON; exact same-origin validation; draft seeding through SupabaseTemplateSeedRepository/seedEventTemplates. Creates isolated rehearsal template, sealed lifecycle-enabled configuration, league/evaluation and complete logical windows through existing service repository/RPCs. Draft seed records remain unchanged. Own organizer credential returned only in scoped HttpOnly cookie.
- `/events/[id]` and `/events/[id]/data`: invitation join, own session recovery, complete versioned submissions, organizer freeze, one-way window lock, prerequisite-gated opening, typed result/expiry, release, hold and required/scored disposition controls.
- Explicit UTC timestamps with league IANA timezone display. Unopened per-window stages have no fabricated cutoff; reviewed opening can supply a deadline. Existing deadline never moves later through the DB command.
- Separate non-picking structural window prevents NCAA qualifiers from being mistaken for scored predictions; organizer resolves qualification before the scored window opens.
- Hypothetical-path editor filters participants' dependent choices and clears incompatible downstream drafts; it never substitutes an entrant. Server scoreEvent validation runs before submission.
- Whole safe lifecycle reader drives leaderboard/results. Private capture remains server-only, never an endpoint/DTO. Exact organizer predicate precedes invitation/private capture selection. Public DTO has explicit source-slot/entrant/window/participant/pick fields; lifecycle parser recursively strips private fields.
- Unknown feasibility remains `maximum: null`, displayed as “Temporarily unverified.” No guessed maxima or fake feasibility attestations.
- Oscars setup provisions an isolated synthetic canonical competition/ceremony/category and immutable UUID nomination identities, then binds its private rehearsal template to that edition. Winner-set validation is preserved, not weakened.
- Lifecycle mutation persists first; reconciliation failures retain dirty work and show pending rather than implying rollback.

## Proof

Passed:

1. `vitest run tests/events/application.test.ts tests/events/application-routes.test.ts tests/events/application-picks.test.ts tests/events/application-auth.test.ts`: **25 tests**. All nine graph/manifests, unavailable maxima, scoped cookie options, hosted URL gate, strict command rejection, cross-origin/oversize rejection, no credential response bodies, organizer check ordering, complete hypothetical submissions and Play-In winner/loser routing.
2. `RUN_EVENT_APPLICATION_DB=1 vitest run tests/events/application-db.test.ts`: first real DB-backed handler run **passed in 66.1s**. Actual Next route handlers → application → existing repository → local Postgres **SET ROLE service_role**. All nine create/seal/join/read; eight initially open templates lock/result/provenance/stale-token checks; UCL/WWC/Oscars private complete submissions; Oscars completion earns the hand-authored one-point oracle. Real SQL generated own credentials, never bulk emitted them.
3. `tsc --noEmit --pretty false`: pass.
4. Scoped ESLint for all application files/pages/tests: pass.
5. `git diff --check`: pass.

The DB test uses a narrow PostgREST-shaped query adapter over the existing local Docker Postgres. It runs actual SQL/grants/triggers/RPCs under service_role, not mocked persistence; it does **not** prove PostgREST serialization, network HTTP or browser rendering. It touches only synthetic fixtures, retained for review, and does not apply migrations.

Expanded DB proof adds complete submissions for all nine, NCAA structural resolution/opening, and Oscars hold/clear/release. Two expanded attempts and an isolated Oscars rerun (114.3s, create/join/submit succeeded before public-read failure) hit a local database restart/connection failure (service read/create returned sanitized 503), after the earlier all-nine 66.1s pass. These are not counted as passing final-snapshot end-to-end proof; the isolated rerun did not settle the blocker. A direct read-only Docker/psql probe subsequently returned the exact cause: **FATAL: the database system is starting up**, socket `/run/postgresql/.s.PGSQL.5432`. No missing privilege was worked around. Final expanded service proof remains a parent rerun gate after local DB recovery.

## Exact remaining integration gates / risks

1. **Local HTTP runtime unavailable:** `scripts/local-event-runtime.py` exits “Local Supabase runtime is incomplete; refusing hosted fallback”. Sanitized CLI diagnostic shows only `DB_URL`, no API_URL/ANON_KEY/SERVICE_ROLE_KEY. The local DB initially answered the lifecycle/grant probe and completed the first all-nine run, but later restarted (direct psql: “FATAL: the database system is starting up”). No hosted environment read, alternate runtime credential injection, or launcher workaround attempted. HTTP socket suite exists as `RUN_EVENT_APPLICATION_HTTP=1 vitest run tests/events/application-http.test.ts`; its attempted run failed because no local API/app runtime exists. Parent restores full local Supabase and owns browser acceptance.
2. **Reviewed later-round pairing seam:** sealed graph/choices cannot currently adopt previously unknown UCL regulation home/away orientations or WWC official reviewed placements after early picks seal membership. Application deliberately refuses opening those windows; settled outcome-only prerequisites are not falsely treated as official placement evidence. Parent needs an authorized versioned reviewed-pairing transition that preserves logical membership/old picks, updates eligible/orientation binding consistently, and locks/holds on incompatible post-lock corrections. No protected-table workaround or migration added.
3. **Creation atomicity:** existing repository/setup interface consists of several durable service calls, not a transactional create RPC. A crash can retain an unadvertised partial synthetic rehearsal. Success is returned only after complete setup/reconciliation. For production retry/recovery, a scoped idempotent atomic create/seal RPC is recommended; no migration owned here.
4. **No actual service privilege workaround required:** first all-nine DB run successfully used existing insert grants, configure_event_window, lifecycle commands and immutable award validation under service_role. No missing grant was papered over.
5. Runtime is deliberately gated by both `BRACKET_LOCAL_EVENT_PREVIEW=1` and a loopback Supabase URL. Existing legacy surfaces remain unmodified. This is not public activation or complete roadmap acceptance.

changed: shared manual event application + safe service wiring + synthetic lifecycle setup + focused tests.
matters: real persisted organizer/participant flow now exists beyond domain-only packets.
checks: 25 focused tests; first actual all-nine service-role route lifecycle pass; final typecheck/lint/whitespace pass; expanded SQL reruns blocked by confirmed local DB startup.
risk: local HTTP/browser gate; immutable later-round reviewed-placement seam; multi-call create partial-failure recovery.
verdict: accept bounded integration; hold full end-to-end roadmap acceptance at the explicit gates.
