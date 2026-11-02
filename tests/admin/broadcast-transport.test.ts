import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { authorizeOrganizer } = vi.hoisted(() => ({ authorizeOrganizer: vi.fn() }));
vi.mock("@/lib/auth/organizer", () => ({ authorizeOrganizer }));
import { POST } from "@/app/api/admin/broadcast/route";
const update = vi.fn();
beforeEach(() => {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { name: "Synthetic league" }, error: null }),
    update,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
  };
  update.mockReset().mockReturnValue(query);
  authorizeOrganizer.mockResolvedValue({ ok: true, supabase: { from: vi.fn(() => query) } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("BRACKET_LOCAL_EVENT_PREVIEW", "0");
  vi.stubEnv("BRACKET_NOTIFICATION_TRANSPORT", "fake");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function broadcast() {
  return POST(new NextRequest("http://localhost/api/admin/broadcast", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ leagueId: "synthetic-league", message: "Fixture announcement" }),
  }));
}
it("fake transport persists announcement without any edge-function fanout", async () => {
  expect((await broadcast()).status).toBe(200);
  expect(update).toHaveBeenCalledWith({ announcement_text: "Fixture announcement" });
  expect(fetch).not.toHaveBeenCalled();
});
it("local preview cannot enable fanout by selecting a different transport", async () => {
  vi.stubEnv("BRACKET_LOCAL_EVENT_PREVIEW", "1");
  vi.stubEnv("BRACKET_NOTIFICATION_TRANSPORT", "real");
  expect((await broadcast()).status).toBe(200);
  expect(fetch).not.toHaveBeenCalled();
});
it("defaults off even without local or fake flags", async () => {
  vi.stubEnv("BRACKET_NOTIFICATION_TRANSPORT", "");
  expect((await broadcast()).status).toBe(200);
  expect(fetch).not.toHaveBeenCalled();
});
it("does not write or send when organizer authorization fails", async () => {
  authorizeOrganizer.mockResolvedValue({ ok: false, response: new Response("Forbidden", { status: 403 }) });
  expect((await broadcast()).status).toBe(403);
  expect(update).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it("cannot enable real sends by environment configuration", async () => {
  vi.stubEnv("BRACKET_NOTIFICATION_TRANSPORT", "real");
  vi.stubEnv("BRACKET_REAL_SENDS_ENABLED", "1");
  expect((await broadcast()).status).toBe(200);
  expect(fetch).not.toHaveBeenCalled();
});
