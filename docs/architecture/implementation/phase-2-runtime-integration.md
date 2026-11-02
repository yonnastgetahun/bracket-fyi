# Phase 2 runtime integration
project: BRACKET-FYI
Done when (recorded before implementation):
- [x] Trusted runtime factory supplies SQL provider attempt controls to actual orchestrator; stopped/error prevents synthetic pull.
- [x] Bounded lifecycle sweep precedes deterministic four-kind producers and fake worker; stable business keys survive replay, revision changes create new keys.
- [x] Legacy broadcast persists authorized announcements but cannot invoke real transport under any environment.
- [x] Local-only one-shot runtime entry rejects hosted URLs and invalid bounds; never changes controls (notification.control remains operator-only).
Evidence: tests/events/runtime*.test.ts, tests/admin/broadcast-transport.test.ts and local CLI smoke.
Owner scope: runtime*.ts, scripts/event-runtime*, focused tests and legacy broadcast route only. No migrations/application/lifecycle edits, commits, provider or real sends. Existing orphaned private notification setter is not used.

## Implementation / ownership

- `lib/events/runtime.ts:createEventIngestionRuntime` is now the trusted composition root for `lib/ingestion/orchestrator/orchestrator.ts`. Repository search found no previous production factory/claim loop. It installs `createProviderAttemptControls(client)` **after** spreading dependencies, so legacy permissive controls cannot override the SQL port.
- `createEventRuntime(client).tick(...)` validates bounds before RPC; runs bounded lifecycle reconciliation, then source-event production, then the actual fake notification worker. Defaults: one 100-league batch, 100 notifications, zero signals. It does not resume ingestion, enable notifications or alter global stop.
- Four producer identities use versioned business fields, hashed into a bounded deterministic key: window/revision/cutoff; contest/start revision/time; contest/schedule revision; provider binding/stale episode timestamp. Basis token and retry clock are deliberately excluded. Reminder expiry is actual cutoff; live/stale TTL is one hour; schedule TTL one day. Future/expired observations and dirty/held evaluations are skipped. Failed observations are reported without inline retry.
- Legacy broadcast keeps authorization, validation and announcement persistence; direct edge-function fanout removed entirely. Environment flags cannot opt it back into real sends. Event broadcast/consent UI remains application-owner work.
- `scripts/event-runtime.ts` is a one-shot local-only service job, not a browser endpoint or persistent automation. It permits only canonical localhost/127.0.0.1 URLs, rejects redirects, uses 30-second RPC timeouts, never loads dotenv, never logs credentials, and reports incomplete sweep/producer work via exit 2. The Node hook uses the **existing** TypeScript dependency to handle existing non-erasable TS and project aliases; no dependency added.

## Invocation and control contract

From repository root, with local service credential injected into the process environment:

```sh
node --import ./scripts/event-runtime-register.mjs scripts/event-runtime.ts job.json
```

Job JSON accepts only `after`, `batchSize` (1–500), `maxBatches` (1–100), `notificationLimit` (1–500), `signals` (max 500). Signal schemas live in runtime-producers.ts; source timestamps/revisions must come from durable trusted business state, not newly generated poll identifiers.

Enabling fake delivery is a **separate** existing operator command with explicit `notification.control` authority, current global version and reason. Resuming global stop separately requires `global.stop`. Runtime and CLI never call `set_event_notification_control`. Tests exercise the operator repository and service-only RPC boundary; no privileged HTTP routes were introduced.

## Verification observed

- Initial runtime RED: module absent; new runtime suite could not import it.
- Legacy broadcast behavioral RED: **two tests failed**, both observed one mocked real fanout under missing flags / explicit real flags.
- GREEN: 7 files / **141 tests** (runtime, runtime provider, runtime CLI, broadcast, existing notifications, lifecycle, orchestrator). Positive CLI test launches the checked-in Node hook and entry in a real child process with synthetic RPCs; fake send count 0.
- Scope ESLint, `npx tsc --noEmit --pretty false`, `git diff --check`: pass.
- First fresh SQL lane attempt failed **during createdb**, before migration or fixture execution: PostgreSQL reported another server process crashed, terminated this connection and entered recovery. This is not a runtime pass. Retried only after `pg_isready` reported accepting connections.

## Remaining integration (not claimed complete)

1. Persistent scheduling/deployment is not installed. Trusted callers must supply durable schedule/window/health observations to the one-shot job. Automatic SQL source discovery / provider-health episode materialization is not added by this glue.
2. Provider claim/budget/adapter/credential composition remains the ingestion host's responsibility. The new factory supplies the real control port; tests prove denied/error/start-denied paths never pull and successful synthetic pull is bracketed by admission/start/completion RPCs. This is not a live provider run.
3. Fresh SQL runtime lane command: `BRACKET_RUNTIME_DB_TEST=1 npx vitest run tests/events/runtime-db.test.ts`; creates a uniquely named retained disposable DB through 00008, a scoring-valid original synthetic manifest, explicit fake consents and scoped operator principal. It checks exact four-kind counts, default stop, notification.enable not overriding stop, authenticated resume, replay/restart dedup and restop. Full result recorded below.
4. Full application/device journeys, real sends, hosted rollout, recurring scheduling and publication remain parent/external scope. No migrations 00009/00010 or application/lifecycle modules edited; no commits, real subscriptions, provider calls or external sends.

### Fresh SQL lane outcome: blocked, not green

Second attempt reached migration loading, then its Docker/psql subprocess exited unsuccessfully with empty stderr. A concurrent read-only pg_stat_activity diagnostic exited **137**. No fixture/runtime assertion executed on either attempt. Stopped database default remains unchanged by this packet; test only authorizes delivery inside its fresh, uniquely named disposable database after fixtures pass. No further retries or shared-infrastructure changes attempted.

The test harness now includes subprocess exit status/signal in errors and prints the disposable DB name before setup, for the next isolated rerun. Its complete sweep/producer/worker SQL result remains **unverified**, not included in 141 passed tests.

changed: trusted provider composition root; bounded lifecycle/producer/fake worker job; local-only CLI; legacy real-send path removed.
matters: stopped/default-off enforcement cannot be replaced by permissive injected controls or bypassed by legacy broadcast environment flags.
checks: 141 focused tests; native CLI synthetic success; types/lint/whitespace pass; two fresh SQL attempts infrastructure-blocked.
risk: fresh SQL runtime lane must pass after local Docker/PostgreSQL stability is restored; upstream durable source observation/scheduling and provider host claim-loop still require parent composition.
verdict: accept bounded synthetic integration for independent review; HOLD fresh-DB/full-runtime acceptance.
