import { fetchJsonBounded } from "@/lib/ingestion/providers/http";
import { ProviderAdapterError } from "@/lib/ingestion/errors";

export type BdlSport = "nfl" | "nba" | "mlb" | "ncaab" | "ncaaf";
export type BdlMode = "manual" | "provider";
export type BdlFetch = typeof fetch;
export type BdlCredential = { getValue(): string };
type FieldShape = string | { readonly [key: string]: readonly string[] };
export const BDL_SPORT_CONFIG = {
  nfl: { origin: "https://api.balldontlie.io", path: "/nfl/v1/games", fields: ["id", "date", "season", "week", "postseason", "status", "status_state", "updated_at", "home_team_score", "visitor_team_score", "home_team_ot", "visitor_team_ot", { home_team: ["id", "name", "full_name", "abbreviation", "conference", "division"] }, { visitor_team: ["id", "name", "full_name", "abbreviation", "conference", "division"] }] },
  nba: { origin: "https://api.balldontlie.io", path: "/v1/games", fields: ["id", "date", "datetime", "season", "status", "status_state", "period", "postseason", "postponed", "home_team_score", "visitor_team_score", { home_team: ["id", "name", "full_name", "abbreviation", "conference", "division"] }, { visitor_team: ["id", "name", "full_name", "abbreviation", "conference", "division"] }] },
  mlb: { origin: "https://api.balldontlie.io", path: "/mlb/v1/games", fields: ["id", "date", "season", "postseason", "season_type", "status", "status_state", "period", { home_team: ["id", "name", "display_name", "abbreviation", "league", "division"] }, { away_team: ["id", "name", "display_name", "abbreviation", "league", "division"] }, { home_team_data: ["runs"] }, { away_team_data: ["runs"] }] },
  ncaab: { origin: "https://api.balldontlie.io", path: "/ncaab/v1/games", fields: ["id", "date", "season", "status", "status_state", "period", "period_detail", "home_score", "away_score", "home_ot_scores", "away_ot_scores", { home_team: ["id", "name", "full_name", "abbreviation", "college", "conference_id"] }, { visitor_team: ["id", "name", "full_name", "abbreviation", "college", "conference_id"] }] },
  ncaaf: { origin: "https://api.balldontlie.io", path: "/ncaaf/v1/games", fields: ["id", "date", "season", "week", "status", "status_state", "period", "home_score", "away_score", "home_score_ot", "away_score_ot", { home_team: ["id", "name", "full_name", "abbreviation", "conference"] }, { visitor_team: ["id", "name", "full_name", "abbreviation", "conference"] }] },
} as const satisfies Record<BdlSport, { origin: string; path: string; fields: readonly FieldShape[] }>;

export interface BdlSafePage { sport: BdlSport; season: number; data: Record<string, unknown>[]; nextCursor?: number; perPage: number }
export interface FetchBdlPageInput { sport: BdlSport; season: number; mode: BdlMode; nbaPhase?: "playoffs" | "playin"; cursor?: number; credential?: BdlCredential; fetch?: BdlFetch; dateStart?: string; dateEnd?: string }
const fail = (message: string, code: "invalid_response" | "authentication" = "invalid_response") => new ProviderAdapterError({ code, retry: "never", message, details: {} });
const obj = (v: unknown): Record<string, unknown> | undefined => typeof v === "object" && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : undefined;

export async function fetchBdlPage(input: FetchBdlPageInput): Promise<BdlSafePage> {
  if (input.mode !== "manual" && input.mode !== "provider") throw fail("BALLDONTLIE mode is invalid");
  if (typeof input.sport !== "string" || !Object.hasOwn(BDL_SPORT_CONFIG, input.sport)) throw fail("BALLDONTLIE sport is invalid");
  if (input.mode === "manual") return { sport: input.sport, season: input.season, data: [], perPage: 0 };
  if (!Number.isInteger(input.season) || input.season < 1900 || input.season > 2200) throw fail("BALLDONTLIE sport or season is invalid");
  if (input.cursor !== undefined && (!Number.isSafeInteger(input.cursor) || input.cursor < 0)) throw fail("BALLDONTLIE cursor is invalid");
  if (input.sport === "nba" && !["playoffs", "playin"].includes(input.nbaPhase ?? "")) throw fail("NBA phase must be playoffs or playin");
  if (input.sport !== "nba" && input.nbaPhase !== undefined) throw fail("NBA phase is not valid for this sport");
  if (input.dateStart !== undefined && !validDate(input.dateStart) || input.dateEnd !== undefined && !validDate(input.dateEnd) || input.dateStart && input.dateEnd && input.dateStart > input.dateEnd) throw fail("BALLDONTLIE date range is invalid");
  const dateListOnly = input.sport === "nfl" || input.sport === "mlb";
  // These sports have no approved range filter. Only equal, explicit bounds
  // denote one day; never silently narrow an open/ranged request to endpoints.
  if (dateListOnly && (input.dateStart !== undefined || input.dateEnd !== undefined) && (input.dateStart === undefined || input.dateEnd === undefined || input.dateStart !== input.dateEnd)) throw fail("BALLDONTLIE sport requires equal explicit date bounds");
  if (!input.credential || !input.fetch) throw fail("BALLDONTLIE credential or fetch is unavailable", "authentication");
  let token: string;
  try { token = input.credential.getValue(); } catch { throw fail("BALLDONTLIE credential is unavailable", "authentication"); }
  if (!token || /[\r\n]/.test(token)) throw fail("BALLDONTLIE credential is invalid", "authentication");
  const config = BDL_SPORT_CONFIG[input.sport];
  const url = new URL(config.path, config.origin);
  url.searchParams.set("seasons[]", String(input.season));
  url.searchParams.set("per_page", "100");
  if (input.cursor !== undefined) url.searchParams.set("cursor", String(input.cursor));
  if (input.sport === "nfl") url.searchParams.set("season_types[]", "3");
  if (input.sport === "nba") url.searchParams.set("season_type", input.nbaPhase!);
  if (input.sport === "mlb") url.searchParams.set("season_type", "postseason");
  if (dateListOnly) {
    if (input.dateStart) url.searchParams.set("dates[]", input.dateStart);
  } else {
    if (input.dateStart) url.searchParams.set("start_date", input.dateStart);
    if (input.dateEnd) url.searchParams.set("end_date", input.dateEnd);
  }
  const { body } = await fetchJsonBounded(input.fetch, url, { method: "GET", headers: { Authorization: token, Accept: "application/json" } }, { timeoutMs: 25_000, maxBytes: 2 * 1024 * 1024 });
  const envelope = obj(body); const meta = obj(envelope?.meta);
  if (!Array.isArray(envelope?.data) || envelope.data.length > 100 || !meta || !Number.isInteger(meta.per_page) || Number(meta.per_page) < 0 || Number(meta.per_page) > 100) throw fail("BALLDONTLIE response envelope is invalid");
  const next = meta.next_cursor;
  if (next !== null && next !== undefined && (!Number.isSafeInteger(next) || Number(next) < 0 || input.cursor !== undefined && Number(next) <= input.cursor)) throw fail("BALLDONTLIE next cursor did not advance");
  const data = (envelope.data as unknown[]).map(row => projectRow(row, config.fields, input.season));
  return { sport: input.sport, season: input.season, data, perPage: Number(meta.per_page), ...(next === null || next === undefined ? {} : { nextCursor: Number(next) }) };
}
function projectRow(value: unknown, fields: readonly FieldShape[], season: number): Record<string, unknown> {
  const row = obj(value); if (!row || row.season !== season) throw fail("BALLDONTLIE row is malformed or has a different season");
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (typeof field === "string") {
      if (!Object.hasOwn(row, field)) continue;
      const v = row[field];
      validateLeaf(field, v);
      result[field] = v;
    } else for (const [key, nestedFields] of Object.entries(field)) {
      if (!Object.hasOwn(row, key) || row[key] === null) { if (Object.hasOwn(row, key)) result[key] = null; continue; }
      const nested = obj(row[key]); if (!nested) throw fail("BALLDONTLIE nested team field is malformed");
      const safe: Record<string, unknown> = {};
      for (const item of nestedFields as readonly string[]) if (Object.hasOwn(nested, item)) {
        validateLeaf(item, nested[item]);
        safe[item] = nested[item];
      }
      result[key] = safe;
    }
  }
  return result;
}
function validDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const timestamp = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === v;
}

// Every retained leaf has a schema, including nested team and score leaves.
// Null/missing optional evidence stays unknown; it is never coerced to zero.
function validateLeaf(field: string, value: unknown): void {
  if (value === null) return;
  const integer = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
  let valid: boolean;
  if (["home_ot_scores", "away_ot_scores"].includes(field)) valid = Array.isArray(value) && value.every(integer);
  else if (["id", "season", "week", "period", "conference_id", "home_team_score", "visitor_team_score", "home_score", "away_score", "home_score_ot", "away_score_ot", "home_team_ot", "visitor_team_ot", "runs"].includes(field)) valid = integer(value);
  else if (["postseason", "postponed"].includes(field)) valid = typeof value === "boolean";
  else if (["date", "datetime", "updated_at", "status", "status_state", "season_type", "period_detail", "name", "full_name", "display_name", "abbreviation", "conference", "division", "league", "college"].includes(field)) valid = typeof value === "string";
  else valid = false;
  if (!valid) throw fail("BALLDONTLIE safe field has an invalid type");
}
