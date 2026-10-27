import { beforeEach, describe, expect, it, vi } from "vitest";
const { getAdminClient, cookieValues } = vi.hoisted(() => ({
  getAdminClient: vi.fn(), cookieValues: new Map<string, string>(),
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => {
  const value = cookieValues.get(key); return value ? { value } : undefined;
} }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/AdminConsole", () => ({ AdminConsole: () => null }));
vi.mock("@/components/LeaderboardLive", () => ({ default: () => null }));
vi.mock("@/components/CompareLive", () => ({ default: () => null }));
vi.mock("@/components/MatchesLive", () => ({ default: () => null }));
vi.mock("@/components/BracketLive", () => ({ default: () => null }));
vi.mock("@/components/PickEmBracket", () => ({ default: () => null }));
vi.mock("@/components/PickEntry", () => ({ default: () => null }));
vi.mock("@/components/PickEmEntry", () => ({ default: () => null }));
vi.mock("@/components/JoinPrompt", () => ({ default: () => null }));
vi.mock("@/components/LockedState", () => ({ default: () => null }));
import { NextRequest } from "next/server";
import { organizerApiCookieName } from "@/lib/auth/organizer-cookie";
import * as participantRoute from "@/app/api/admin/participant/route";
import AdminPage from "@/app/l/[league_id]/admin/page";
import LeaguePage from "@/app/l/[league_id]/page";
import ComparePage from "@/app/l/[league_id]/compare/page";
import MatchesPage from "@/app/l/[league_id]/matches/page";
import BracketPage from "@/app/l/[league_id]/p/[magic_token]/page";

const L = "11111111-1111-4111-8111-111111111111";
const T = "22222222-2222-4222-8222-222222222222";
const P = "33333333-3333-4333-8333-333333333333";
const M = "44444444-4444-4444-8444-444444444444";
const INVALID = "55555555-5555-4555-8555-555555555555";
let locked = false;
let queried: string[];
const props = () => ({ params: Promise.resolve({ league_id: L }) });
beforeEach(() => {
  locked = false; queried = []; cookieValues.clear();
  getAdminClient.mockReturnValue({ from: (table: string) => {
    queried.push(table);
    const filters: Array<[string, unknown]> = [];
    function rows() {
      const records: Record<string, unknown>[] = table === "leagues" ? [{
        id: L, name: "Friends", template_id: null, status: locked ? "locked" : "active",
        locked_at: locked ? "2020-01-01" : null, organizer_token: T, join_token: T,
      }] : table === "participants" ? [
        { id: P, league_id: L, display_name: "Player", magic_token: M },
      ] : [{ league_id: L, participant_id: P, picked_team_id: "PRIVATE_PICK" }];
      return records.filter(row => filters.every(([key, value]) => row[key] === value));
    }
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
      order: () => chain,
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), count: 1, error: null }).then(resolve),
    };
    return chain;
  } });
});
describe("page read authorization", () => {
  it.each([undefined, L + ":forged", L + ":" + INVALID, INVALID + ":" + T])(
    "denies invalid/stale/cross-league organizer credential %s before privileged selections",
    async (cookie) => {
      if (cookie) cookieValues.set("bfyi_organizer", cookie);
      await expect(AdminPage(props())).rejects.toThrow("NOT_FOUND");
      expect(queried).not.toContain("participants");
      expect(queried).not.toContain("picks");
    },
  );
});

it("renders authorized organizer controls without bulk participant recovery credentials", async () => {
  cookieValues.set("bfyi_organizer", L + ":" + T);
  const page = await AdminPage(props());
  expect(page.props.participants).toHaveLength(1);
  expect(JSON.stringify(page.props)).not.toContain(M);
  expect(JSON.stringify(page.props)).not.toContain(T);
});

describe("explicit organizer recovery", () => {
  function request(token?: string, participantId = P) {
    return new NextRequest("http://localhost/api/admin/participant", {
      method: "POST",
      headers: { "content-type": "application/json",
        ...(token ? { cookie: organizerApiCookieName(L) + "=" + token } : {}) },
      body: JSON.stringify({ leagueId: L, participantId }),
    });
  }
  it("returns only the requested recovery path after scoped organizer validation", async () => {
    const response = await participantRoute.POST(request(T));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recoveryPath: "/l/" + L + "/p/" + M });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each([undefined, INVALID])("denies missing/revoked organizer %s without reading participants", async token => {
    const response = await participantRoute.POST(request(token));
    expect(response.status).toBe(403);
    expect(queried).not.toContain("participants");
  });
  it("does not recover a participant outside this league", async () => {
    expect((await participantRoute.POST(request(T, INVALID))).status).toBe(404);
  });
});

describe("pre-lock privacy", () => {
  it.each([undefined, L + ":forged", L + ":" + INVALID, INVALID + ":" + M])(
    "does not expose other picks for participant cookie %s", async cookie => {
      if (cookie) cookieValues.set("bfyi_participant", cookie);
      const page = await LeaguePage(props());
      expect(JSON.stringify(page.props)).not.toContain("PRIVATE_PICK");
      expect(queried).not.toContain("v_pick_results");
    },
  );
  it.each([undefined, L + ":forged", L + ":" + INVALID, INVALID + ":" + T])(
    "does not grant pick entry for invitation cookie %s", async cookie => {
      if (cookie) cookieValues.set("bfyi_league", cookie);
      const page = await LeaguePage(props());
      expect(page.props).toEqual({ leagueName: "Friends" });
    },
  );
  it("allows a validated invitation to enter picks", async () => {
    cookieValues.set("bfyi_league", L + ":" + T);
    const page = await LeaguePage(props());
    expect(page.props.league.id).toBe(L);
    expect(JSON.stringify(page.props)).not.toContain(T);
  });
  it("shows a validated returning participant only their own picks", async () => {
    cookieValues.set("bfyi_participant", L + ":" + M);
    const page = await LeaguePage(props());
    expect(page.props.participant.id).toBe(P);
    expect(page.props.initialPicks).toHaveLength(1);
    expect(queried).not.toContain("v_leaderboard");
    expect(JSON.stringify(page.props)).not.toContain(M);
  });
  it("never selects comparison picks before lock", async () => {
    const page = await ComparePage(props());
    expect(page.props).toEqual({ leagueName: "Friends" });
    expect(queried).not.toContain("v_pick_results");
    expect(queried).not.toContain("participants");
  });
  it("gives anonymous pre-lock match visitors the join prompt only", async () => {
    const page = await MatchesPage(props());
    expect(page.props).toEqual({ leagueName: "Friends" });
  });
});
describe("preserved public and own recovery journeys", () => {
  it("keeps public leaderboard and comparison readable after lock with safe DTOs", async () => {
    locked = true;
    const leaderboard = await LeaguePage(props());
    const comparison = await ComparePage(props());
    expect(leaderboard.props.initialRows).toHaveLength(1);
    expect(comparison.props.initialParticipants).toHaveLength(1);
    expect(JSON.stringify([leaderboard.props, comparison.props])).not.toContain(M);
    expect(JSON.stringify([leaderboard.props, comparison.props])).not.toContain(T);
  });
  it("keeps exact own magic-link recovery scoped and credential-free", async () => {
    const page = await BracketPage({ params: Promise.resolve({ league_id: L, magic_token: M }) });
    expect(page.props.participant.id).toBe(P);
    expect(JSON.stringify(page.props)).not.toContain(M);
  });
  it("rejects revoked own recovery before picks are selected", async () => {
    await expect(BracketPage({ params: Promise.resolve({ league_id: L, magic_token: INVALID }) })).rejects.toThrow("NOT_FOUND");
    expect(queried).not.toContain("v_pick_results");
  });
});

describe("cookie-scoped live read route", () => {
  async function read(query = "", cookie?: string) {
    const { GET } = await import("@/app/l/[league_id]/data/route");
    return GET(new NextRequest("http://localhost/l/" + L + "/data" + query, {
      headers: cookie ? { cookie } : {},
    }), props());
  }
  it("denies unauthenticated pre-lock reads before private selection", async () => {
    const response = await read();
    expect(response.status).toBe(403);
    expect(queried).not.toContain("v_pick_results");
  });
  it("refreshes only the exact authenticated participant pre-lock", async () => {
    const response = await read("?participantId=" + P, "bfyi_participant=" + L + ":" + M);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.picks).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain(M);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(queried).not.toContain("v_leaderboard");
  });
  it("denies attempts to refresh another participant pre-lock", async () => {
    expect((await read("?participantId=" + INVALID, "bfyi_participant=" + L + ":" + M)).status).toBe(403);
    expect(queried).not.toContain("v_pick_results");
  });
  it("preserves public post-lock live results", async () => {
    locked = true;
    const response = await read();
    expect(response.status).toBe(200);
    expect((await response.json()).rows).toHaveLength(1);
  });
});

it.each([L + ":" + INVALID, INVALID + ":" + M, L + ":" + M + ":extra"])(
  "live route rejects stale, cross-league, and malformed participant cookies %s", async cookie => {
    const { GET } = await import("@/app/l/[league_id]/data/route");
    const response = await GET(new NextRequest(
      "http://localhost/l/" + L + "/data?participantId=" + P,
      { headers: { cookie: "bfyi_participant=" + cookie, "x-magic-token": M } },
    ), props());
    expect(response.status).toBe(403);
    expect(queried).not.toContain("v_pick_results");
  },
);

it.each([undefined, "bfyi_league=" + L + ":" + INVALID])(
  "denies unauthenticated/stale pre-lock match refresh %s", async cookie => {
    const { GET } = await import("@/app/l/[league_id]/data/route");
    const response = await GET(new NextRequest("http://localhost/l/" + L + "/data?view=results", {
      headers: cookie ? { cookie } : {},
    }), props());
    expect(response.status).toBe(403);
    expect(queried).not.toContain("effective_results");
  },
);
it("permits invited pre-lock match refresh without disclosing picks", async () => {
  const { GET } = await import("@/app/l/[league_id]/data/route");
  const response = await GET(new NextRequest("http://localhost/l/" + L + "/data?view=results", {
    headers: { cookie: "bfyi_league=" + L + ":" + T },
  }), props());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ results: [] });
  expect(queried).not.toContain("v_pick_results");
});
