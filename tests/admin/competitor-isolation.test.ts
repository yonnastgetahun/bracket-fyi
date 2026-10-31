import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient }));
import { PATCH } from "@/app/api/admin/competitor/route";
import { getTeamRegistry } from "@/lib/league-data";
const A = "a3900000-0000-4000-8000-000000000001";
const B = "a3900000-0000-4000-8000-000000000002";
const TOKEN = "a3900000-0000-4000-8000-000000000003";
const TEMPLATE = "a3900000-0000-4000-8000-000000000004";
const registry = [{ id: "seed-0", name: "Original", aliases: ["Alias"], seed: 1 }, { id: "seed-1", name: "Other", aliases: [] }];
let names: Array<{ league_id: string; template_id: string; team_id: string; name: string }>;
let writeError = false;
let readError = false;
const writes = vi.fn();
function client() {
  return { from(table: string) {
    const filters: Record<string, unknown> = {};
    const result = () => {
      if (table === "leagues") return { data: filters.organizer_token && filters.organizer_token !== TOKEN ? null : { id: filters.id, template_id: TEMPLATE }, error: null };
      if (table === "templates") return { data: { team_registry: structuredClone(registry) }, error: null };
      return { data: names.filter(row => Object.entries(filters).every(([key, value]) => row[key as keyof typeof row] === value)), error: readError ? { message: "offline" } : null };
    };
    const q = {
      select: () => q,
      eq: (key: string, value: unknown) => { filters[key] = value; return q; },
      single: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      upsert: async (row: typeof names[number]) => {
        writes(table, row);
        if (writeError) return { error: { message: "internal secret" } };
        names = names.filter(n => !(n.league_id === row.league_id && n.template_id === row.template_id && n.team_id === row.team_id));
        names.push(row); return { error: null };
      },
      update: () => { throw new Error("Shared table mutation forbidden"); },
    };
    return q;
  }};
}
function rename(leagueId = A, teamId = "seed-0", newName = "Local A", token = TOKEN) {
  return PATCH(new NextRequest("http://localhost/api/admin/competitor", {
    method: "PATCH", headers: { "content-type": "application/json", cookie: "bfyi_organizer_" + leagueId + "=" + token },
    body: JSON.stringify({ leagueId, teamId, newName }),
  }));
}
beforeEach(() => { names = []; writeError = false; readError = false; writes.mockClear(); getAdminClient.mockReturnValue(client()); });
describe("league-local competitor display names", () => {
  it("renames A while B and the shared registry remain unchanged, preserving identity/metadata", async () => {
    expect((await rename()).status).toBe(200);
    expect(await getTeamRegistry(TEMPLATE, A)).toEqual([{ ...registry[0], name: "Local A" }, registry[1]]);
    expect(await getTeamRegistry(TEMPLATE, B)).toEqual(registry);
    expect(await getTeamRegistry(TEMPLATE)).toEqual(registry);
    expect(writes).toHaveBeenCalledWith("league_competitor_names", expect.objectContaining({ league_id: A }));
    await rename(B, "seed-0", "Local B");
    await rename(A, "seed-1", "Second A");
    expect((await getTeamRegistry(TEMPLATE, A)).map(t => t.name)).toEqual(["Local A", "Second A"]);
    expect((await getTeamRegistry(TEMPLATE, B)).map(t => t.name)).toEqual(["Local B", "Other"]);
  });
  it("returns the persisted normalized name", async () => {
    const res = await rename(A, "seed-0", "  " + "x".repeat(70) + "  ");
    expect(await res.json()).toEqual({ success: true, name: "x".repeat(60) });
  });
  it("rejects unknown competitors without writing", async () => {
    expect((await rename(A, "absent")).status).toBe(404);
    expect(writes).not.toHaveBeenCalled();
  });
  it("rejects invalid credentials without writing", async () => {
    expect((await rename(A, "seed-0", "Bad", B)).status).toBe(403);
    expect(writes).not.toHaveBeenCalled();
  });
  it("reports persistence failure without exposing database internals", async () => {
    writeError = true;
    const res = await rename();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("internal secret");
    expect(names).toEqual([]);
  });
  it("does not silently revert to template names on override read failure", async () => {
    readError = true;
    await expect(getTeamRegistry(TEMPLATE, A)).rejects.toThrow("Could not load");
  });
});
