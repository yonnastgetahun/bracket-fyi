import { describe, expect, it, vi } from "vitest";
import type { PullContext } from "@/lib/ingestion/providers/provider-adapter";
import { BdlNflAdapter } from "@/lib/ingestion/providers/balldontlie-nfl";
import { config, game, request, response, raw, secret } from "../../events/provider-bdl-vertical-fixture";

const adapterFor = (row = game()) => new BdlNflAdapter({ fetch: async () => response(row) });
describe("production BDL NFL ProviderAdapter", () => {
  it("uses one bounded request, explicit cross-year season/day and reviewed contest identity", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      const u = new URL(String(url));
      expect(u.origin + u.pathname).toBe("https://api.balldontlie.io/nfl/v1/games");
      expect(Object.fromEntries(u.searchParams)).toEqual({ "seasons[]": "2026", "season_types[]": "3", "dates[]": "2027-01-20", per_page: "100" });
      expect(init?.redirect).toBe("error");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(new Headers(init?.headers).get("Authorization")).toBe(secret);
      return response(game());
    });
    const batch = await new BdlNflAdapter({ fetch }).pull(request());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(batch.fetchedCount).toBe(1);
    expect(batch.observations[0].externalId).toBe("synthetic-nfl-game");
    expect(batch.observations[0].data).toMatchObject({ scheduledAt: "2027-01-20T18:00:00Z", contestKind: "game" });
    expect(batch.observations[1].data).toMatchObject({ outcomeType: "winner", winnerEventEntryExternalId: "nfl-entry-home", score: { home: 24, away: 17 } });
    expect(JSON.stringify(batch)).not.toContain(secret);
    expect(JSON.stringify(batch)).not.toContain(raw);
    for (const o of batch.observations) {
      expect(o.providerRevision).toBeUndefined();
      expect(o.providerUpdatedAt).toBeUndefined();
      expect(o).not.toHaveProperty("providerEffectiveAt");
    }
  });
  it("settles inclusive overtime scores without adding overtime again", async () => {
    const batch = await adapterFor({ ...game(27, 30), status: "Final/OT", home_team_ot: 3, visitor_team_ot: 6 }).pull(request());
    expect(batch.observations[1].data).toMatchObject({ winnerEventEntryExternalId: "nfl-entry-away", score: { home: 27, away: 30 }, resultData: { settlementScope: "including_overtime" } });
  });
  it.each(["scheduled", "in_progress"])("does not settle nonfinal %s scores", async status_state => {
    const batch = await adapterFor({ ...game(), status_state, status: "nonfinal" }).pull(request());
    expect(batch.observations[1].data).toMatchObject({ resultStatus: "unresolved", outcomeType: "pending" });
    expect(batch.observations[1].data).not.toHaveProperty("winnerEventEntryExternalId");
    expect(batch.observations[1].data).not.toHaveProperty("score");
  });
  it.each([
    ["unknown lifecycle", { status_state: "unknown" }],
    ["contradictory lifecycle", { status_state: "scheduled" }],
    ["contradictory final label", { status: "In progress" }],
    ["tied elimination final", { visitor_team_score: 24 }],
    ["missing final score", { home_team_score: null }],
    ["negative score", { home_team_score: -1 }],
    ["fractional score", { home_team_score: 2.5 }],
    ["unmapped game", { id: 9999 }],
    ["unmapped team", { home_team: { id: 9999 } }],
    ["swapped pairing", { home_team: { id: 702 }, visitor_team: { id: 701 } }],
    ["wrong edition", { season: 2027 }],
    ["regular season", { postseason: false }],
    ["wrong week", { week: 1 }],
    ["wrong date", { date: "2027-01-21" }],
  ])("rejects %s without a partial batch", async (_label, patch) => {
    await expect(adapterFor({ ...game(), ...patch }).pull(request())).rejects.toMatchObject({ failure: { code: "invalid_response", retry: "never" } });
  });
  it("rejects an entire multirow page after an otherwise valid prefix", async () => {
    const adapter = new BdlNflAdapter({ fetch: async () => Response.json({ data: [game(), game(24, 17, 9999)], meta: { per_page: 100 } }) });
    await expect(adapter.pull(request())).rejects.toMatchObject({ failure: { details: { rowIndex: 1, fetchedCount: 2, reason: "unmapped_game" } } });
  });
  it("rejects duplicate games within a page", async () => {
    const adapter = new BdlNflAdapter({ fetch: async () => Response.json({ data: [game(), game()], meta: { per_page: 100 } }) });
    await expect(adapter.pull(request())).rejects.toMatchObject({ failure: { details: { reason: "invalid_or_duplicate_game" } } });
  });
  it("manual mode touches neither credentials nor HTTP", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const getValue = vi.fn(() => { throw Error("must not access"); });
    const batch = await new BdlNflAdapter({ fetch }).pull(request({ adapterConfig: { mode: "manual" }, credential: { reference: "manual", getValue } }));
    expect(batch.observations).toEqual([]);
    expect(fetch).not.toHaveBeenCalled(); expect(getValue).not.toHaveBeenCalled();
  });
  it.each([
    { windowEnd: "2027-01-21T00:00:00Z" },
    { windowStart: "2025-01-20T00:00:00Z", windowEnd: "2025-01-20T23:59:59Z" },
    { cursor: { url: "https://untrusted.invalid" } },
    { cursor: { cursor: -1 } },
    { cursor: { cursor: "7" } },
    { adapterConfig: { ...config, sport: "nba" } },
    { adapterConfig: { ...config, matchMappings: { "7701": { contestExternalId: "x" } } } },
  ] as Partial<PullContext>[])("rejects malformed config/window/cursor before HTTP: %j", async override => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(new BdlNflAdapter({ fetch }).pull(request(override))).rejects.toMatchObject({ failure: { code: "invalid_response" } });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("accepts the real ledger's empty first-page cursor without sending a cursor parameter", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async url => {
      expect(new URL(String(url)).searchParams.has("cursor")).toBe(false);
      return response(game());
    });
    const batch = await new BdlNflAdapter({ fetch }).pull(request({ cursor: {} }));
    expect(batch.observations).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("returns typed advancing pagination and sends only the numeric cursor", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async url => {
      expect(new URL(String(url)).searchParams.get("cursor")).toBe("7");
      return Response.json({ data: [game()], meta: { per_page: 100, next_cursor: 8 } });
    });
    const batch = await new BdlNflAdapter({ fetch }).pull(request({ cursor: { cursor: 7 } }));
    expect(batch.nextCursor).toEqual({ cursor: 8 }); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects nonadvancing pagination", async () => {
    const adapter = new BdlNflAdapter({ fetch: async () => Response.json({ data: [game()], meta: { per_page: 100, next_cursor: 7 } }) });
    await expect(adapter.pull(request({ cursor: { cursor: 7 } }))).rejects.toMatchObject({ failure: { code: "invalid_response" } });
  });
  it("rejects over-100-row pages even inside the byte bound", async () => {
    const adapter = new BdlNflAdapter({ fetch: async () => Response.json({ data: Array.from({ length: 101 }, () => game()), meta: { per_page: 100 } }) });
    await expect(adapter.pull(request())).rejects.toMatchObject({ failure: { code: "invalid_response" } });
  });
  it("classifies authentication failures without persisting bodies or arbitrary errors", async () => {
    const adapter = new BdlNflAdapter({ fetch: async () => response(game(), 401) });
    try { await adapter.pull(request()); throw Error("expected rejection"); }
    catch (e) {
      const failure = adapter.classifyError(e);
      expect(failure).toMatchObject({ code: "authentication", retry: "never" });
      expect(JSON.stringify(failure)).not.toContain(secret);
    }
    expect(JSON.stringify(adapter.classifyError(new Error(secret)))).not.toContain(secret);
  });
});
