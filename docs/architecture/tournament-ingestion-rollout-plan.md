# Tournament and Event Ingestion Rollout Plan

**Date:** 2026-10-02
**Status:** Proposed — G0 approval required before implementation

## Rollout objective

Introduce automated shared results without making provider availability a prerequisite for running a league. Rollout advances one event binding at a time through disabled, local, shadow, beta, canary, and accepted states. Every state retains a manual fallback and an immediate projection kill switch.

## Control planes

The rollout requires independent controls for:

- **Binding enabled:** permits the scheduler to consider the binding.
- **Fetch mode:** permits approved provider reads.
- **Projection mode:** `shadow` stores observations/proposals; `write` can update canonical results.
- **Template publication:** determines whether organizers can create new leagues from the template.
- **Notification trigger:** enables each result, correction, stale, or completion notification separately.
- **Scheduler enabled:** permits automatic dispatch; manual approved runs remain separately controlled.
- **Completion reconciler:** enabled per template/edition during canary.

Disabling projection must not delete observations, canonical history, manual results, overrides, or picks. Controls must be server/operator-only and audited.

## Rollout stages

### R0 — Documentation and approval

Required: G0 approval of architecture, provider/event sequence, security-first implementation, completion policy, budget assumptions, and the Oscars target. No code or environment change occurs in this stage.

### R1 — Local foundation

- Remediate organizer mutation authorization.
- Establish automated tests.
- Implement additive schema and provider-neutral core against synthetic and recorded fixtures.
- Rehearse migration, backfill, idempotency, and forward repair in disposable local databases.

Exit: M0–M2 local criteria pass and G1 approves the exact schema/migration.

### R2 — Approved provider verification

- Create/use the approved provider account and server-side credential only after G2.
- Make bounded read-only calls in a non-production environment.
- Verify documented coverage, response shapes, IDs, statuses, timestamps, attribution, quota headers, and terms assumptions.
- Sanitize and retain fixtures according to the provider agreement.

Exit: Real response evidence matches the adapter contract or discrepancies are resolved in the plan.

### R3 — Deployed shadow

- Apply the additive migration in the approved beta environment.
- Deploy adapter, dispatcher, health controls, and binding with projection disabled.
- Poll the selected event; compare every proposed projection against official/manual truth.
- Exercise synthetic error injection for rate limits, stale data, partial payloads, duplicates, and out-of-order updates.

Exit: Shadow window has no unexplained identity/result discrepancy, scheduler/freshness are observable, and rollback is rehearsed.

### R4 — Private write beta

- Enable projection only for the beta event/template.
- Use named test leagues and testers.
- Prove one poll fans out through shared results, while organizer overrides remain league-scoped.
- Test issue #3 completion/reopening and physical-device notifications.
- Collect and triage feedback under the QA plan.

Exit: Beta acceptance matrix passes; no open P0/P1 issue; G4 package is ready.

### R5 — Production canary

- Apply approved production migration and deployment during a staffed window.
- Keep new template publication limited or invite-only.
- Enable one binding and one template, initially without optional notification triggers.
- Monitor run success, freshness, quarantines, projection changes, scoring, lifecycle transitions, outbox backlog, and feedback.
- Reconcile canary results manually through the agreed acceptance window.

Exit: G5 accepts the event family and operational ownership.

### R6 — Gradual expansion

- Publish the accepted template.
- Enable notification triggers one class at a time.
- Add leagues without increasing provider polling frequency: one event binding remains shared.
- Implement a structurally different second provider before declaring the adapter seam stable.
- Repeat R2–R5 for each provider/event family; prior acceptance does not waive event-specific checks.

## Recommended first rollout

Use UEFA Champions League 2026/27 as the first adapter proof because football-data.org was already proven in BoyzWC2026 and the knockout rounds begin in February 2027. Run provider verification before binding configuration, use shadow mode before the first scored knockout contest, and use a private beta league before public catalog publication.

Use NFL Playoffs 2026/27 with BALLDONTLIE as the recommended second adapter proof if G2 confirms terms, account tier, coverage, and real data quality. It exercises a different provider and sport while keeping a comparatively simple single-elimination result model.

The already-started 2026 MLB postseason is not a suitable first production automation deadline. Build and test its series model using fixtures or a historical/private template, then target a later bounded beta or the 2027 postseason.

## Migration deployment

### Before migration

- Snapshot schema version, row counts, and representative score outputs.
- Confirm backup/PITR capability for the selected Supabase plan and environment.
- Measure table/index size and lock risk.
- Run migration and backfill against a production-like copy or disposable database.
- Verify grants, RLS, generated types, compatibility reads, and old application behavior.
- Confirm scheduler and provider binding default to disabled/shadow.

### During migration

- Apply additive objects first; avoid dropping or rewriting current result tables.
- Record migration version and timestamps.
- Run post-migration invariants before enabling any new code path.
- Stop if existing template, pick, result, override, or scoring counts diverge.

### After migration

- Keep current `template_results` and scoring reads authoritative until compatibility projection is separately enabled.
- Backfill in bounded batches with restartable checkpoints.
- Compare old and new effective-result/scoring outputs.
- Enable bindings individually; never bulk-enable every event configuration.

## Rollback and recovery

### Immediate kill sequence

1. Disable the affected provider binding.
2. Disable canonical projection and event-specific notification triggers.
3. Leave manual organizer result entry available.
4. Preserve observations, runs, result versions, audit events, and outbox evidence.
5. Reconcile any accepted bad projection through a corrective result version; do not erase history.
6. Recompute affected leagues and verify lifecycle state.
7. Communicate status only through an owner-approved channel.

### Application rollback

The previous application can continue using `template_results` and current overrides while new tables remain additive. Feature/config switches route reads back to the compatibility path. After production data exists, prefer a forward repair over destructive down migration.

### Scheduler/provider rollback

Disable the job/binding and revoke or rotate the provider credential if compromised. Cron removal alone is insufficient: verify no manual, queued, or retry worker can fetch or project.

### Notification rollback

Disable the trigger and delivery worker independently. Preserve unsent intents for operator disposition; do not later send stale event notifications automatically. Mark canceled intents with reason and actor.

## Monitoring and alerts

Minimum dashboard per binding:

- current mode and kill-switch state;
- last attempt, success, data change, and next due time;
- current event state and freshness budget;
- run outcomes and latency;
- fetched, normalized, unchanged, projected, quarantined, and failed counts;
- remaining/estimated provider rate budget;
- unresolved mappings and conflicting finals;
- canonical correction count;
- affected template/league count;
- lifecycle transitions;
- outbox age, attempt success/failure, and pruned subscriptions.

Alert conditions:

- no successful run in a live freshness window;
- provider authentication failure;
- repeated rate limits or exhausted budget;
- unexpected zero-result response during an active event;
- unknown competitor or bracket edge blocking a required contest;
- conflicting terminal result or illegal status regression;
- canonical result changes after configured correction window;
- lifecycle transition or scoring recompute failure;
- outbox backlog beyond target;
- any unauthorized mutation attempt trend.

Alerts need a named operator, support hours, and escalation path before G4. Monitoring without an owner is not an operational control.

## Incident response

| Severity | Example | Immediate response |
|---|---|---|
| SEV-0 | Credential/service-role leak, cross-league unauthorized write | Disable affected routes/bindings, rotate secrets, preserve evidence, notify owner |
| SEV-1 | Wrong shared winner or scoring across leagues, destructive projection | Kill projection/notifications, correct canonically, recompute/audit, stop rollout |
| SEV-2 | Stale live data, mapping quarantine, scheduler/provider outage | Show delayed state, use manual fallback, investigate within active support window |
| SEV-3 | Isolated notification/UI/attribution defect | Disable affected trigger/surface if needed, backlog or patch under normal change control |

Post-incident review records timeline, event/run IDs, blast radius, customer-visible effect, control that failed, remediation, test added, and whether provider or rollout assumptions changed.

## Capacity, cost, and plan checks

Before G3/G4, confirm:

- Supabase project will not pause during the beta/live event and supports the required Cron, Edge Function, database, egress, backup, and log behavior.
- Provider request budget covers the most aggressive live polling window plus retries and manual verification.
- Shared polling is per event binding, not per league.
- Observation/audit retention and payload sanitization fit database/storage budget.
- Push fan-out fits Edge Function execution and outbound limits.
- A cost alert and hard/soft response threshold exist.
- Paid provider or hosting renewals have an owner and cancellation plan.

## Communication and beta support

No provider, tester, or customer communication occurs without owner approval. Before beta, prepare:

- concise tester purpose, data handled, support window, and manual fallback;
- known limitations and freshness expectations;
- approved feedback channel that never asks for secret links;
- start/end dates and cleanup/retention plan;
- named triage owner and emergency kill authority.

During beta, post status only when it helps testers act. After beta, publish a private summary of evidence, feedback, accepted risks, fixes, and go/no-go recommendation.

## Production-readiness checklist

### Architecture and data

- [ ] G0/G1 decisions and ADRs approved.
- [ ] Two provider shapes tested through the common model; at least the launch adapter has real-provider evidence.
- [ ] Schema upgrade/backfill and forward repair rehearsed.
- [ ] Shared results, league overrides, audit, deduplication, and correction semantics pass.
- [ ] Event-specific contest/round/series/tie/ceremony rules pass.
- [ ] Manual fallback remains usable.

### Security and legal

- [ ] All service-role mutation routes authenticate and authorize ownership.
- [ ] RLS/grants and server-only secret handling reviewed.
- [ ] Provider terms, tier, attribution, caching/storage, redistribution, and image/trademark constraints approved.
- [ ] Raw payload retention/sanitization policy approved.
- [ ] No secret appears in source, fixtures, logs, URLs, or client assets.

### Reliability and operations

- [ ] Scheduler environment/plan and non-pausing behavior verified.
- [ ] Rate limit, retry, stale, partial, fallback, and quarantine behavior tested.
- [ ] Binding, projection, scheduler, and notification kill switches rehearsed.
- [ ] Dashboard, alerts, runbook, operator, and support window exist.
- [ ] Backup/PITR and corrective recovery are verified.
- [ ] Provider and infrastructure cost alerts exist.

### Product and QA

- [ ] Existing custom/manual workflows pass regression.
- [ ] Provider-backed beta and independent result reconciliation pass.
- [ ] Duplicate/out-of-order/correction and organizer override beta cases pass.
- [ ] Issue #3 acceptance matrix passes without duplicate coronation.
- [ ] Physical-device push passes or related triggers remain disabled.
- [ ] Feedback is triaged with no open P0/P1.
- [ ] Public freshness, provenance, attribution, and delayed-data messaging are accurate.

### Rollout decision

- [ ] Residual risks and unsupported cases are documented.
- [ ] Rollback owner and go/no-go authority are named.
- [ ] G4 approves canary scope.
- [ ] G5 accepts the event family after the monitored window.

## Gate package required from the orchestrator

At each rollout gate, present only evidence appropriate to that stage and clearly list what remains unproven. The G4 package must contain migration and rollback results, provider/license approval, event configuration, shadow parity report, beta matrix, device evidence or disabled trigger list, monitoring screenshots/queries, cost/plan check, feedback summary, unresolved risks, and a precise canary/kill plan.
