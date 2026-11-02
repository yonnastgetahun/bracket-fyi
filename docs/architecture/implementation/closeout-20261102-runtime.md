# Runtime closeout — 2026-11-02

project: BRACKET-FYI; approved synthetic-only Phase 2; Luna runtime owner

## Work item

done when:
- [ ] unchanged SQL run records all 12 persisted numeric checkpoints
- [ ] unchanged browser run records all 12 rendered numeric checkpoints
- [ ] source hashes are stable and final stopped/no-send audit is retained
- [ ] DB lint result is recorded for the same candidate

evidence: `final-numeric-runtime.md`, `phase-2-runtime-recovery.md`, retained JSON manifests, read-only Docker checks below.

## Verdict

**HOLD — no runtime rerun was safe.** The existing trusted numeric harnesses remain unchanged and correctly require exhaustive 65,536-world fixtures, literal numeric oracles, source before/after hashes, and browser rendering. Existing evidence is 9/12 persisted and 9/12 rendered; the three WWC checkpoints remain unverified. The recovery attempt again ended at 9/12 SQL-only with zero rendered in that run and an OOM kill increment.

## Read-only inspection

- Harnesses inspected: `scripts/trusted-numeric-runtime.py` and `scripts/trusted-numeric-browser-runtime.mjs`. SQL and browser modes target the stopped isolated HTTP runtime in `tmp/local-event-http/state.json`, database `bracket_http_439610679a15`, container `bracket-p11-db-9bd170c85c0f`, migrations through `20261027000015`.
- Current Docker read-only stats: database `120.2 MiB / 512 MiB`; HTTP adapter `72.83 MiB / 512 MiB`. Docker reports the database container `OOMKilled: true` from the prior attempt. `docker info` reports an 8,322,945,024-byte engine memory total; `docker system df` reports 1,177 containers, 284 active, and 132 images. These observations do not demonstrate the sustained free shared-VM headroom required for another exhaustive run.
- Retained recovery evidence records OOM kill `3 → 4`, automatic recovery, `global_stopped=true`, both delivery flags false, and zero notification attempts. The current runtime state records role safety `bracket_http_auth_439610679a15:false:false:false`.
- No containers were stopped/restarted/resized; no VM changes, source edits, sends, live calls, credentials, or provider calls made by this closeout.

## Exact blocker and resume requirements

The full WWC insertion has already failed repeatedly under shared-memory pressure, including after the COPY transport change that preserved the full manifest and oracle. Re-running unchanged SQL or browser modes against the same capacity would be an unsafe blind OOM retry. Resume only after an owner coordinates demonstrably greater sustained Docker-VM headroom (the recovery report gives ≥1 GiB free as a diagnostic starting target, not a guarantee), then run SQL and browser serially against the same stopped isolated runtime. Require all 12 persisted and all 12 rendered checks, stable source hashes, and a final stopped/no-send audit. Do not truncate or sample worlds, weaken null/maxima expectations, or stop unrelated containers.

## Preservation

Protected baseline paths, all dirty/untracked paths, and `docs/case-studies/` were not changed. This file is the only tracked path owned by this closeout; no ignored evidence was created.

changed: added this runtime closeout only.
matters: records the exact capacity/OOM blocker without promoting failed numeric artifacts to acceptance.
checks: harness/source inspection; read-only `docker info`, `docker system df`, `docker stats --no-stream`, and `docker inspect`; no rerun attempted.
risk: three WWC numeric checkpoints and same-candidate DB lint remain unverified.
verdict: hold
