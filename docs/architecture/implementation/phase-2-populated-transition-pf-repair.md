# PF-R1–R3 populated transition repair

## Work item (criteria recorded before implementation)
project: BRACKET-FYI
done when:
- [ ] Pairing adopted/held histories are nonempty and preserved; isolated 00010 hold changes an enabled target.
- [ ] Every post-00005 migration compares the pre-migration legacy reader and original-six score/rank oracle.
- [ ] Checkpoint-seeded lifecycle/notification/operator rows remain nonzero across later migrations and double repair.
- [ ] Static checks pass; parent-only runtime command and unexecuted DB boundary documented.
evidence: scripts/verify-event-transitions.py; supabase/tests/transitions/checkpoint-*.sql; parent runtime artifact.

## Changes / finding disposition

- PF-R1: retained whole-row snapshots include both pairing tables. Checkpoint 00010 exercises review RPCs: early pick, adopted A/B pairing, later B pick, incompatible A/C correction held. Exact adopted/correction records required. Before broad earlier repairs, isolated 00010 runs twice against a target explicitly not lifecycle-disabled; verifies disabled+frozen, exactly one generation advance, unchanged configuration version, and complete retained rows including picks and sealed configurations.
- PF-R2: captures the supported service-reader immediately before every post-00005 migration, compares immediately after migration before fixture mutations. Independent 1/0 score/rank oracle uses exact original six IDs and requires twelve leaderboard rows. Oracle also runs after 00005 and both complete repair passes.
- PF-R3: committed 00006 lifecycle revision/coronation audit; 00007 consent, lifecycle outbox, completed fake attempt and snapshot; 00008 operator review manifest/audit and completed synthetic provider attempt. Ten evidence tables require nonzero rows after seeding, before/after subsequent migrations, before repairs, after each selected repair and isolated 00010 pass. Whole-row comparison runs after every selected repair.
- Lifecycle/notification histories and provider attempt are deliberately owner-seeded synthetic historical fixtures, not proof that a lifecycle worker completed or any transport ran. Pairing and manifest review use actual RPCs. Infrastructure preservation scope remains narrower than full P12 acceptance.
- Inclusive --through remains generic, with exact timestamp existence check and sorted migration/repair selection; default updated to 00010. Independently added 00011 can be selected explicitly.

## Static checks executed (no DB)

- Python AST parse and --help: PASS; help exits before Docker/DB preflight.
- Extracted pure oracle/checkpoint contract check: PASS; six exact legacy UUIDs, twelve required leaderboard rows, four committed checkpoints, ten nonempty evidence tables.
- Checkpoint transaction endings, absence of rollback, trailing whitespace: PASS.
- Scoped git diff --check: PASS (tracked coverage only; explicit whitespace scan covers new files).
- Schema/constraint/trigger inspection completed. SQL parser package unavailable; SQL execution unverified.

## Parent-owned runtime

Exact command:

```sh
/Users/yonnasgetahun/clawd/bin/exec -- 'cd /Users/yonnasgetahun/bracket-fyi && python3 scripts/verify-event-transitions.py --through 20261027000010'
```

When separately owned security 00011 and applicable repair are finalized:

```sh
/Users/yonnasgetahun/clawd/bin/exec -- 'cd /Users/yonnasgetahun/bracket-fyi && python3 scripts/verify-event-transitions.py --through 20261027000011'
```

Inspect emitted supabase/tests/transitions/evidence-<run>.json: status, assertions, hashes, all three fresh/legacy/current lanes. Harness creates and retains uniquely named databases; no shared reset/drop. This worker executed no Docker/DB command, production migration edit, commit, push, deployment or send.

changed: assigned harness, four new checkpoint fixtures, this report only.
matters: removes vacuous preservation and pre-disabled repair-target blind spots in source.
checks: static PASS; runtime pending parent.
risk: SQL/runtime compatibility and full P12 acceptance unverified.
verdict: source ready for parent runtime; hold populated-transition PASS claim until execution.
