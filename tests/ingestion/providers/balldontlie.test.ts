import { describe, expect, it, vi } from "vitest";
import { BDL_SPORT_CONFIG, fetchBdlPage, type BdlSport } from "@/lib/ingestion/providers/balldontlie";

const credential = { getValue: () => "sentinel-secret" };
const response = (data: unknown[], next_cursor: unknown = null) => new Response(JSON.stringify({ data, meta: { next_cursor, per_page: 100 } }));
const row = (sport: BdlSport, season = 2027) => {
  const base: Record<string, unknown> = { id: 1, date: "2027-01-01", season, status: "unknown", status_state: "unknown", secret: "DO-NOT-KEEP" };
  if (sport === "nfl" || sport === "nba") Object.assign(base, { home_team_score: 0, visitor_team_score: 0, home_team: { id: 1, name: "Synthetic", logo: "DO-NOT-KEEP" }, visitor_team: { id: 2, name: "Other" } });
  if (sport === "mlb") Object.assign(base, { home_team_data: { runs: 2 }, away_team_data: { runs: 2 }, home_team: { id: 1 }, away_team: { id: 2 } });
  if (sport === "ncaab") Object.assign(base, { home_score: 4, away_score: 4, home_ot_scores: [], away_ot_scores: [], home_team: { id: 1 }, visitor_team: { id: 2 } });
  if (sport === "ncaaf") Object.assign(base, { home_score: 4, away_score: 4, home_team: { id: 1 }, visitor_team: { id: 2 } });
  return base;
};
describe("BALLDONTLIE bounded transport", () => {
  it("uses fixed sport endpoints, explicit season filters, and one request per page", async () => {
    for (const sport of Object.keys(BDL_SPORT_CONFIG) as BdlSport[]) {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => response([row(sport)]));
      await fetchBdlPage({ sport, season: 2027, mode: "provider", ...(sport === "nba" ? { nbaPhase: "playin" as const } : {}), credential, fetch: fetch as typeof globalThis.fetch });
      expect(fetch).toHaveBeenCalledTimes(1);
      const url = new URL(String(fetch.mock.calls[0]![0]));
      expect(url.origin).toBe("https://api.balldontlie.io"); expect(url.pathname).toBe(BDL_SPORT_CONFIG[sport].path);
      expect(url.searchParams.get("seasons[]")).toBe("2027"); expect(url.searchParams.get("per_page")).toBe("100");
      if (sport === "nfl") expect(url.searchParams.get("season_types[]")).toBe("3");
      if (sport === "nba") expect(url.searchParams.get("season_type")).toBe("playin");
    }
  });
  it("projects recursive allowlists, preserves unknown status, and never treats a tie as a winner", async () => {
    const page = await fetchBdlPage({ sport: "mlb", season: 2027, mode: "provider", credential, fetch: (async () => response([row("mlb")])) as typeof fetch });
    expect(page.data[0]).toMatchObject({ status_state: "unknown", home_team_data: { runs: 2 } });
    expect(JSON.stringify(page)).not.toContain("DO-NOT-KEEP");
  });
  it("manual never reads credentials or fetch; rejects mismatched season, bad cursor and nonadvancing pagination", async () => {
    const fetch = vi.fn(); const cred = { getValue: vi.fn() };
    expect(await fetchBdlPage({ sport: "nfl", season: 2027, mode: "manual", credential: cred, fetch })).toMatchObject({ data: [] });
    expect(fetch).not.toHaveBeenCalled(); expect(cred.getValue).not.toHaveBeenCalled();
    await expect(fetchBdlPage({ sport: "nfl", season: 2027, mode: "provider", cursor: -1, credential, fetch: fetch as typeof globalThis.fetch })).rejects.toThrow();
    await expect(fetchBdlPage({ sport: "nfl", season: 2027, mode: "provider", credential, fetch: (async () => response([row("nfl", 2026)])) as typeof fetch })).rejects.toThrow();
    await expect(fetchBdlPage({ sport: "nfl", season: 2027, mode: "provider", cursor: 5, credential, fetch: (async () => response([], 5)) as typeof fetch })).rejects.toThrow();
  });
});

describe("PS-01 recursive leaf boundary", () => {
  it("rejects objects and arrays beneath every allowed scalar leaf across all sports", async () => {
    for (const sport of Object.keys(BDL_SPORT_CONFIG) as BdlSport[]) {
      for (const field of BDL_SPORT_CONFIG[sport].fields) {
        const paths = typeof field === "string" ? [[field]] : Object.entries(field).flatMap(([key, leaves]) => (leaves as readonly string[]).map(leaf => [key, leaf]));
        for (const path of paths) {
          if (path[0] === "season") continue; // Required season equality already rejects malformed values.
          for (const bad of [{ hidden: ["original-leaf-sentinel"] }, [{ hidden: "original-leaf-sentinel" }]]) {
            const malformed = path.length === 1 ? { [path[0]!]: bad } : { [path[0]!]: { [path[1]!]: bad } };
            await expect(fetchBdlPage({
              sport, season: 2027, mode: "provider", ...(sport === "nba" ? { nbaPhase: "playoffs" as const } : {}),
              credential, fetch: async () => response([{ season: 2027, ...malformed }]),
            }), sport + "." + path.join(".")).rejects.toMatchObject({ failure: { code: "invalid_response" } });
          }
        }
      }
    }
  });
});

describe("PS-03 MLB runs", () => {
  it("rejects malformed non-null runs independently on either side", async () => {
    for (const side of ["home_team_data", "away_team_data"]) {
      for (const runs of [-3, 0.25, "4", true, { hidden: "runs-marker" }, [4], Number.MAX_SAFE_INTEGER + 1]) {
        await expect(fetchBdlPage({ sport: "mlb", season: 2027, mode: "provider", credential,
          fetch: async () => response([{ season: 2027, [side]: { runs } }]),
        })).rejects.toMatchObject({ failure: { code: "invalid_response" } });
      }
    }
  });
  it("preserves zero, positive, null and missing runs without inferred settlement", async () => {
    for (const runs of [0, 12, null, undefined]) {
      const data = { home_team_data: runs === undefined ? {} : { runs }, away_team_data: runs === undefined ? {} : { runs } };
      const page = await fetchBdlPage({ sport: "mlb", season: 2027, mode: "provider", credential,
        fetch: async () => response([{ season: 2027, status_state: "unknown", ...data }]),
      });
      expect(page.data).toEqual([{ season: 2027, status_state: "unknown", ...data }]);
    }
  });
});

describe("PS-02 sport-specific date requests", () => {
  it("uses a single dates[] only for an explicit equal-bound NFL/MLB day", async () => {
    for (const sport of ["nfl", "mlb"] as const) {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => response([]));
      await fetchBdlPage({ sport, season: 2027, mode: "provider", credential, fetch, cursor: 7, dateStart: "2027-02-03", dateEnd: "2027-02-03" });
      const query = new URL(String(fetch.mock.calls[0]![0])).searchParams;
      expect([...query.entries()].sort()).toEqual([
        ["cursor", "7"], ["dates[]", "2027-02-03"], ["per_page", "100"], ["seasons[]", "2027"],
        sport === "nfl" ? ["season_types[]", "3"] : ["season_type", "postseason"],
      ].sort());
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });
  it("fails closed on range or one-sided NFL/MLB bounds before credentials or fetch", async () => {
    for (const sport of ["nfl", "mlb"] as const) {
      for (const dates of [
        { dateStart: "2027-02-03", dateEnd: "2027-02-05" },
        { dateStart: "2027-02-03" }, { dateEnd: "2027-02-03" },
        { dateStart: "2027-02-30", dateEnd: "2027-02-30" },
        { dateStart: "", dateEnd: "" },
      ]) {
        const fetch = vi.fn<typeof globalThis.fetch>(async () => response([]));
        const cred = { getValue: vi.fn(() => "invented-query-token") };
        await expect(fetchBdlPage({ sport, season: 2027, mode: "provider", credential: cred, fetch, ...dates })).rejects.toMatchObject({ failure: { code: "invalid_response" } });
        expect(fetch).not.toHaveBeenCalled(); expect(cred.getValue).not.toHaveBeenCalled();
      }
    }
  });
  it("uses approved range filters without an ambiguous simultaneous date list for NBA/college", async () => {
    for (const sport of ["nba", "ncaab", "ncaaf"] as const) {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => response([]));
      await fetchBdlPage({ sport, season: 2027, mode: "provider", credential, fetch,
        ...(sport === "nba" ? { nbaPhase: "playoffs" as const } : {}), dateStart: "2027-02-03", dateEnd: "2027-02-05" });
      const expected = [["seasons[]", "2027"], ["per_page", "100"], ["start_date", "2027-02-03"], ["end_date", "2027-02-05"]];
      if (sport === "nba") expected.push(["season_type", "playoffs"]);
      expect([...new URL(String(fetch.mock.calls[0]![0])).searchParams.entries()].sort()).toEqual(expected.sort());
    }
  });
});

describe("PS-04 BDL runtime admission", () => {
  it("rejects invalid modes before credential or fetch access", async () => {
    for (const mode of ["typo", "", null, undefined, 0, {}, ["provider"]]) {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => response([]));
      const cred = { getValue: vi.fn(() => "invented-runtime-token") };
      const input = { sport: "nfl", season: 2027, mode, credential: cred, fetch } as unknown as Parameters<typeof fetchBdlPage>[0];
      await expect(fetchBdlPage(input)).rejects.toMatchObject({ failure: { code: "invalid_response" } });
      expect(fetch).not.toHaveBeenCalled(); expect(cred.getValue).not.toHaveBeenCalled();
    }
  });
  it("rejects inherited, unknown and non-string sports in both modes before credential/fetch", async () => {
    for (const mode of ["provider", "manual"] as const) {
      for (const sport of ["constructor", "__proto__", "toString", "cricket", null, ["nfl"]]) {
        const fetch = vi.fn<typeof globalThis.fetch>(async () => response([]));
        const cred = { getValue: vi.fn(() => "invented-runtime-token") };
        const input = { sport, season: 2027, mode, credential: cred, fetch } as unknown as Parameters<typeof fetchBdlPage>[0];
        await expect(fetchBdlPage(input)).rejects.toMatchObject({ failure: { code: "invalid_response" } });
        expect(fetch).not.toHaveBeenCalled(); expect(cred.getValue).not.toHaveBeenCalled();
      }
    }
  });
});

describe("BDL scalar schema controls", () => {
  it("rejects wrong primitive kinds and malformed overtime arrays", async () => {
    for (const fields of [
      { id: "17" }, { status: false }, { date: 20270101 }, { postseason: "false" },
      { home_team: { name: 42 } }, { home_team: { conference_id: "9" } },
      { home_ot_scores: [0, "2"] }, { away_ot_scores: [null] }, { home_ot_scores: [-1] },
    ]) {
      const sport = "home_ot_scores" in fields || "away_ot_scores" in fields || "conference_id" in (fields.home_team ?? {}) ? "ncaab" : "nfl";
      await expect(fetchBdlPage({ sport, season: 2027, mode: "provider", credential,
        fetch: async () => response([{ season: 2027, ...fields }]),
      })).rejects.toMatchObject({ failure: { code: "invalid_response" } });
    }
  });
  it("preserves typed overtime arrays, optional nulls and unknown text without inventing winners", async () => {
    const fields = { season: 2027, id: 84, status_state: "unknown", period: null,
      home_ot_scores: [0, 4], away_ot_scores: [], home_team: { id: 9, name: "Invented College", conference_id: null } };
    const result = await fetchBdlPage({ sport: "ncaab", season: 2027, mode: "provider", credential, fetch: async () => response([fields]) });
    expect(result.data).toEqual([fields]);
  });
});
