import { beforeEach, describe, expect, it, vi } from "vitest";
const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient }));
import { getLeagueWithTemplate, getParticipants, getParticipantByMagicToken, getPickResults, getLeaderboard, getChampionStatus, getTemplateMatches } from "@/lib/league-data";

const L = "11111111-1111-4111-8111-111111111111";
const P = "22222222-2222-4222-8222-222222222222";
const secret = "SENTINEL_CREDENTIAL_NOT_FOR_CLIENT";
let selected: string[];
let filters: Array<[string, unknown]>;
function dbRow(row: unknown) {
  const chain = {
    select: vi.fn((fields: string) => { selected.push(fields); return chain; }),
    eq: vi.fn((key: string, value: unknown) => { filters.push([key, value]); return chain; }),
    order: vi.fn(() => chain),
    single: vi.fn(async () => ({ data: row, error: null })),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [row], error: null }).then(resolve),
  };
  getAdminClient.mockReturnValue({ from: vi.fn(() => chain) });
}
describe("credential-safe league read DTOs", () => {
  beforeEach(() => { selected = []; filters = []; });
  it("does not serialize organizer/join credentials or future unknown fields", async () => {
    dbRow({ id: L, name: "Friends", organizer_token: secret, join_token: secret,
      future_secret: secret, templates: { type: "bracket", topology: null } });
    const result = await getLeagueWithTemplate(L);
    expect(result?.id).toBe(L);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(selected.join()).not.toContain("*");
  });
  it("lists safe participant identities and preserves scoped own recovery", async () => {
    dbRow({ id: P, league_id: L, display_name: "Player", magic_token: secret, future_secret: secret });
    expect(JSON.stringify(await getParticipants(L))).not.toContain(secret);
    expect(JSON.stringify(await getParticipantByMagicToken(L, P))).not.toContain(secret);
    expect(filters).toContainEqual(["league_id", L]);
    expect(filters).toContainEqual(["magic_token", P]);
    expect(selected.join()).not.toContain("*");
  });
});

it("allowlists display rows even when a view gains new credential-bearing fields", async () => {
  selected = []; filters = [];
  dbRow({ league_id: L, participant_id: P, picked_team_id: "team-a", future_secret: secret });
  for (const read of [getPickResults, getLeaderboard, getChampionStatus, getTemplateMatches]) {
    expect(JSON.stringify(await read(L))).not.toContain(secret);
  }
  expect(selected.join()).not.toContain("*");
});
