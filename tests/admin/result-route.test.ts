import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { organizerApiCookieName } from "@/lib/auth/organizer-cookie";

const { getAdminClient } = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ getAdminClient }));

import { POST } from "@/app/api/admin/result/route";

const LEAGUE_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZER_TOKEN = "22222222-2222-4222-8222-222222222222";
const MATCH_ID = "33333333-3333-4333-8333-333333333333";
const TEMPLATE_ID = "44444444-4444-4444-8444-444444444444";

let matchResult: { data: unknown; error: unknown };
let templateResult: { data: unknown; error: unknown };

function resultRequest() {
  return new NextRequest("http://localhost/api/admin/result", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${organizerApiCookieName(LEAGUE_ID)}=${ORGANIZER_TOKEN}`,
    },
    body: JSON.stringify({
      leagueId: LEAGUE_ID,
      templateMatchId: MATCH_ID,
      winnerTeamId: "seed-0",
    }),
  });
}

function selectChain(result: unknown) {
  const chain = {
    eq: vi.fn(() => chain),
    single: vi.fn(async () => result),
  };
  return { select: vi.fn(() => chain) };
}

describe("POST /api/admin/result", () => {
  beforeEach(() => {
    matchResult = { data: null, error: { code: "PGRST116" } };
    templateResult = {
      data: { team_registry: [{ id: "seed-1", name: "Team Two" }] },
      error: null,
    };
    const upsert = vi.fn(async () => ({ error: null }));
    getAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "leagues") {
          return selectChain({
            data: {
              id: LEAGUE_ID,
              template_id: TEMPLATE_ID,
              status: "locked",
              name: "Test League",
            },
            error: null,
          });
        }
        if (table === "template_matches") {
          return selectChain(matchResult);
        }
        if (table === "templates") {
          return selectChain(templateResult);
        }
        return { upsert };
      }),
    });
  });

  it("rejects a match that does not belong to the organizer's league template", async () => {
    const response = await POST(resultRequest());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Match not found in league template",
    });
  });

  it("rejects a winner that is not in the league template registry", async () => {
    matchResult = { data: { id: MATCH_ID }, error: null };

    const response = await POST(resultRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Winner not found in league template",
    });
  });

  it("records a valid override for the authenticated organizer", async () => {
    matchResult = { data: { id: MATCH_ID }, error: null };
    templateResult = {
      data: { team_registry: [{ id: "seed-0", name: "Team One" }] },
      error: null,
    };

    const response = await POST(resultRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
