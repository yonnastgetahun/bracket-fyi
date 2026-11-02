# BRACKET-DB38-FINAL-REPAIR
project: BRACKET-FYI; approved Phase2; SQL runtime owner; no commit/push/deploy/spend
done when:
- [x] Stopped commit_event_series raises PT409; schema-aware inventory regression passes.
- [x] Full SQL suite and through15 transitions pass with exact source hashes.
- [x] Hidden skeptical review resolved; 26 baseline files preserved.
evidence: phase-2-db38-final-repair-evidence.json; tmp/db38-final-repair/

## Scope and diagnosis
The previous runtime report is historical evidence, not overwritten. Its two DB38
failures were reproduced on retained disposable database
`bracket_final_1793406820453880000` (10 pass / 2 fail).
Hypotheses, ranked: a missed deliberate series stop guard; a stale through-12
inventory; alternatively a genuine engine serialization failure. Direct service-role
execution returned message `runtime stopped` with 40001, confirming the first and
excluding an engine-generated serialization event. Catalog inspection confirmed the
second: 34 PT409 literals before repair, versus the stale expectation of 23.

## Implementation
- Migration 00014: only its deliberate stopped-runtime guard changes 40001 → PT409.
  Adjacent series guards already use PT409. No exception handler, retries, grants,
  locks, authority checks, or engine serialization handling changed.
- DB38: invokes the actual stopped series worker as service_role, checks exact
  PT409/message and unchanged result/audit counts; inventory explicitly accounts
  for installed core (23), series (+5), structural qualifiers (+7) capabilities.
  No unconditional count relaxation. Series behavior is conditional only on the
  series function existing, preserving through-12/13 test compatibility.
- The retained old disposable DB received the exact CREATE OR REPLACE function
  extracted from repaired source. Fresh SQL installation and transition lanes
  apply the entire repaired migration normally. No published migration history
  altered; the unpublished Phase2 migration source is the owned repair target.
  Existing 00014 forward repair is a non-destructive safety hold and does not
  reinstall function definitions; it remains unchanged.

## Verification so far
- Original DB38: 10 pass / 2 fail; new behavioral/catalog regression: 12 pass /
  3 fail before production repair, 15/15 after.
- First test draft used the wrong structural table discriminator; the corrected
  red test is retained separately, still 12 pass / 3 fail (inventory 34 vs 35).
- Fresh template0 database `bracket_db38_1793407089368602000` on
  `supabase_db_bracket-fyi`: 38 migrations, 39 SQL files, 1,166/1,166 assertions.
  Direct psql/pgTAP, not a claim of Supabase CLI execution.
- DB38 during fresh prefix migration: through12 14/14, through13 14/14,
  through14 15/15, through15 15/15.
- Stopped/sends/attempts audit: `t|f|f|0`.
- Protected baseline: 26/26 SHA-256 matches. `git diff --check` passed.
- Through15 transitions: 2,429/2,429 assertions passed; independent skeptical review accepted.

## Independent skeptical review
Hidden read-only run `eb93cf91-0be1-4e7b-8e42-f4ecd3ac2fdc`
(OpenAI GPT-6 Astra): **accept scoped repair; no blocking findings**.
Reviewed migration14 SHA-256
`aa0a8be7505dce48a3e288ec2ee8c302244718c5b2b5c19f1e6603b49732f46a`
and DB38 SHA-256
`8c70443d2eba1bf7b98bad3243183ccdd44123552292968e34fd476b25c2863f`.
Independently verified all 26 baseline hashes and four prefix TAP results.
Migration14 has six PT409 literals but contributes five net new raises because
its replacement lifecycle function preserves one existing core raise.

Nonblocking limitations retained: source inventory uses formatting-sensitive
literal matching and aggregate counts can conceal offsetting substitutions;
row-count checks are not whole-row identity checks. The actual service-role
SQLSTATE/message regression catches the specific bug independently of inventory.
No further edits justified for this bounded repair. Existing runtime databases
that previously installed the old migration must explicitly receive the corrected
function before being claimed as the repaired candidate; source edits do not
retroactively update them. Only the retained final DB and fresh verification DBs
are updated/tested here; no claim is made about unrelated preview runtimes.

## Reproduction commands
All shell commands routed through `/Users/yonnasgetahun/clawd/bin/exec`,
from `/Users/yonnasgetahun/bracket-fyi`.
- `python3 tmp/db38-final-repair/run-db.py` — fresh migration installation,
  four prefix regressions, all 39 SQL tests, exact counts/hashes and safety checks.
- `BRACKET_TEST_DB_CONTAINER=bracket-p11-db-9bd170c85c0f python3 scripts/verify-event-transitions.py --through 20261027000015`
  — fresh, populated legacy/current, repeated forward repairs.
- `python3 tmp/db38-final-repair/close.py` — final evidence, source identity,
  protected baseline, retained database safety checks.
- `git diff --check` — whitespace verification.

Earlier red/green steps use direct `docker exec -i ... psql -X -U postgres
-d <named disposable database> -Atq -v ON_ERROR_STOP=1` with DB38 text;
pgTAP failures are checked from TAP, never inferred from psql exit 0 alone.
The exact forward-installed function is retained in
`tmp/db38-final-repair/install-commit-event-series.sql`.

## Previous candidate identities
The original reproduced two-failure candidate had:
- migration14: `1e19ee72a821d9b0322b59e3e29d3b572301641016715fc30fc0f2bad403cade`
- DB38: `054d804f373b92ee48302074a30c3d9ef0ffbb486e90978a24028914b9a988b0`

Those prior hashes remain historical evidence only. The repaired hashes above and
the new evidence manifest identify this candidate. Original runtime-recovery
report/evidence files were not rewritten or promoted to passing.

## Final acceptance
- Through15 transition run `20261031T003830Z_ee7366`:
  **2,429 passed / 0 failed**, fresh, populated legacy, populated current lanes.
  [Transition evidence](../../../supabase/tests/transitions/evidence-20261031T003830Z_ee7366.json)
  SHA-256 `2abe834fc247d460a12eb9341b6b3d86a14d6f191b08be487a551b0169ef1cb1`.
- [Durable aggregate evidence](phase-2-db38-final-repair-evidence.json) records
  all 38 migration hashes, 39 test hashes/counts, transition migration/repair
  identities, reviewer, artifact hashes, baseline hashes, and five retained DBs.
- Final source identity, 26 baseline hashes, and `git diff --check` passed.
- Two SQL verification databases: `global_stopped=t`, both send flags false,
  zero attempts. Three transition DBs: same stopped flags; exactly one retained
  seeded fake attempt each. Closeout verifies its deterministic ID, idempotency
  key, sent/finished status, and exact synthetic/fake metadata. No transport ran.
  Initial closeout incorrectly required zero attempts in transition DBs and
  failed; fixture-aware correction passed without modifying/deleting any rows.

### Changed files owned by this task
- `supabase/migrations/20261027000014_reviewed_series.sql`
- `supabase/tests/database/DB38_http_business_conflicts_test.sql`
- `docs/architecture/implementation/phase-2-db38-final-repair.md`
- `docs/architecture/implementation/phase-2-db38-final-repair-evidence.json`
- `supabase/tests/transitions/evidence-20261031T003830Z_ee7366.json` (generated)
- Local retained `tmp/db38-final-repair/` driver/TAP/evidence artifacts.

changed: deliberate series stop SQLSTATE and schema-aware runtime regression.
matters: stopped series workers return business conflict rather than requesting retry.
checks: DB38 15/15; four schema prefixes green; full SQL 1,166/1,166;
through15 transitions 2,429/2,429; independent review accepted; baseline 26/26.
risk: historical preview DBs need explicit corrected function application; unrelated
numeric 12/12 acceptance remains blocked by previously established shared-VM OOM.
verdict: **ACCEPT bounded DB38 repair and final SQL/transition candidate**.
No commit/push/deploy/live/spend; no numeric run; no container or VM changes.
