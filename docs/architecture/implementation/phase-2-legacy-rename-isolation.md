# LEGACY-RENAME — Spec v1.0 §5.5 isolation repair
project: BRACKET-FYI
done when:
  - [x] Renaming in league A leaves shared template and league B unchanged; legacy reads retain IDs and resolve A names.
  - [x] HTTP/network failures never invoke rename success and show a retryable error.
  - [ ] Additive migration 00013 and replayable forward repair protect storage from public writes.
evidence: focused Vitest, TypeScript/ESLint and DB39 (DB execution reserved to parent).

## Before implementation
Owner: bracket-legacy-rename-isolation. Scope: competitor PATCH/UI, legacy registry reads, tests, migration 00013/repair. No app/events or lib/events, DB/Docker/browser, commits or publication.
Confirmed source reproduction: PATCH updates templates.team_registry selected through the league template ID; two leagues sharing that ID therefore see the mutation. UI awaits fetch but ignores response.ok and then calls onRename, and rejected fetch is unhandled. No hypothesis sweep needed: both faulty statements are directly observable. Regression loop uses the actual route against an in-memory query double and actual component callbacks with a hook harness; runtime DB/browser proof remains parent-owned.
Compatibility: stable registry IDs/aliases/order, picks, results and locks untouched. Per-team upsert avoids unrelated-team lost updates. No reconstruction of historical shared renames (original names cannot be inferred). Only service role can access new storage, with organizer authorization still required at HTTP boundary. Read failure must not silently return stale names.

## After implementation (2026-10-28)
changed: Added service-only RLS-protected league_competitor_names, keyed by (league_id, template_id, team_id); competitor PATCH upserts only this table and returns persisted normalized name. All legacy league-page registries and custom-bracket clone metadata resolve scoped overrides. Shared catalog reads remain unchanged. Admin UI confirms HTTP + payload before publishing, catches transport failure, keeps editable draft, renders retry guidance and deduplicates pending Enter/blur.
matters: Shared template identity, labels in other leagues, IDs/aliases/seeds/order and scoring inputs are unchanged. Errors cannot falsely publish a saved name; uncertain transport delivery is worded as unconfirmed (not a claim that the server definitely did not save).
checks:
- npx vitest run tests/admin/competitor-isolation.test.ts tests/admin/competitor-ui.test.ts tests/admin/admin-routes-authorization.test.ts tests/security/league-pages.test.ts: 4 files / 50 tests passed. Actual route + read helper run against query double; actual component element callbacks run through deterministic hook harness. This is not DOM/browser acceptance.
- npx eslint app/api/admin/competitor/route.ts components/AdminConsole.tsx lib/league-data.ts app/l app/api/league app/create/page.tsx tests/admin/competitor-isolation.test.ts tests/admin/competitor-ui.test.ts: zero errors, two existing AdminConsole unused-helper warnings.
- git diff --check: passed.
- npx tsc --noEmit --incremental false: blocked by concurrent/unowned tests/events/synthetic-feasibility.test.ts:3, missing @/lib/events/synthetic-feasibility; no owned-path diagnostics.
- Initial route-test attempt had 4 failures because the new test used an incorrect organizer cookie name; corrected to actual bfyi_organizer_<UUID> and reran successfully. This was a harness error, not acceptance proof of the original bug.
risk: DB39 and fresh/populated/replayed migration/forward repair remain unexecuted by this child, as required. Browser focus/rendering and real HTTP/reload isolation remain parent-owned. Historical globally-mutated names cannot be reconstructed without authoritative original labels. New reader requires migration 00013 before use; old reader safely ignores overrides but cannot display them.
verdict: iterate — source/nonDB packet complete; parent runtime and independent verification pending.

## Exact owned paths
- app/api/admin/competitor/route.ts
- components/AdminConsole.tsx
- lib/league-data.ts
- app/api/league/[id]/route.ts
- app/create/page.tsx
- app/l/[league_id]/page.tsx
- app/l/[league_id]/admin/page.tsx
- app/l/[league_id]/compare/page.tsx
- app/l/[league_id]/matches/page.tsx
- app/l/[league_id]/p/[magic_token]/page.tsx
- tests/admin/competitor-isolation.test.ts
- tests/admin/competitor-ui.test.ts
- supabase/migrations/20261027000013_league_competitor_names.sql
- supabase/rollbacks/20261027000013_league_competitor_names_forward_repair.sql
- supabase/tests/database/DB39_league_competitor_names_test.sql
- This criteria/report.

## Parent runtime proof still required
Apply 00013 in sole DB lane; run DB39 (11 assertions covering scoped upsert, shared template preservation, grants/RLS and name constraints). Apply forward repair twice with populated overrides and verify rows persist. Exercise two legacy leagues sharing one template via authenticated PATCH, reload admin + participant/public/compare/matches displays, verify only A changes; intercept HTTP 403/500 and network failure in browser to prove visible error and unchanged committed label plus retry. Re-run typecheck after concurrent synthetic-feasibility work settles. No DB/Docker/browser, commits or pushes were executed by this child.
