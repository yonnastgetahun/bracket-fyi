# P3 barrier readiness read bounds
project: BRACKET-FYI
done when:
- [x] Every readiness stdout/stderr read is nonblocking under one deadline.
- [x] Synthetic partial, stalled, silent and EOF subprocesses fail promptly and are reaped.
- [x] Marker parsing succeeds across chunk boundaries; lock/expiry/rollback oracle stays unchanged.
evidence: `python3 -B scripts/test-notification-barrier-readiness.py`

## Scope and diagnosis
Only readiness I/O, its cleanup, a focused subprocess test and this report are in scope. No DB/Docker/fixtures/full matrix, commit or push.
Ranked causes: (1) stdout readline after the first readiness event stalls on subsequent rows; (2) even the first readable chunk lacks a newline and readline stalls; (3) stdout EOF invokes stderr.read while stderr remains open. Each was reproduced with harmless Python processes.

## Results (2026-10-28)
- Before implementation: row-then-stall, partial-line and stdout-EOF/stderr-open cases each exceeded the independent 3-second watchdog. Silent/stderr-flood cases exposed unclosed pipes; positive tests initially lacked the new helper seam. Baseline: 7 tests, 3 timeout errors and 4 failures.
- After implementation: **8 tests passed in 2.060s**. Coverage: silence, row then stall, partial line, stdout EOF with stderr open, stderr flood, stdout flood, marker buffered alongside earlier rows, marker split across writes.
- Failure cases exercise the real `barrier` with synthetic Python `BASE`, a 0.3-second readiness budget, no worker creation, process-reaping and closed-pipe assertions. Positive cases check PID parsing and restoration of blocking flags. Each scenario has a 3-second external watchdog and process-group cleanup.
- `blocker_ready` uses a single 20-second monotonic production deadline, selector context cleanup and nonblocking `os.read` on both pipes. It drains stderr with a 4 KiB diagnostic tail, bounds incomplete stdout lines, parses complete marker lines and restores original descriptor flags on all exits.
- Barrier cleanup now closes stdin/stdout/stderr after killing/reaping unfinished subprocesses. SQL sent to the blocker, worker creation, intended-PID lock observation, granted-lock checks, actual-expiry observation, commit/release and business/version/audit rollback checks are unchanged.
- `git diff --check` returned no diagnostics; these three paths are currently untracked, so that command does not validate their contents. The focused test imports the actual script, validating Python syntax without bytecode writes.

changed: deadline-aware nonblocking readiness helper, deterministic selector/pipe cleanup, focused regression script.
matters: readable stdout is no longer mistaken for a complete line or a guarantee that stderr will close.
checks: focused subprocess regression 8/8; before-fix hangs reproduced; targeted source inspection confirms the oracle is unchanged outside readiness/cleanup.
risk: DB/full-matrix execution intentionally not run; post-readiness result collection is outside this narrowly assigned P3 change.
verdict: accept
