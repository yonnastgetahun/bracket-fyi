import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { organizerApiCookieName } from "@/lib/auth/organizer-cookie";

const { getAdminClient } = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ getAdminClient }));

import { POST } from "@/app/api/admin/unlock/route";

const LEAGUE_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZER_TOKEN = "22222222-2222-4222-8222-222222222222";

function unlockRequest() {
  return new NextRequest("http://localhost/api/admin/unlock", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${organizerApiCookieName(LEAGUE_ID)}=${ORGANIZER_TOKEN}`,
    },
    body: JSON.stringify({ leagueId: LEAGUE_ID }),
  });
}

function adminClient(status: "active" | "locked" | "complete") {
  const update = vi.fn(() => ({
    eq: vi.fn(async () => ({ error: null })),
  }));
  const single = vi.fn(async () => ({
    data: {
      id: LEAGUE_ID,
      template_id: null,
      status,
      name: "Test League",
    },
    error: null,
  }));

  return {
    client: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ single })),
          })),
        })),
        update,
      })),
    },
    update,
  };
}

describe("POST /api/admin/unlock", () => {
  beforeEach(() => {
    getAdminClient.mockReturnValue(adminClient("locked").client);
  });

  it("rejects unlocking a league that is not locked", async () => {
    const { client, update } = adminClient("active");
    getAdminClient.mockReturnValue(client);

    const response = await POST(unlockRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Only a locked league can be unlocked",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("unlocks the league for its authenticated organizer", async () => {
    const { client, update } = adminClient("locked");
    getAdminClient.mockReturnValue(client);

    const response = await POST(unlockRequest());

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", locked_at: null })
    );
  });
});
