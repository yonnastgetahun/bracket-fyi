import type { JsonObject } from "@/lib/ingestion/contracts";
import type { PullContext } from "@/lib/ingestion/providers/provider-adapter";
export type Family = "nba" | "mlb" | "ncaab" | "ncaaf";
export const families: Family[] = ["nba", "mlb", "ncaab", "ncaaf"];
export function config(sport: Family, phase = sport === "nba" ? "playoffs" : sport === "ncaab" ? "tournament" : sport === "ncaaf" ? "cfp" : "postseason"): JsonObject {
 return { mode: "provider", sport, phase, season: 2026, seasonStart: "2026-09-01", seasonEnd: "2027-08-01", eventEditionExternalId: "synthetic-family-edition", manifestVersion: 1,
 matchMappings: { "7701": { contestExternalId: "synthetic-family-game", contestKey: "family-game", name: "Synthetic game", stageExternalId: "synthetic-postseason", homeTeamId: "701", awayTeamId: "702", scheduledAt: "2027-01-20T18:00:00Z", membership: phase, week: 3 } },
 teamMappings: { "701": { eventEntryExternalId: "family-entry-home", competitorExternalId: "team-home", name: "Home" }, "702": { eventEntryExternalId: "family-entry-away", competitorExternalId: "team-away", name: "Away" } } };
}
export function request(sport: Family, overrides: Partial<PullContext> = {}): PullContext {
 return { bindingId: "b4400000-0000-4000-8000-000000000402", providerKey: "balldontlie", eventEditionId: "b4400000-0000-4000-8000-000000000003", bindingKey: "synthetic", adapterConfigVersion: 1, adapterConfig: config(sport), windowStart: "2027-01-20T00:00:00Z", windowEnd: "2027-01-20T23:59:59Z", requestedAt: "2027-01-20T20:00:00Z", credential: { reference: "synthetic://vertical", getValue: () => "SYNTHETIC-SECRET" }, ...overrides };
}
export function game(sport: Family, home = 24, away = 17, id = 7701): Record<string, unknown> {
 return { id, date: "2027-01-20", season: 2026, week: 3, postseason: true, season_type: "postseason", status: "Final", status_state: "completed", home_team: { id: 701 }, visitor_team: { id: 702 }, away_team: { id: 702 }, home_team_score: home, visitor_team_score: away, home_score: home, away_score: away, home_team_data: { runs: home }, away_team_data: { runs: away }, home_ot_scores: [4], away_ot_scores: [2], home_score_ot: 4, away_score_ot: 2, hidden: "RAW-SENTINEL" };
}
export const response = (row: Record<string, unknown>, status = 200) => new Response(status === 200 ? JSON.stringify({ data: [row], meta: { per_page: 100, next_cursor: null } }) : "SYNTHETIC-SECRET", { status });
