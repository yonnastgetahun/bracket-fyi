import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAdminClient } = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ getAdminClient }));

import { POST as broadcast } from "@/app/api/admin/broadcast/route";
import { PATCH as renameCompetitor } from "@/app/api/admin/competitor/route";
import {
  DELETE as removeParticipant,
  PATCH as renameParticipant,
} from "@/app/api/admin/participant/route";
import { POST as recordResult } from "@/app/api/admin/result/route";
import { POST as unlock } from "@/app/api/admin/unlock/route";

const LEAGUE_ID = "11111111-1111-4111-8111-111111111111";
const PARTICIPANT_ID = "22222222-2222-4222-8222-222222222222";
const MATCH_ID = "33333333-3333-4333-8333-333333333333";

function request(path: string, method: string, body: object) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function permissiveAdminClient() {
  const query: Record<string, unknown> & PromiseLike<unknown> = {
    select: vi.fn(() => query),
    update: vi.fn(() => query),
    delete: vi.fn(() => query),
    eq: vi.fn(() => query),
    upsert: vi.fn(async () => ({ error: null })),
    single: vi.fn(async () => ({
      data: {
        id: LEAGUE_ID,
        name: "Test League",
        template_id: "44444444-4444-4444-8444-444444444444",
        team_registry: [{ id: "seed-0", name: "Team One" }],
      },
      error: null,
    })),
    then: (resolve) => Promise.resolve({ data: null, error: null }).then(resolve),
  };

  return { from: vi.fn(() => query) };
}

const cases = [
  {
    name: "broadcast",
    call: () =>
      broadcast(
        request("/api/admin/broadcast", "POST", {
          leagueId: LEAGUE_ID,
          message: "Hello league",
        })
      ),
  },
  {
    name: "competitor rename",
    call: () =>
      renameCompetitor(
        request("/api/admin/competitor", "PATCH", {
          leagueId: LEAGUE_ID,
          teamId: "seed-0",
          newName: "Renamed Team",
        })
      ),
  },
  {
    name: "participant rename",
    call: () =>
      renameParticipant(
        request("/api/admin/participant", "PATCH", {
          leagueId: LEAGUE_ID,
          participantId: PARTICIPANT_ID,
          displayName: "Renamed Player",
        })
      ),
  },
  {
    name: "participant removal",
    call: () =>
      removeParticipant(
        request("/api/admin/participant", "DELETE", {
          leagueId: LEAGUE_ID,
          participantId: PARTICIPANT_ID,
        })
      ),
  },
  {
    name: "result override",
    call: () =>
      recordResult(
        request("/api/admin/result", "POST", {
          leagueId: LEAGUE_ID,
          templateMatchId: MATCH_ID,
          winnerTeamId: "seed-0",
        })
      ),
  },
  {
    name: "unlock",
    call: () =>
      unlock(request("/api/admin/unlock", "POST", { leagueId: LEAGUE_ID })),
  },
];

describe("admin mutation authorization", () => {
  beforeEach(() => {
    getAdminClient.mockReturnValue(permissiveAdminClient());
  });

  for (const route of cases) {
    it(`rejects unauthenticated ${route.name} before using the privileged client`, async () => {
      const response = await route.call();

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
      expect(getAdminClient).not.toHaveBeenCalled();
    });
  }
});
