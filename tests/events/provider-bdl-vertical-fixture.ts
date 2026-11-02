import type { JsonObject } from "@/lib/ingestion/contracts";
import type { PullContext } from "@/lib/ingestion/providers/provider-adapter";

export const bdlIds = { binding: "b4400000-0000-4000-8000-000000000402", provider: "b4400000-0000-4000-8000-000000000401", edition: "b4400000-0000-4000-8000-000000000003", stage: "b4400000-0000-4000-8000-000000000009", contest: "b4400000-0000-4000-8000-000000000004", home: "b4400000-0000-4000-8000-000000000007", away: "b4400000-0000-4000-8000-000000000008" } as const;
export const secret = "SYNTHETIC-BDL-CREDENTIAL-DO-NOT-PERSIST";
export const raw = "SYNTHETIC-BDL-UNKNOWN-FIELD-DO-NOT-PERSIST";
export const config: JsonObject = {
  mode: "provider", sport: "nfl", season: 2026, seasonStart: "2026-09-01", seasonEnd: "2027-02-28", eventEditionExternalId: "synthetic-nfl-edition",
  stageExternalId: "synthetic-postseason", stageName: "Synthetic postseason", matchMappings: { "7701": { contestExternalId: "synthetic-nfl-game", contestKey: "nfl-game", name: "Synthetic South at North", stageExternalId: "synthetic-postseason", homeTeamId: "701", awayTeamId: "702", week: 3, scheduledAt: "2027-01-20T18:00:00Z" } },
  teamMappings: { "701": { eventEntryExternalId: "nfl-entry-home", competitorExternalId: "nfl-team-home", name: "Synthetic North" }, "702": { eventEntryExternalId: "nfl-entry-away", competitorExternalId: "nfl-team-away", name: "Synthetic South" } },
};
export const request = (overrides: Partial<PullContext> = {}): PullContext => ({ bindingId: bdlIds.binding, providerKey: "balldontlie", eventEditionId: bdlIds.edition, bindingKey: "synthetic", adapterConfigVersion: 1, adapterConfig: config, windowStart: "2027-01-20T00:00:00Z", windowEnd: "2027-01-20T23:59:59Z", requestedAt: "2027-01-20T20:00:00Z", credential: { reference: "synthetic://bdl", getValue: () => secret }, ...overrides });
export const game = (home = 24, away = 17, id = 7701): Record<string, unknown> => ({ id, date: "2027-01-20", season: 2026, week: 3, postseason: true, status: "Final", status_state: "completed", updated_at: "2027-01-20T20:00:00Z", home_team_score: home, visitor_team_score: away, home_team_ot: 0, visitor_team_ot: 0, home_team: { id: 701, name: "Synthetic North", full_name: "Synthetic North", abbreviation: "SYN", conference: "AFC", division: "North", logo: raw }, visitor_team: { id: 702, name: "Synthetic South", full_name: "Synthetic South", abbreviation: "SYT", conference: "NFC", division: "South" }, hidden: raw });
export const response = (body: Record<string, unknown>, status = 200) => new Response(status === 200 ? JSON.stringify({ data: [body], meta: { next_cursor: null, per_page: 100 } }) : secret, { status });

export const expectedNflBoard = [{ id: "b4400000-0000-4000-8000-000000000101", earned: 1, maximum: 1, wrong: 0, pending: 0, rank: 1 }, { id: "b4400000-0000-4000-8000-000000000102", earned: 0, maximum: 0, wrong: 1, pending: 0, rank: 2 }];
