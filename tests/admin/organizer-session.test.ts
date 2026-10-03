import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { organizerApiCookieName } from "@/lib/auth/organizer-cookie";

const { createClient, single } = vi.hoisted(() => ({
  createClient: vi.fn(),
  single: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { proxy } from "@/proxy";

const LEAGUE_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZER_TOKEN = "22222222-2222-4222-8222-222222222222";

describe("organizer session", () => {
  beforeEach(() => {
    single.mockResolvedValue({ data: { id: LEAGUE_ID }, error: null });
    createClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ single })),
          })),
        })),
      })),
    });
  });

  it("creates an HTTP-only API credential after validating the organizer link", async () => {
    const request = new NextRequest(
      `http://localhost/l/${LEAGUE_ID}/admin?token=${ORGANIZER_TOKEN}`
    );

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `http://localhost/l/${LEAGUE_ID}/admin`
    );
    expect(
      response.cookies.get(organizerApiCookieName(LEAGUE_ID))?.value
    ).toBe(ORGANIZER_TOKEN);

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/api/admin");
    expect(setCookie.toLowerCase()).toContain("samesite=strict");
  });
});
