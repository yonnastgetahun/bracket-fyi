# Final provider SQL / trusted numeric runtime
2026-10-30 local · authorized synthetic-only Phase2 · no commits/live/deploy/spend/sends.

## Verdict
**HOLD trusted numeric completion: 9/12 actual persisted-and-rendered checkpoints passed, three WWC checkpoints unverified.** All five provider SQL scenarios passed. Runtime jobs finished; ephemeral Chrome closed; existing HTTP app and retained DBs left intact. Parent owns final repo-wide checks/review.

## Provider test repair and proof
Prior stable-source original run reproduced two expected-complete/actual-locked failures (NBA playoffs and MLB). Independent inspection of migration 00006 lines 306–309: completion requires at least one required, non-excluded market. These child-only manifests set scored=false, have no required override, and intentionally award zero series points. Changed only the lifecycle assertion to child ? locked : complete, with rationale comment; no production completion change or numeric relaxation.

Command: python3 scripts/family-runtime-integration.py sql
Evidence: tmp/family-runtime/1793405247606200000-sql.json
Result: **15 passed, 0 failed, 0 skipped** (10 pure + all 5 actual SQL).
All five reached downstream replay identity, lifecycle replay, untrusted correction quarantine, unmapped whole-batch rejection, 401 error, raw/secret sentinel non-retention, five fake provider attempts, required RPCs and zero notification assertions.
Exact before/after hashes identical. Five new retained DBs:
- NBA child: bracket_family_vertical_60f4513a1548 — locked
- NBA Play-In: bracket_family_vertical_7bdd7093e97d — complete
- MLB child: bracket_family_vertical_7c3291ae097a — locked
- NCAA: bracket_family_vertical_267e322fe9a5 — complete
- CFP: bracket_family_vertical_7387f44669b9 — complete

## Numeric execution and demonstrated failures
Commands: python3 scripts/trusted-numeric-runtime.py sql (twice); python3 scripts/trusted-numeric-runtime.py browser (endpoint probe, then owned Chrome).
All use existing HTTP database bracket_http_439610679a15 in bracket-p11-db-9bd170c85c0f, migrations through 00015. No environment file/provider credential loading.
- Initial SQL attempt failed entering exhaustive WWC template insertion: PostgreSQL SIGKILL/recovery.
- Hypotheses ranked: container ceiling, SQL memory amplification, unrelated/shared VM pressure. Temporary local-only cap change 512 MiB → 1.5 GiB did not cure it; restored to **512 MiB memory and swap, one CPU**.
- Cgroup measured **zero max/oom events**, peak below original 512 MiB, but oom_kill increments. VM snapshot showed only 454728 kB available and 4548 kB swap free. Thus shared Docker VM global memory pressure, not demonstrated container-limit exhaustion. Hundreds of unrelated containers were present; none stopped/changed. SQL parse amplification of the full finite manifest may be a contributor, not proven product defect.
- Existing port 9222 returned HTTP 404 for /json/version. Added sole-owner ephemeral Puppeteer wrapper with proper endpoint; closes only its own browser.
- Added partial persisted-checkpoint evidence on failure. Browser runner still runs all builders and fails on any error; no skips, sampling or changed numerical expectations.
- Actual browser result: tmp/trusted-numeric/run-hihPaf/result.json. **Nine persisted + nine rendered checkpoints passed**, then full WWC manifest insertion hit the same SIGKILL. The failed artifact remains failed.
- Passed: Play-In before/first/complete/corrected/invalidated/recomplete; eliminated+forfeited; trusted UCL; unknown UCL. Includes exact rank/earned/maximum/wrong, maximum 1 rather than 2, null rendered Temporarily unverified, unchanged picks, replay, single coronation.
- Not verified: reviewed WWC 48-of-64, reviewed WWC 64-of-64, original unknown-placement WWC. No claim of 12/12 or successful SQL-only suite. OOM recovery also means failed-run DB rows are not a durable successful final packet; successful HTTP checkpoints were observed before the failure.

## Resume
Provide sufficient free memory in the existing Docker VM (coordinate unrelated workload owners; no indiscriminate cleanup). Then rerun **both** helper modes serially against the same stopped isolated runtime. Require all 12 persisted checks and all 12 actual rendered checks, stable source hashes, final retained audit. Do not solve by truncating the 65,536 worlds, sampling, replacing maxima or suppressing failures.

## Final verification / evidence
- Seven independent fixture tests passed; four negative rendering checks passed.
- Scoped ESLint, node syntax, Python compile, git diff --check passed after helper edits.
- Final audit: all 15 retained family DBs stopped, sends disabled, zero notification attempts; five current successful DBs each five synthetic provider attempts.
- HTTP runtime recovered, stopped, both delivery flags false, zero notification attempts; migration hashes and mirrored app source current.
- Durable exact invocation hashes, all sanitized failure artifacts and filtered resource diagnostics: final-numeric-runtime-evidence.json. Raw Vitest/process diagnostics remain ignored/private.
- No production files changed. Added runtime helpers and changed only provider expectation + numeric runner diagnostics.

changed: child-only test expectation, numeric execution helpers and partial evidence.
matters: closes all five provider SQL cases; establishes real nine-checkpoint numeric browser proof without overstating WWC.
checks: provider 15/15; numeric/browser failed at exhaustive WWC insertion due shared-VM OOM; scoped checks passed.
risk: full numeric acceptance blocked on sufficient shared local VM memory.
verdict: **hold numeric; provider proof ready for independent parent review.**
