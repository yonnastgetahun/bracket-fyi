# P11 settled-batch integration

Existing full Phase 2 criteria/authority remain unchanged. Not accepted, no publication.

## Received batch (all settled; never wait again)
- Integrated skeptic: P2 awards provisioning discards trusted feasibility components after entrant remap; numeric maximum becomes null. Other rename/recovery source scope found no actionable issue; runtime remains pending.
- Legacy/recovery browser runners delivered; source only, 7 contract tests.
- Shared/UCL/WWC fixture generator delivered; source only, 12 plan tests.
- Populated migration13 checkpoint/whole-row/ACL replay assertions delivered; no runtime.
- Full-window browser runner delivered; source only, 6 pure tests.

## Parent observations
- Combined scripts/browser/*.test.mjs: 17/17 PASS, zero skips. Log /tmp/bracket-p11-browser-pure-checks.log.
- New bounded readiness probe /tmp/bracket-p11-readiness-resume.py: docker inspect reports owned bracket-p11-db-9bd170c85c0f running/restart0, but docker exec SQL returns128 FailedPrecondition: init process not running. Not healthy. No HTTP retarget/migrations/browser run.
- Prior clean SQL39files1163 assertions remain valid completed evidence; subsequent Docker-wide failure does not establish current readiness or race acceptance.
- Added BRACKET_TEST_DB_CONTAINER allowlist to verify-event-transitions.py, matching existing race runners; default unchanged, accepts only known shared or bracket-p11-db-12hex. Python compile and five isolated AST-executed allowlist controls PASS. No runtime.
- Shared services/unrelated containers remain untouched. No host restart/config/capacity authorization inferred.

## New active children (distinct from settled batch)
- a6e7345b / 3f4c9489: awards provisioning fix + post-provisioning scorer regression, product/test exclusive ownership.
- 72c815d9 / 7147ac27: read-only independent review of new browser runners and seeder.
- 232bf885 / 4470d03a: NEW legacy/recovery private fixture seeder/helpers/tests; no product edits/runtime.
Await these new announcing results, inspect and fix actionable findings. Runtime parent-only, serial and dependent on verified readiness. New seeder needed because previous shared/UCL/WWC generator cannot supply legacy/recovery prerequisites.

## Remaining
Repair awards finding; integrate/review fixture/harness source; ensure fixture adapter supports owned isolated target before execution. Once Docker truly responsive: current lock-barrier races; populated transitions through13; inspected /tmp/bracket-retarget-owned-http.py; refresh copied app after source fix; nine HTTP/browser plus shared/later/full/recovery/legacy/PWA acceptance. Exact-head full tests/types/build/lint, independent review and scoped PR follow only real verification. If VM remains unavailable, report infrastructure blocker and exact host intervention required; no false completion.
