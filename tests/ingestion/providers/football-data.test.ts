import { describe, expect, it, vi } from "vitest";
import { FootballDataAdapter, type FootballDataFetch } from "@/lib/ingestion/providers/football-data";
import { isProviderAdapterError } from "@/lib/ingestion/errors";
import { createObservationDispatcher } from "@/lib/ingestion/orchestrator/observation-dispatch";
import { sanitizeFailure } from "@/lib/ingestion/orchestrator/failure-policy";
import type { ClaimedIngestionRun } from "@/lib/ingestion/orchestrator/run-ledger-repository";
import type { ObservationEvidenceCommand } from "@/lib/ingestion/evidence/repository";
import type { PullContext } from "@/lib/ingestion/providers/provider-adapter";

const context = (adapterConfig: Record<string, unknown> = {}): PullContext => ({
  bindingId: "00000000-0000-4000-8000-000000000001",
  providerKey: "football-data",
  eventEditionId: "00000000-0000-4000-8000-000000000002",
  bindingKey: "ucl-2026-27",
  adapterConfigVersion: 1,
  adapterConfig: {
    mode: "provider", season: 2026, providerCompetitionId: "2001", providerSeasonId: "2027", seasonStart: "2026-07-01", seasonEnd: "2027-06-30",
    competitionExternalId: "ucl", eventEditionExternalId: "ucl-2026-27",
    stageMappings: { LEAGUE_STAGE: { externalId: "league", name: "League phase", kind: "league", ordinal: 1 } },
    matchMappings: { "9001": { contestExternalId: "match-9001", contestKey: "ucl-match-9001", name: "Synthetic match 9001" }, "1": { contestExternalId: "match-1", contestKey: "ucl-match-1", name: "Synthetic match 1" }, "2": { contestExternalId: "match-2", contestKey: "ucl-match-2", name: "Synthetic match 2" } },
    teamMappings: { "101": { eventEntryExternalId: "entry-a", competitorExternalId: "team-a", name: "Synthetic Albion" }, "202": { eventEntryExternalId: "entry-b", competitorExternalId: "team-b", name: "Synthetic Borough" } },
    ...adapterConfig,
  },
  windowStart: "2026-09-01T00:00:00Z",
  windowEnd: "2026-09-30T23:59:59Z",
  requestedAt: "2026-10-01T00:00:00Z",
  credential: { reference: "secretref://test", getValue: () => "sentinel-secret" },
});

const match = (overrides: Record<string, unknown> = {}) => ({
  id: 9001, utcDate: "2026-09-10T18:00:00Z", status: "FINISHED", stage: "LEAGUE_STAGE", group: null, matchday: 1,
  lastUpdated: "2026-09-10T20:00:00Z", competition: { id: 2001, code: "CL" },
  season: { id: 2027, startDate: "2026-07-01", endDate: "2027-06-30" },
  homeTeam: { id: 101, name: "Synthetic Albion", shortName: "Albion", tla: "ALB" },
  awayTeam: { id: 202, name: "Synthetic Borough", shortName: "Borough", tla: "BOR" },
  score: { winner: "DRAW", duration: "REGULAR", fullTime: { home: 1, away: 1 }, regularTime: { home: 1, away: 1 }, extraTime: null, penalties: null },
  ...overrides,
});
const payload = (...matches: unknown[]) => ({ competition: { id: 2001, code: "CL" }, resultSet: { count: matches.length }, matches });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const injectedFetch = (res: Response) => vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => res) as ReturnType<typeof vi.fn> & FootballDataFetch;

describe("FootballDataAdapter", () => {
  it("uses one fixed allowlisted request and emits validated normalized match and result observations", async () => {
    const fetch = injectedFetch(response(payload(match())));
    const batch = await new FootballDataAdapter({ fetch }).pull(context());
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toMatch(/^https:\/\/api\.football-data\.org\/v4\/competitions\/CL\/matches\?/);
    expect([...new URL(String(url)).searchParams.keys()].sort()).toEqual(["dateFrom", "dateTo", "season"]);
    expect(init?.redirect).toBe("error");
    expect(new Headers(init?.headers).get("X-Auth-Token")).toBe("sentinel-secret");
    expect(JSON.stringify(batch)).not.toContain("sentinel-secret");
    expect(batch.observations.map((o) => o.entityKind)).toContain("result");
    expect(batch.observations.find((o) => o.entityKind === "result")?.data).toMatchObject({ resultStatus: "final", outcomeType: "draw", score: { home: 1, away: 1 } });
  });

  it("normalizes extra-time regulation draw without deriving qualifier and drops sentinels recursively", async () => {
    const fixture = match({ status: "FINISHED", score: { winner: "HOME_TEAM", duration: "EXTRA_TIME", fullTime: { home: 3, away: 2 }, regularTime: { home: 1, away: 1 }, extraTime: { home: 2, away: 1 }, penalties: null, rawSentinel: "DO-NOT-RETAIN" }, vendorSentinel: "DO-NOT-RETAIN" });
    const batch = await new FootballDataAdapter({ fetch: injectedFetch(response(payload(fixture))) }).pull(context());
    expect(batch.observations.find((o) => o.entityKind === "result")?.data).toMatchObject({ outcomeType: "draw", score: { home: 1, away: 1 }, resultData: { duration: "EXTRA_TIME" } });
    expect(JSON.stringify(batch)).not.toContain("DO-NOT-RETAIN");
    expect(JSON.stringify(batch)).not.toContain("winner");
  });

  it("rejects ambiguous duration and unknown status with safe review diagnostics", async () => {
    const fixtures = [match({ id: 1, score: { winner: "HOME_TEAM", duration: "FUTURE", fullTime: { home: 3, away: 2 }, regularTime: null, extraTime: null, penalties: null } }), match({ id: 2, status: "DO-NOT-RETAIN", score: { winner: null, duration: "REGULAR", fullTime: null, regularTime: null, extraTime: null, penalties: null } })];
    const adapter = new FootballDataAdapter({ fetch: injectedFetch(response(payload(...fixtures))) });
    await expect(adapter.pull(context())).rejects.toMatchObject({ failure: {
      code: "invalid_response", retry: "never", details: { reviewRequired: true, reason: "unknown_duration", matchId: "1" },
    } });
  });

  it("manual mode performs no fetch", async () => {
    const fetch = vi.fn();
    const batch = await new FootballDataAdapter({ fetch }).pull(context({ mode: "manual" }));
    expect(fetch).not.toHaveBeenCalled();
    expect(batch.observations).toEqual([]);
  });

  it("rejects oversized streamed bodies safely", async () => {
    const oversized = new Response(JSON.stringify({ matches: [], sentinel: "x".repeat(128) }));
    const adapter = new FootballDataAdapter({ fetch: injectedFetch(oversized), maxResponseBytes: 64 });
    await expect(adapter.pull(context())).rejects.toMatchObject({ failure: { code: "invalid_response" } });
  });

  it("times out while consuming a stalled body", async () => {
    const stalled = new Response(new ReadableStream<Uint8Array>({ start() {} }));
    const adapter = new FootballDataAdapter({ fetch: injectedFetch(stalled), timeoutMs: 5 });
    await expect(adapter.pull(context())).rejects.toMatchObject({ failure: { code: "timeout" } });
  });

  it("classifies auth failures without exposing provider body or credential", async () => {
    const adapter = new FootballDataAdapter({ fetch: injectedFetch(new Response("sentinel-secret", { status: 401 })) });
    let error: unknown;
    try { await adapter.pull(context()); } catch (caught) { error = caught; }
    expect(isProviderAdapterError(error)).toBe(true);
    expect(JSON.stringify((error as { failure: unknown }).failure)).not.toContain("sentinel-secret");
    expect((error as { failure: { code: string } }).failure.code).toBe("authentication");
  });
});


const finalContext = () => context({
  stageMappings: { FINAL: { externalId: "final", name: "Final", kind: "knockout", ordinal: 1 } },
});
async function pullRow(row: unknown, ctx = context(), envelope: Record<string, unknown> = {}) {
  return new FootballDataAdapter({ fetch: injectedFetch(response({ ...payload(row), ...envelope })) }).pull(ctx);
}

describe("FD adjudicated boundary regressions", () => {
  it.each([
    { competition: { id: 999, code: "OTHER" } },
    { competition: { id: 999, code: "CL" } },
    { competition: null },
    { season: { id: 1901, startDate: "1901-01-01", endDate: "1901-12-31" } },
    { season: { id: 2027, startDate: "2026-07-02", endDate: "2027-06-30" } },
    { season: null },
    { utcDate: "1901-01-01" },
    { utcDate: "2026-08-31T23:59:59Z" },
    { utcDate: "2026-10-01T00:00:00Z" },
    { utcDate: null },
  ])("FD01 rejects conflicting or absent row scope %#", async (overrides) => {
    await expect(pullRow(match(overrides))).rejects.toMatchObject({ failure: {
      code: "invalid_response", retry: "never", details: { reviewRequired: true, matchId: "9001" },
    } });
  });

  it.each([null, { id: 999, code: "OTHER" }, { id: 999, code: "CL" }, { code: "CL" }])(
    "FD01 rejects absent/conflicting envelope competition %#", async (competition) => {
      await expect(pullRow(match(), context(), { competition })).rejects.toMatchObject({ failure: { code: "invalid_response" } });
    },
  );

  it("FD01 requires explicit reviewed provider IDs rather than interpreting edition labels as IDs", async () => {
    const fetch = vi.fn();
    await expect(new FootballDataAdapter({ fetch }).pull(context({ providerSeasonId: null }))).rejects.toMatchObject({ failure: { code: "invalid_response" } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("FD01 enforces exact instants inside date-only request filters", async () => {
    const ctx = { ...context(), windowStart: "2026-09-10T19:00:00Z" };
    await expect(pullRow(match(), ctx)).rejects.toMatchObject({ failure: { details: { reason: "outside_window" } } });
  });

  it("FD02 uses precisely the emitted reviewed contest reference for result lookup, without a second alias", async () => {
    const batch = await pullRow(match());
    const contest = batch.observations.find(o => o.entityKind === "contest")!;
    const result = batch.observations.find(o => o.entityKind === "result")!;
    expect(contest.externalId).toBe("match-9001");
    expect(result.data.contestExternalId).toBe(contest.externalId);
    // Exact binding+external-ID lookup used by result SQL; no raw-ID alias is seeded.
    const references = new Map([[context().bindingId + ":" + contest.externalId, "canonical-contest"]]);
    expect(references.get(context().bindingId + ":" + result.data.contestExternalId)).toBe("canonical-contest");
    expect(contest.sanitizedPayload.id).toBe("9001");
  });

  it.each([
    ["EXTRA_TIME", { home: 2, away: 1 }, null, "HOME_TEAM", "entry-a", { home: 2, away: 1 }],
    ["PENALTY_SHOOTOUT", { home: 1, away: 1 }, { home: 4, away: 5 }, "AWAY_TEAM", "entry-b", { home: 1, away: 1 }],
  ])("FD03 FINAL %s emits one inclusive champion", async (duration, fullTime, penalties, winner, entry, score) => {
    const batch = await pullRow(match({ stage: "FINAL", score: {
      duration, winner, regularTime: { home: 1, away: 1 }, fullTime, penalties,
    } }), finalContext());
    const results = batch.observations.filter(o => o.entityKind === "result");
    expect(results).toHaveLength(1);
    expect(results[0].data).toMatchObject({ resultStatus: "final", outcomeType: "winner", winnerEventEntryExternalId: entry, score });
  });

  it("FD03 nonfinal shootout keeps the regulation draw without inferring qualifier", async () => {
    const batch = await pullRow(match({ score: { duration: "PENALTY_SHOOTOUT", winner: "HOME_TEAM", regularTime: { home: 1, away: 1 }, fullTime: { home: 1, away: 1 }, penalties: { home: 5, away: 4 } } }));
    expect(batch.observations.find(o => o.entityKind === "result")?.data).toMatchObject({ resultStatus: "final", outcomeType: "draw", score: { home: 1, away: 1 } });
  });

  it.each([
    { id: 9002 },
    { stage: "UNKNOWN-SENTINEL" },
    { homeTeam: { id: 999 } },
    { awayTeam: { id: 101 } },
    { score: { duration: "REGULAR", winner: "HOME_TEAM", fullTime: { home: 0, away: 1 } } },
  ])("FD04 unsafe row %# fails atomically with auditable numeric ID and reason", async overrides => {
    const adapter = new FootballDataAdapter({ fetch: injectedFetch(response(payload(match(), match(overrides)))) });
    let failure;
    try { await adapter.pull(context()); } catch (error) { failure = adapter.classifyError(error); }
    expect(failure).toMatchObject({ code: "invalid_response", retry: "never", details: { reviewRequired: true, matchId: String(overrides.id ?? 9001) } });
    expect(failure?.details.reason).toEqual(expect.any(String));
    expect(JSON.stringify(failure)).not.toContain("UNKNOWN-SENTINEL");
  });

  it.each([
    { duration: "REGULAR", winner: "DRAW", fullTime: { home: 1, away: 1 } },
    { duration: "EXTRA_TIME", winner: "HOME_TEAM", regularTime: { home: 1, away: 1 }, fullTime: { home: 1, away: 2 } },
    { duration: "PENALTY_SHOOTOUT", winner: "HOME_TEAM", regularTime: { home: 1, away: 1 }, fullTime: { home: 1, away: 1 }, penalties: { home: 4, away: 5 } },
  ])("FD03/04 contradictory FINAL deciders %# cannot settle", async score => {
    await expect(pullRow(match({ stage: "FINAL", score }), finalContext())).rejects.toMatchObject({ failure: { details: { reviewRequired: true, reason: "score_conflict" } } });
  });

  it("FD05 retains only validated source provenance, never trusted correction/order fields", async () => {
    const batch = await pullRow(match());
    for (const observation of batch.observations) {
      expect(observation.sanitizedPayload.lastUpdated).toBe("2026-09-10T20:00:00.000Z");
      expect(observation.observedAt).toBe(context().requestedAt);
      expect(observation).not.toHaveProperty("providerUpdatedAt");
      expect(observation).not.toHaveProperty("providerRevision");
      expect(observation.data).not.toHaveProperty("providerEffectiveAt");
      expect(observation.data).not.toHaveProperty("correctionReason");
    }
    const invalid = await pullRow(match({ lastUpdated: "DO-NOT-RETAIN" }));
    expect(JSON.stringify(invalid)).not.toContain("DO-NOT-RETAIN");
  });
});


describe("FD integration-facing evidence contract (no database claim)", () => {
  it("real dispatcher persists the same contest reference consumed by result projection and untrusted provenance", async () => {
    const batch = await pullRow(match());
    const commands: ObservationEvidenceCommand[] = [];
    const evidence = { record: vi.fn(async (command: ObservationEvidenceCommand) => {
      commands.push(command);
      return { outcome: "inserted" as const, observationId: "observation-" + commands.length };
    }) };
    const structural = { projectObservation: vi.fn().mockResolvedValue({ kind: "projected", canonicalId: "canonical-contest" }) };
    const result = { project: vi.fn().mockResolvedValue({ outcome: "projected" }) };
    const dispatcher = createObservationDispatcher({ evidence, structural, result });
    const ctx = context();
    const run: ClaimedIngestionRun = {
      runId: "run-fd", bindingId: ctx.bindingId, claimKey: "claim", claimRequestKey: "request",
      claimGeneration: 1, retryIndex: 0, checkpointGeneration: 0, leaseToken: "lease", leaseAcquired: true,
      providerId: "provider-fd", eventEditionId: ctx.eventEditionId, adapterKey: "football-data",
      bindingKey: ctx.bindingKey, mode: "write", credentialRef: null, adapterConfigVersion: 1,
      adapterConfig: ctx.adapterConfig, pollPolicy: {}, providerCursor: {}, providerEtag: null, leaseExpiresAt: null,
    };
    for (const observation of batch.observations) {
      await dispatcher.dispatch({ run, observation, receivedAt: batch.receivedAt, mode: "write" });
    }
    expect(commands.map(c => c.externalObjectKind)).toEqual(["contest", "result"]);
    expect(commands[1].snapshot.normalizedEntity.contestExternalId).toBe(commands[0].externalObjectId);
    expect(commands[0].externalObjectId).toBe("match-9001");
    expect(commands[0].bindingId).toBe(commands[1].bindingId);
    expect(structural.projectObservation).toHaveBeenCalledWith({ observationId: "observation-1" });
    expect(result.project).toHaveBeenCalledWith({ observationId: "observation-2" });
    for (const command of commands) {
      expect(command.sanitizedPayload.lastUpdated).toBe("2026-09-10T20:00:00.000Z");
      expect(command).not.toHaveProperty("providerUpdatedAt");
      expect(command.snapshot).not.toHaveProperty("correctionProvenance");
    }
  });

  it("FD04 existing run failure sanitizer preserves bounded actionable diagnostic", async () => {
    const adapter = new FootballDataAdapter({ fetch: injectedFetch(response(payload(match({ id: 9002 })))) });
    let safe;
    try { await adapter.pull(context()); } catch (error) { safe = sanitizeFailure(adapter.classifyError(error)); }
    expect(safe?.details).toEqual({
      reviewRequired: true, reason: "unmapped_match", matchId: "9002", homeTeamId: "101", awayTeamId: "202",
      rowIndex: 0, fetchedCount: 1,
    });
  });

  it.each(["UNKNOWN-SENTINEL", "constructor", "__proto__"])("holds unknown status %s with fixed reason and no raw text", async status => {
    await expect(pullRow(match({ status }))).rejects.toMatchObject({ failure: { details: { reason: "unknown_status" } } });
  });

  it("keeps scheduled null scores unsettled and manual mode does not read credentials", async () => {
    const batch = await pullRow(match({ status: "TIMED", score: { duration: "REGULAR", fullTime: null, winner: null } }));
    expect(batch.observations.find(o => o.entityKind === "result")?.data).toMatchObject({ resultStatus: "unresolved", outcomeType: "pending" });
    const ctx = { ...context({ mode: "manual" }), credential: { reference: "synthetic", getValue: vi.fn(() => { throw new Error("must not read"); }) } };
    await new FootballDataAdapter({ fetch: vi.fn() }).pull(ctx);
    expect(ctx.credential.getValue).not.toHaveBeenCalled();
  });

  it.each([null, {}, { home: -1, away: 0 }, { home: 1.5, away: 0 }])("finished missing/invalid score %# cannot settle", async fullTime => {
    await expect(pullRow(match({ score: { duration: "REGULAR", winner: "HOME_TEAM", fullTime } }))).rejects.toMatchObject({ failure: { details: { reason: "missing_score" } } });
  });

  it("includes the entire configured season-end UTC date", async () => {
    const ctx = { ...context(), windowStart: "2027-06-01T00:00:00Z", windowEnd: "2027-06-30T23:59:59Z" };
    await expect(pullRow(match({ utcDate: "2027-06-30T20:00:00Z" }), ctx)).resolves.toMatchObject({ fetchedCount: 1 });
  });
});


describe("FD final settlement completeness", () => {
  it("a regular-time final produces one champion, not a separate regulation market", async () => {
    const batch = await pullRow(match({ stage: "FINAL", score: { duration: "REGULAR", winner: "HOME_TEAM", fullTime: { home: 2, away: 0 } } }), finalContext());
    expect(batch.observations.filter(o => o.entityKind === "result")).toHaveLength(1);
    expect(batch.observations.find(o => o.entityKind === "result")?.data).toMatchObject({ resultStatus: "final", outcomeType: "winner", winnerEventEntryExternalId: "entry-a" });
  });
  it("a declared shootout winner without numeric decider is held", async () => {
    await expect(pullRow(match({ stage: "FINAL", score: { duration: "PENALTY_SHOOTOUT", winner: "HOME_TEAM", regularTime: { home: 1, away: 1 }, fullTime: { home: 1, away: 1 } } }), finalContext())).rejects.toMatchObject({ failure: { details: { reason: "missing_score" } } });
  });
});
