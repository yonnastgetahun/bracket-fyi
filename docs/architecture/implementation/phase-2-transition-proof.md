# P12 infrastructure transition proof

# BRACKET-P12-TRANSITIONS local-only harness
project: BRACKET-FYI
done when:
  - [x] Empty databases replay actual migrations through pinned 00004.
  - [x] Populated legacy/current upgrades preserve synthetic rows and compatible reads.
  - [x] Backfill replay and forward repair preserve picks/evidence with explicit hold semantics.
evidence: `python3 scripts/verify-event-transitions.py`; JSON evidence under `supabase/tests/transitions/`.

Criteria above were recorded before implementation, then checked after execution. Scope: **infrastructure transition proof through 20261027000004 only**, not full P12 acceptance.

## Reproduce

From the repository:

```sh
/Users/yonnasgetahun/clawd/bin/exec -- 'cd /Users/yonnasgetahun/bracket-fyi && python3 scripts/verify-event-transitions.py'
```

Requires Python standard library, Docker CLI and existing running `supabase_db_bracket-fyi`. No Supabase CLI login, endpoints, credentials, provider requests, config edits, network provisioning, commits or pushes. Python child commands use argument arrays, never shell interpolation.

Each run creates unique `bracket_transition_<UTC>_<nonce>_{fresh,legacy,current}` databases using **template0**, checks public is empty, then replays actual checked-in migration SQL. It never copies the final public schema. Platform-only bootstrap creates extensions schema, pgcrypto, pgTAP, empty Vault extension, and Supabase public default grants. Required anon/authenticated/service_role cluster roles already exist. Installed postgres default ACLs were inspected read-only: postgres grants ALL tables/sequences/functions to these roles, matching bootstrap. No Vault contents or auth data read/copied; VAPID RPC is created but never invoked.

All named databases remain for inspection. No reset/drop/truncate of existing postgres, no migration-history manipulation, no cleanup.

## Actual final run

- Command above; Python 3.15.0; PostgreSQL 17.6; HEAD at execution `3ca08fbd7d3cfa5266a2114ab3bb3f9f391d83e8` (working-tree migration hashes are authoritative).
- **PASS: 98 harness assertions**, plus **543 passing pgTAP assertions** across four suites repeated in three independently replayed databases.
- 27 migrations, through `20261027000004_security_boundary_repair.sql`.
- Four non-destructive forward-repair files, each applied twice per database.
- Final artifact: [evidence-20261027T210001Z_93a125.json](../../../supabase/tests/transitions/evidence-20261027T210001Z_93a125.json).
- Evidence SHA-256: `9def9d60281983806eb267b1d056cab88e505867275eb499f3549ae7bfd5fe1f`.
- Harness SHA-256: `5f66665b36c17ec6ba4cc7143168bc029cc6508c1163aff62f91959949246b22`.
- Artifact includes complete migration/fixture/repair/test hashes, SQL step hashes/output, assertion outcomes, platform version, and input-stability checks. Structured comparison values are SHA-256 digests of canonical JSON; equality is evaluated before hashing.

Retained final databases:

- `bracket_transition_20261027t210001z_93a125_fresh`
- `bracket_transition_20261027t210001z_93a125_legacy`
- `bracket_transition_20261027t210001z_93a125_current`

## What is proved

| Lane | Actual transition and assertions |
| --- | --- |
| Fresh | Empty public schema → all 27 migrations → synthetic setup twice. |
| Legacy | Five migrations through 20260725000005 → six populated bracket/pick'em active/locked/complete leagues, 12 picks, fixed synthetic bearer IDs, active overrides → remaining migrations, without reset. |
| Current | Through 20261010000008 → same legacy fixture plus canonical links/results, active/released overrides, audit and pending outbox → PR migrations. Pre-existing canonical evidence/outbox compared across upgrade. |
| Backfill | Commit one template-scoped batch, reconnect/resume second template, replay both twice. Full-row comparisons ensure stable result IDs, versions, picks, audit and outbox; no duplicate results/intents. This is a controlled batch-boundary interruption, not a process-kill crash simulation. |
| Readers | Frozen service-role SQL projection in reader.sql compares IDs/credentials, tenant links, locks, winners, points and ranks across upgrades/backfill. Independent one-market oracle: correct A earns 1, wrong B 0; active B override reverses these; released B override follows A again; ranks 1/2. |
| Forward repair | Committed draw, tied two-nomination winner set, typed window and submitted draw pick added before repair. Full rows retained, typed history readable, new-format legacy gate false, evaluation frozen, submissions blocked with 40001 and new winner-set admissions blocked with 55000. Legacy service-reader projection unchanged across repair. |
| Grants | anon/authenticated private-table reads remain closed after repair; service-role compatible reads remain available. Historical browser bearer-column grants are deliberately NOT preserved. |

Actual pgTAP suites: 27 typed outcomes, 28 prediction windows, DB29 window integrity, 30 security boundary. Their transactions roll back; separate committed typed.sql supplies non-vacuous repair data.

Repair 00002 intentionally increments evaluation generation even when already frozen. The rehearsal proves safety and data retention, **not byte-identical evaluation generation replay**. Repair 00003 alone avoids incrementing already-frozen generations. No destructive down migration was used.

## Failures retained, not hidden

- `evidence-20261027T205754Z_92ece8.json`: synthetic fixture omitted required season_label; failed at fixture insertion after successful fresh migration replay.
- `evidence-20261027T205820Z_d115a5.json`: fixture competitor key used uppercase A/B; actual lowercase-key CHECK rejected it.
- Both fixture defects corrected; failed disposable databases retained. No migration was edited to bypass either constraint.
- `evidence-20261027T205842Z_2b5ddf.json`: intermediate 83-assertion passing run, superseded by final 98-assertion run with broader retention/write-block checks and released overrides.

## Exclusion and resume hook

Concurrent `20261027000005_window_incarnation_history.sql` is explicitly excluded, even though now present. The final artifact lists it as excluded. Do not claim final-PR migration coverage from this pinned run.

After integration/review:

```sh
/Users/yonnasgetahun/clawd/bin/exec -- 'cd /Users/yonnasgetahun/bracket-fyi && python3 scripts/verify-event-transitions.py --through 20261027000005'
```

That replays the enlarged manifest in new disposable databases and runs the same transition corpus; run the dedicated DB31/window-race lane separately as well.

Remaining contract work: final migration-set replay, actual application/HTTP/browser old-reader and rollback gate journeys, three-market independent scoring/correction oracle, provider-shaped vertical ingestion, disable-ingestion behavior, release/deployment/support/observability gates. Infrastructure SQL evidence is not proof of those product/operational obligations. No hosted/live/device checks run.

changed: new harness, four synthetic SQL fixtures, evidence artifacts and this report only.
matters: reproducible additive install/upgrade/backfill/repair proof independent of the already-installed application schema.
checks: final command exits 0; 98/98 assertions; 543/543 pgTAP assertions; git diff --check clean.
risk: pinned 00004 and bounded SQL compatibility surface; explicit remaining obligations above.
verdict: accept bounded infrastructure proof; hold full P12/final-PR acceptance.
