# Phase 2 transition timeout diagnosis — 2026-10-30

## Finding

The `--through 20261027000013` blocker is harness execution/timeout behavior, not an observed PostgreSQL lock or container-capacity failure. `verify-event-transitions.py` used `subprocess.run(..., capture_output=True, timeout=180)` for every `docker exec`. A timeout only bounds the direct Docker client; Docker Desktop's remote exec/stream descendants are not guaranteed to be in that process group. The outer 120/300-second wrapper therefore terminated the Python harness without its `finally` evidence write, leaving partial named databases and no phase marker.

The bounded rerun's retained states identify the phase boundary: `bracket_transition_20261030t210643z_6ef1b6_fresh` reached the 00013 relation and checkpoint data (244 public relations, 5 templates, 10 leagues, 15 picks, 8 competitor-name rows), while `_legacy` stopped before 00013 (244 public relations, 3 templates, 8 leagues, 12 picks; `league_competitor_names` absent). After termination, the owned container had no active transition queries, remained healthy, and reported 129–152 MiB / 512 MiB with 20–25% sampled CPU. This is not evidence of an SQL lock wait or OOM.

## Repair and regression proof

`scripts/transition_command.py` now owns bounded execution with `Popen`, a new process session, process-group termination, direct-process termination, immediate parent-pipe closure, and a short bounded `wait`. It never calls unbounded `communicate()` after timeout: a descendant that escaped the local process group may still hold a pipe, so the local command returns with a timeout without claiming that descendant or any remote exec was cancelled. `ProcessLookupError` during the kill race is treated as an already-exited local child. `verify-event-transitions.py` uses it and serializes timeout evidence. `scripts/test-transition-command.py` covers both an ordinary descendant and a detached descendant pipe holder, plus the exit-versus-kill race; all return in under two seconds.

Checks:

```text
python3 scripts/test-transition-command.py
PASS bounded descendant cleanup and exit-race regressions
python3 -m py_compile scripts/transition_command.py scripts/verify-event-transitions.py
git diff --check -- scripts/verify-event-transitions.py scripts/transition_command.py scripts/test-transition-command.py
```

A single repaired full-lane attempt was started only against `bracket-p11-db-9bd170c85c0f`; it was stopped after >3 minutes without final evidence and its fresh DB was retained. No shared service, migration, or unrelated DB was changed. Therefore populated-13 acceptance remains **HOLD**; the repair is regression-tested but the full lane still needs a separately bounded, observable execution window.

Artifacts: retained DBs above; prior evidence `supabase/tests/transitions/evidence-20261028T193319Z_7f45b5.json` records the same class of bounded failure (`database system is in recovery mode`).
