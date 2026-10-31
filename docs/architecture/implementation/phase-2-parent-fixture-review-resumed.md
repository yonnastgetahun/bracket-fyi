# Parent fixture and transition review — resumed

Review date: 2026-10-28. Independent source inspection only. No database, Docker, hosted, production, or external actions; only this report written. No runtime approval inferred.

## Work item

project: BRACKET-FYI

done when:
- [x] Assigned fixture adaptations checked against v1.0 and checkpoint.
- [x] Concrete transition preservation findings recorded through 00010.

evidence: source references and static inspection below.

## Scope and baseline

Read approved `docs/architecture/bracket-fyi-spec-v1.0.md`, especially P1/P3/P9/P12 and §9 migration/rollback acceptance; read `phase-2-resume-checkpoint.md`. Reviewed tracked working-tree differences against HEAD for DB12/16/17/18/19/20/21/22 and current source for untracked DB27/30/33 and `scripts/verify-event-transitions.py`. Untracked files have no Git before-image, so this report does not claim exhaustive assertion-by-assertion historical equivalence for them. Read relevant identity wrappers, 00010 pairing schema/repair, and transition fixtures to resolve findings.

Review skill standards/spec axes applied within the explicitly assigned independent subagent scope; no additional delegation or approval ceremony.

## Standards

No production grant weakening found in the assigned changes. Fixture activation is inside BEGIN/ROLLBACK, not a changed production default. Scoped helper functions use default SECURITY INVOKER, not elevated helper privileges. All shell inspections used the absolute guard path and absolute repository paths. Scoped tracked `git diff --check` passed with no diagnostics; this does not cover untracked files or establish SQL execution success.

## Spec findings

### PF-R1 — Medium: 00010 pairing evidence and repair target are outside preservation proof

**Locations:** `scripts/verify-event-transitions.py:65` (retained table list), `:203` (new-table emptiness), `:248` (repair setup); `supabase/migrations/20261027000010_reviewed_pairings.sql:3` and `:18`.

`retained()` omits `event_pairing_reviews` and `event_pairing_corrections`. Consequently the supposedly generic new-evidence emptiness check does not inspect either 00010 table, and the two repair snapshots cannot detect alteration/removal of their records. No pairing review/correction is seeded in the transition fixtures. The 00010 forward repair's targeted hold (`league_id in event_pairing_reviews`) therefore has no represented target; the generic typed-league frozen assertion is already satisfied by earlier repairs and cannot establish this behavior.

**Required disposition:** include both tables in optional preservation snapshots; commit an adopted pairing and a held correction fixture before repair, assert nonempty evidence, preserve their complete rows across both repair passes, and assert the affected league is disabled/frozen without pick/configuration rewriting. This is a proof gap, not a claim the current migration destroys records. P12 requires populated repair proof and preservation of audit/pick history.

### PF-R2 — Medium: later migrations have row comparison but no before/after legacy-reader comparison

**Locations:** `scripts/verify-event-transitions.py:179`, `:188`, `:249`, `:259`.

The final old-reader upgrade assertion is immediately after 00005. The 00006–00010 loop compares stored rows only. `repair_reader` is captured after all those upgrades, so a migration changing the legacy view/query response while leaving base rows unchanged becomes the new expected result; subsequent repair comparisons can pass. Likewise the independent score/rank oracle last runs before the incarnation upgrade.

**Required disposition:** capture the supported reader before the later-migration loop and compare after each migration (or at least at the selected upper bound), before subsequent fixture mutations. Re-run a legacy-only score/rank oracle there, scoped to the original six leagues because incarnation fixtures add leagues. Do not rerun the existing hardcoded six-league count against the enlarged fixture unchanged. This closes the explicit §9 requirement to preserve the supported legacy query/response contract through the selected target.

### PF-R3 — Medium: later populated evidence preservation remains vacuous

**Locations:** `scripts/verify-event-transitions.py:71`, `:188`, `:236`, `:248`; `supabase/tests/transitions/typed.sql`.

The optional lifecycle/notification/operator evidence tables are discovered, but the migration loop creates them empty and advances without committed representative histories. The selected pgTAP files roll back their data, and typed.sql seeds nominations/results/windows/picks, not completed lifecycle revisions, notification attempts/subscriptions/snapshots, or operator manifests/audit. Thus equality for those tables does not establish preservation of existing contents across later upgrades/repairs. The additions improve coverage of table existence/empty histories but are not populated subsystem repair evidence.

**Required disposition:** add committed representative histories at the appropriate checkpoints, with explicit nonzero preconditions before later migrations/repairs. Alternatively maintain the narrow infrastructure-only label and link separate populated repair artifacts for these tables; do not count empty equality as that acceptance. The current harness already correctly says it is not full P12 acceptance.

## Fixture assessment

| Files | Source-inspected result |
| --- | --- |
| 12 | Direct service mapping INSERT/UPDATE and result INSERT expectations become denials, matching scoped operator authority. Existing immutable-result UPDATE denial remains. No negative grant test removed. |
| 16 | Rejected mapping creation now uses a synthetic registered credential with only mapping.review for the fixture edition. Automatic/conflicting/rejected-target and browser denial assertions remain. This file runs that helper as the owner, so it is functional identity coverage, not independently a service-role capability probe; DB30 supplies that probe. |
| 17 | Preprovisioned canonical entities/reviewed mappings remove unauthorized bootstrap assumptions. Dependency quarantine/replay remains. Added unsupported_shape assertion distinguishes the exercised graph rejection from the wrapper's mapping_ambiguous natural-key rejection; added unchanged-target assertion protects provisioned state. The bracket mapping plus edge dependencies reach the cycle validator in the inspected source. Plan increases 21→23 for two new assertions. |
| 18,19,21,22 | Only transaction-scoped global-stop activation changes. Assertions unchanged. DB22 retains both catalog grant checks and real SET ROLE service_role negative DML/helper checks. |
| 20 | Replaces automatic creation with explicit reviewed identity; preserves exact-one-entry and reviewed-status checks and adds invited→confirmed state proof, avoiding a pure preseed-count tautology. Plan 51→52. |
| 27 | Service role directly inserting results is still explicitly denied. Successful winner-set corrections use result.record with synthetic edition-scoped authority. Immutable membership, cross-category/edition/eligibility validation and browser denial assertions remain in current source. |
| 30 | Reviewed transitions use the scoped mapping helper under SET LOCAL ROLE service_role. Automatic/forged/nested/missing identity rejections, unchanged canonical state, internal-helper denial, browser-private reads and cross-tenant writes remain. |
| DB33 | Notification-control helper caches returned versions in a service-accessible temporary table; no protected-control table read is required under service role. Direct control UPDATE remains denied. Stop/drain/restart, consent, dedup, correction, retry, dead-letter, pruning and delivery-forgery assertions remain. Owner-only direct result setup is explicit via RESET ROLE; it is not proof of service result admission. |

## Transition checks that are sound by inspection

- Explicit upper migration existence; sorted inclusive application allows `--through 20261027000010`. Default remains 00008, so the parent must supply 00010 explicitly.
- Strict pre/post-00005 whole-row comparison occurs before later schema additions; ledger seed matches exact extant versions/cutoffs and absent history is distinguished.
- 00007 normalization removes only the four newly added nullable outbox fields after checking they are null on old rows; old field values remain compared. Parsed JSON comparison avoids whitespace-only false failures.
- Post-00005 rows are compared for each migration; all applicable forward repairs are selected through the requested bound and replayed twice.
- TAP parsing requires one plan, contiguous successful assertion numbers, and no failure/bailout output; nonzero psql exit fails the harness.
- Inputs, migrations, harness, tests and repairs are hashed and rechecked; databases are newly named/owned and retained, not reset or dropped.

## Verdict and next evidence

**ITERATE on transition-proof coverage (PF-R1–R3).** No material assertion weakening found in the assigned fixture adaptations by static inspection. This is not a fixture-suite PASS, migration PASS, or P12 approval. Parent should disposition these findings and run the pristine full SQL suite plus the explicitly bounded 00010 transition after owning runtime health; unavailable runtime is neither success nor a reason to discard these findings.

changed: independent report only.
matters: preserves honest separation of grant-safe fixture adaptation from incomplete transition evidence.
checks: tracked fixture diff, bounded source/spec/checkpoint inspection, scoped tracked git diff --check (clean); no DB/Docker commands.
risk: SQL execution, exact tested-head evidence, and populated later subsystem repair remain unverified here.
verdict: iterate.
