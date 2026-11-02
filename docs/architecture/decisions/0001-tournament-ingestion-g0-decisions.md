# ADR 0001: Tournament ingestion G0 decisions

**Date:** 2026-10-03
**Status:** Accepted
**Decision owner:** Product owner

## Context

The discovery plans require explicit approval before application or schema implementation. The product owner approved the architecture and initial sequence on 2026-10-03. This ADR records the durable decisions and separates them from later provider, beta, device, and production approvals.

## Decisions

1. Adopt the provider-neutral architecture: adapters emit normalized observations; identity resolution, quarantine, idempotent canonical projection, effective-result resolution, lifecycle reconciliation, and durable notification delivery remain separate modules.
2. Use the security-first sequence. Authenticated and authorized organizer mutation routes plus the test baseline are Slice 0, before ingestion features.
3. Implement football-data.org and UEFA Champions League first, subject to G2 credential/terms/coverage approval.
4. Implement BALLDONTLIE NFL and the NFL Playoffs second, subject to G2 approval, to validate the adapter seam outside soccer.
5. Target the 99th Academy Awards in 2027. Do not describe Oscars 2026 as an upcoming event.
6. Allow an accepted correction, override release/expiry, or required-contest change to reconcile `complete -> locked` when a required effective result becomes unresolved. The transition must be audited and must not repeat coronation effects.
7. Preserve manual operation, league-scoped organizer overrides, provider-neutral canonical identities, shared event results, shadow ingestion, and evidence-gated rollout.

## Local QA and recording evidence

- BrowserStack is the previously selected cross-browser/real-device QA service in local project records. It supports recorded sessions and has a local tunnel app installed at `/Applications/BrowserStackLocal.app`.
- Prior projects also proved a local safe-video path using a controlled Chrome session and macOS `screencapture`, with sanitized proof metadata.
- Peekaboo 3.0.0-beta3 is installed and can inspect/record local UI, but this process currently lacks Screen Recording and Accessibility permissions. Granting those permissions is a later, explicit device-test setup action.
- PlaybookUX is installed, but no reviewed project record establishes it as the standard automated QA path.
- This physical Mac can validate macOS Safari and Chrome Web Push once G3 permits a notification test. It cannot substitute for the required iPhone/iPad installed-PWA push test; that remains separate evidence.

## Consequences

- Local Slice 0 implementation may be proposed next with an exact file allowlist and acceptance tests.
- No provider account, credential, paid tier, live endpoint call, scheduler deployment, beta run, push send, production change, or issue #3 closure is authorized by G0.
- BrowserStack is the default recorded cross-browser candidate. Local sanitized recording is the fallback for authenticated sessions or cases where cloud-session metadata is unsafe.
- Oscars provider work and calendar labeling use 2027 as the live target.

## Approved provider governance

- **Provider budget ceiling:** `$0` expected spend with a `$50/month` contingency ceiling for UCL/NFL beta. Every actual purchase still requires explicit approval.
- **Terms-acceptance owner:** Yonnas. An engineer may summarize provider terms but must not accept them implicitly. The owner is accountable for attribution, caching, storage, redistribution, renewal, and cancellation obligations.

These decisions were approved on 2026-10-03.

## Open decisions and later gates

- G2 still requires the exact provider account/tier, current terms, credential owner, allowed environment, quota, and event coverage.
- G3 still requires the beta group, support window, evidence retention, this Mac's push browser, and a physical iPhone/iPad if iOS PWA delivery is in acceptance scope.
- A non-pausing Supabase beta/live runtime and its cost require explicit confirmation before scheduling.
