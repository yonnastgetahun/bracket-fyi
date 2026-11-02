import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { organizerApiCookieName } from "@/lib/auth/organizer-cookie";

const { getAdminClient } = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ getAdminClient }));

import { POST } from "@/app/api/admin/lock/route";

const LEAGUE_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZER_TOKEN = "22222222-2222-4222-8222-222222222222";

function lockRequest(token?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) {
    headers.set("cookie", `${organizerApiCookieName(LEAGUE_ID)}=${token}`);
  }

  return new NextRequest("http://localhost/api/admin/lock", {
    method: "POST",
    headers,
    body: JSON.stringify({ leagueId: LEAGUE_ID }),
  });
}

function malformedRequest() {
  return new NextRequest("http://localhost/api/admin/lock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
}

function oversizedRequest() {
  return new NextRequest("http://localhost/api/admin/lock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ leagueId: LEAGUE_ID, padding: "x".repeat(17_000) }),
  });
}

function adminClient(
  authorized: boolean,
  status: "active" | "locked" | "complete" = "active"
) {
  const update = vi.fn(() => ({
    eq: vi.fn(async () => ({ error: null })),
  }));
  const single = vi.fn(async () =>
    authorized
      ? {
          data: {
            id: LEAGUE_ID,
            template_id: null,
            status,
            name: "Test League",
          },
          error: null,
        }
      : { data: null, error: { code: "PGRST116" } }
  );

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

describe("POST /api/admin/lock", () => {
  beforeEach(() => {
    getAdminClient.mockReturnValue(adminClient(true).client);
  });

  it("rejects a request without organizer credentials before using the privileged client", async () => {
    const response = await POST(lockRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(getAdminClient).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without using the privileged client", async () => {
    const response = await POST(malformedRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON" });
    expect(getAdminClient).not.toHaveBeenCalled();
  });

  it("rejects an oversized body without using the privileged client", async () => {
    const response = await POST(oversizedRequest());

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Request body too large",
    });
    expect(getAdminClient).not.toHaveBeenCalled();
  });

  it("rejects organizer credentials that do not belong to the requested league", async () => {
    const { client, update } = adminClient(false);
    getAdminClient.mockReturnValue(client);

    const response = await POST(lockRequest(ORGANIZER_TOKEN));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(update).not.toHaveBeenCalled();
  });

  it("locks the league for its authenticated organizer", async () => {
    const { client, update } = adminClient(true);
    getAdminClient.mockReturnValue(client);

    const response = await POST(lockRequest(ORGANIZER_TOKEN));

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "locked" })
    );
  });

  it("rejects locking a league that is not active", async () => {
    const { client, update } = adminClient(true, "locked");
    getAdminClient.mockReturnValue(client);

    const response = await POST(lockRequest(ORGANIZER_TOKEN));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Only an active league can be locked",
    });
    expect(update).not.toHaveBeenCalled();
  });
});
