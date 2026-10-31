# P2 awards provisioning feasibility repair
project: BRACKET-FYI
done when:
  - [x] Provisioned awards retain numeric maxima using remapped trusted worlds.
  - [x] Missing/stale evidence is not upgraded and base manifests remain unchanged.
evidence: tests/events/application-awards.test.ts; red/green, TypeScript/lint.
authorization: Existing approved Phase 2; only provisioning module, new regression, this proof.

## Finding and repair

Confirmed: `provisionApplicationAwards` generated new nomination UUIDs and graph bindings, then replaced lifecycle feasibility with `components: []`. Unresolved categories therefore returned null maxima despite trusted exhaustive worlds in the input manifest.

Owned changes only:

- `lib/events/application-awards.ts`: remap every existing world's nomination IDs through the same old-ID/new-UUID map used for inserted nominations. Keep market IDs, component membership, full winner sets, evidence reference and graph version unchanged.
- `tests/events/application-awards.test.ts`: six fake-database/scorer cases.
- This document.

Identity remapping is a bijection; it neither samples nor regenerates worlds. The supported awards graph uses nomination-winner-set markets with direct entrant inputs and unchanged logical market IDs. Category/contest IDs are remapped separately as before. The input manifest is not mutated.

Trust boundaries remain unchanged: absent components remain absent; null evidence and unknown worlds remain unverified; stale evidence still fails scorer validation. Unknown world identities remain invalid rather than being substituted with a known nomination or filtered from an allegedly exhaustive domain. No new attestation, provider facts, client evidence or relaxed scorer checks are introduced.

## Actual red/green proof — 2026-10-28

Initial command before production edit:

```sh
npx vitest run tests/events/application-awards.test.ts
```

**RED: 1 failed test** at line 46. Expected unresolved two-category maxima P=2 and Q=2; actual P=null and Q=null. Other expected row fields matched.

After the identity-only remap: **GREEN: 1 passed test**. Then five trust-boundary cases were added and the focused related suites rerun:

```sh
npx vitest run tests/events/application-awards.test.ts tests/events/synthetic-feasibility.test.ts tests/events/scoring-bridge.test.ts
npx tsc --noEmit --incremental false
npx eslint lib/events/application-awards.ts tests/events/application-awards.test.ts
```

Results: **3 files / 39 tests passed** (6 provisioning, 17 feasibility, 16 scorer); TypeScript and scoped ESLint exit 0 with no diagnostics. Commands executed in `/Users/yonnasgetahun/bracket-fyi` through `/Users/yonnasgetahun/clawd/bin/exec`.

The fake database records actual insert payloads. Assertions link all eight new nomination UUIDs and their two contest/category IDs to the returned catalog. An independent 15-nonempty-subset oracle per four-nominee category verifies exhaustive tie worlds after remapping; all world choices are therefore persisted nomination identities. Graph version is deliberately 3, not an assumed default 1.

### Exact numerical oracle

Rows below are earned / maximum / wrong / rank:

| State | P | Q |
| --- | --- | --- |
| Two unresolved locked categories | 0 / 2 / 0 / 1 | 0 / 2 / 0 / 1 |
| Picture tied between P/Q nominees | 1 / 2 / 0 / 1 | 1 / 2 / 0 / 1 |
| Picture corrected to P nominee only | 1 / 2 / 0 / 1 | 0 / 1 / 1 / 2 |
| Director settles to Q nominee | 1 / 1 / 1 / 1 | 1 / 1 / 1 / 1 |
| Picture invalidated; Director stays settled | 0 / 1 / 1 / 2 | 1 / 2 / 0 / 1 |

## Evidence ceiling

No Docker, database service, browser, provider, commits or publication. Fake DB verifies the provisioning/scorer seam, not SQL persistence or browser delivery. Already persisted manifests with empty components are not backfilled. Existing unrelated working-tree changes were preserved.

changed: Provisioning now preserves existing trusted exhaustive feasibility under nomination UUID remapping.
matters: New provisioned awards retain numeric attainable maxima, including tied winners and result corrections.
checks: Red/green; 39 related tests; TypeScript; scoped ESLint.
risk: Database/browser round-trip and existing-manifest backfill remain outside this lane.
verdict: Ready for parent independent review; scoped implementation and regression proof complete.
