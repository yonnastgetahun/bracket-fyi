import { describe, expect, it, vi } from "vitest";
import type { PullContext } from "@/lib/ingestion/providers/provider-adapter";
import { BdlNbaAdapter } from "@/lib/ingestion/providers/balldontlie-nba";
import { BdlMlbAdapter } from "@/lib/ingestion/providers/balldontlie-mlb";
import { BdlNcaabAdapter } from "@/lib/ingestion/providers/balldontlie-ncaab";
import { BdlNcaafAdapter } from "@/lib/ingestion/providers/balldontlie-ncaaf";
import { families, config, game, request, response } from "../../events/provider-four-family-fixture";
const adapters = { nba: BdlNbaAdapter, mlb: BdlMlbAdapter, ncaab: BdlNcaabAdapter, ncaaf: BdlNcaafAdapter };
describe.each(families)("production %s consumer", sport => {
 const pull = (patch = {}, overrides = {}) => new adapters[sport]({ fetch: async () => response({ ...game(sport), ...patch }) }).pull(request(sport, overrides));
 it("settles reviewed ID including OT/runs, no manufactured revision or raw data", async () => {
  const batch = await pull();
  expect(batch.observations).toHaveLength(2);
  expect(batch.observations[1].data).toMatchObject({ outcomeType: "winner", winnerEventEntryExternalId: "family-entry-home", score: { home: 24, away: 17 } });
  expect(batch.observations[1].providerRevision).toBeUndefined();
  expect(JSON.stringify(batch)).not.toContain("RAW-SENTINEL");
 });
 it.each([{ status_state: "unknown" }, { status: "Live" }, { id: 999 }, { season: 2025 }, { home_team: { id: 702 } }, { date: "2027-02-01" }, { date: "2027-01-20garbage" }])("quarantines uncertain/unrelated evidence %j", async patch => {
  await expect(pull(patch)).rejects.toMatchObject({ failure: { code: "invalid_response" } });
 });
 it("rejects tied/missing final scores", async () => {
  for (const score of [17, null]) await expect(pull({ home_team_score: score, home_score: score, home_team_data: { runs: score } })).rejects.toMatchObject({ failure: { code: "invalid_response" } });
 });
 it("does not settle live scores", async () => {
  expect((await pull({ status_state: "in_progress", status: "Live" })).observations[1].data).toMatchObject({ outcomeType: "pending" });
 });
 it("uses one request and returns typed continuation; rejects nonadvancing cursor", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ data: [game(sport)], meta: { per_page: 100, next_cursor: 8 } }));
  const a = new adapters[sport]({ fetch });
  expect((await a.pull(request(sport, { cursor: { cursor: 7 } }))).nextCursor).toEqual({ cursor: 8 });
  expect(fetch).toHaveBeenCalledTimes(1);
  await expect(a.pull(request(sport, { cursor: { cursor: 8 } }))).rejects.toMatchObject({ failure: { code: "invalid_response" } });
 });
 it("manual mode accesses neither HTTP nor secret", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  expect((await new adapters[sport]({ fetch }).pull(request(sport, { adapterConfig: { mode: "manual" } }))).observations).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
 });
 it("requires explicit reviewed membership", async () => {
  const c = config(sport); c.phase = "unrelated";
  await expect(pull({}, { adapterConfig: c })).rejects.toMatchObject({ failure: { code: "invalid_response" } });
 });
});
it("NBA Play-In admits its separate reviewed map/query, rejects playoff membership", async () => {
 const c = config("nba", "playin");
 const fetch = vi.fn<typeof globalThis.fetch>(async url => { expect(new URL(String(url)).searchParams.get("season_type")).toBe("playin"); return response({ ...game("nba"), postseason: false }); });
 expect((await new BdlNbaAdapter({ fetch }).pull(request("nba", { adapterConfig: c }))).observations).toHaveLength(2);
 c.phase = "playoffs";
 await expect(new BdlNbaAdapter({ fetch }).pull(request("nba", { adapterConfig: c }))).rejects.toMatchObject({ failure: { details: { reason: "invalid_match_mapping" } } });
});

it.each(families)("%s rejects ambiguous full terminal pages and empty continuations", async sport => {
 for (const meta of [{ per_page: 1 }, { per_page: 1, next_cursor: null }]) {
  const a = new adapters[sport]({ fetch: async () => Response.json({ data: [game(sport)], meta }) });
  await expect(a.pull(request(sport))).rejects.toMatchObject({ failure: { details: { reason: "ambiguous_pagination" } } });
 }
 const a = new adapters[sport]({ fetch: async () => Response.json({ data: [], meta: { per_page: 100, next_cursor: 8 } }) });
 await expect(a.pull(request(sport))).rejects.toMatchObject({ failure: { details: { reason: "ambiguous_pagination" } } });
});

describe.each(families)("%s finite admission adversaries", sport => {
 it("rejects a valid prefix followed by an unrelated game atomically", async () => {
  const a = new adapters[sport]({ fetch: async () => Response.json({ data: [game(sport), game(sport, 24, 17, 9999)], meta: { per_page: 100 } }) });
  await expect(a.pull(request(sport))).rejects.toMatchObject({ failure: { details: { rowIndex: 1, fetchedCount: 2, reason: "unmapped_game" } } });
 });
 it("rejects duplicate same-ID rows, never counts a resumed game twice", async () => {
  const a = new adapters[sport]({ fetch: async () => Response.json({ data: [game(sport), game(sport)], meta: { per_page: 100 } }) });
  await expect(a.pull(request(sport))).rejects.toMatchObject({ failure: { details: { reason: "invalid_or_duplicate_game" } } });
 });
 it("rejects foreign consumer configs, malformed cursors, duplicate mappings before HTTP", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const a = new adapters[sport]({ fetch });
  const c = config(sport); const mappings = c.matchMappings as Record<string, never>; c.matchMappings = { ...mappings, "7702": mappings["7701"] };
  const patches: Partial<PullContext>[] = [{ adapterConfig: { ...config(sport), sport: sport === "nba" ? "mlb" : "nba" } }, { cursor: { cursor: "7" } }, { cursor: { url: "https://untrusted.invalid" } }, { adapterConfig: c }];
  for (const patch of patches) {
   await expect(a.pull(request(sport, patch))).rejects.toMatchObject({ failure: { code: "invalid_response" } });
  }
  expect(fetch).not.toHaveBeenCalled();
 });
 it("inclusive OT totals remain unchanged; away winner is not home default", async () => {
  const a = new adapters[sport]({ fetch: async () => response({ ...game(sport, 17, 24), status: sport === "mlb" ? "Final" : "Final/2OT" }) });
  expect((await a.pull(request(sport))).observations[1].data).toMatchObject({ winnerEventEntryExternalId: "family-entry-away", score: { home: 17, away: 24 } });
 });
 it("redacts auth response and arbitrary thrown secrets", async () => {
  const a = new adapters[sport]({ fetch: async () => response(game(sport), 401) });
  try { await a.pull(request(sport)); throw Error("expected failure"); }
  catch(e) { expect(a.classifyError(e).code).toBe("authentication"); expect(JSON.stringify(a.classifyError(e))).not.toContain("SYNTHETIC-SECRET"); }
  expect(JSON.stringify(a.classifyError(Error("SYNTHETIC-SECRET")))).not.toContain("SYNTHETIC-SECRET");
 });
});
it.each(["nba", "mlb"] as const)("%s rejects regular season despite same mapped ID", async sport => {
 const a = new adapters[sport]({ fetch: async () => response({ ...game(sport), postseason: false }) });
 await expect(a.pull(request(sport))).rejects.toMatchObject({ failure: { details: { reason: "edition_membership_mismatch" } } });
});
it("CFP requires reviewed week as well as game ID; bowl names never select membership", async () => {
 const a = new BdlNcaafAdapter({ fetch: async () => response({ ...game("ncaaf"), week: 12 }) });
 await expect(a.pull(request("ncaaf"))).rejects.toMatchObject({ failure: { details: { reason: "edition_membership_mismatch" } } });
});
it("MLB suspended is unresolved/quarantined, never a runs-based winner", async () => {
 const a = new BdlMlbAdapter({ fetch: async () => response({ ...game("mlb"), status: "Suspended", status_state: "unknown" }) });
 await expect(a.pull(request("mlb"))).rejects.toMatchObject({ failure: { details: { reason: "unknown_status" } } });
});
it("NBA explicit timestamp cannot contradict reviewed kickoff", async () => {
 const a = new BdlNbaAdapter({ fetch: async () => response({ ...game("nba"), datetime: "2027-01-20T19:00:00Z" }) });
 await expect(a.pull(request("nba"))).rejects.toMatchObject({ failure: { details: { reason: "schedule_mismatch" } } });
});
