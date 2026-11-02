import {
  providerBatchSchema,
  isoDateTimeSchema,
  type JsonObject,
  type NormalizedObservation,
  type ProviderBatch,
} from "@/lib/ingestion/contracts";
import { ProviderAdapterError, isProviderAdapterError, type ProviderFailure } from "@/lib/ingestion/errors";
import type { ProviderAdapter, PullContext } from "@/lib/ingestion/providers/provider-adapter";
import { fetchJsonBounded } from "@/lib/ingestion/providers/http";

export type FootballDataFetch = typeof fetch;
const ORIGIN = "https://api.football-data.org";
const PATH = "/v4/competitions/CL/matches";
const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
const STAGE_KEYS = new Set(["LEAGUE_STAGE", "PLAYOFFS", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "FINAL"]);
const STATUS_MAP: Record<string, string> = { TIMED: "scheduled", SCHEDULED: "scheduled", IN_PLAY: "live", PAUSED: "suspended", SUSPENDED: "suspended", POSTPONED: "postponed", CANCELED: "canceled", AWARDED: "final", FINISHED: "final" };

interface Config {
  mode: "manual" | "provider";
  season: number;
  providerCompetitionId: string;
  providerSeasonId: string;
  seasonStart: string;
  seasonEnd: string;
  competitionExternalId: string;
  eventEditionExternalId: string;
  stageMappings: Record<string, { externalId: string; name: string; kind: "league" | "knockout"; ordinal: number }>;
  matchMappings: Record<string, { contestExternalId: string; contestKey: string; name: string }>;
  teamMappings: Record<string, { eventEntryExternalId: string; competitorExternalId: string; name: string }>;
  stage?: string;
  status?: string;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function requiredText(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function safeConfig(raw: JsonObject): Config {
  const c = object(raw);
  if (c?.mode === "manual") return { mode: "manual" } as Config;
  if (!c || c.mode !== "provider" || !Number.isInteger(c.season) || typeof c.season !== "number" || c.season < 1900 || c.season > 2200 || typeof c.seasonStart !== "string" || typeof c.seasonEnd !== "string") throw invalid("Provider configuration is invalid");
  if (!dateOnly(c.seasonStart) || !dateOnly(c.seasonEnd) || c.seasonEnd < c.seasonStart || Number(c.seasonStart.slice(0, 4)) !== c.season) throw invalid("Provider season bounds are invalid");
  if (!providerId(c.providerCompetitionId) || !providerId(c.providerSeasonId)) throw invalid("Reviewed provider competition and season IDs are required");
  const stages = object(c.stageMappings); const teams = object(c.teamMappings); const matches = object(c.matchMappings);
  if (!stages || !teams || !matches || !requiredText(c.competitionExternalId) || !requiredText(c.eventEditionExternalId)) throw invalid("Reviewed provider ID mappings are required");
  const stageMappings: Config["stageMappings"] = Object.create(null);
  for (const [providerStage, value] of Object.entries(stages)) {
    const v = object(value);
    if (!STAGE_KEYS.has(providerStage) || !v || !requiredText(v.externalId) || !requiredText(v.name) || !["league", "knockout"].includes(String(v.kind)) || !Number.isInteger(v.ordinal) || Number(v.ordinal) < 1) throw invalid("Reviewed stage mapping is invalid");
    stageMappings[providerStage] = { externalId: String(v.externalId), name: String(v.name), kind: v.kind as "league" | "knockout", ordinal: Number(v.ordinal) };
  }
  const matchMappings: Config["matchMappings"] = Object.create(null);
  for (const [providerId, value] of Object.entries(matches)) {
    const v = object(value);
    if (!/^\d+$/.test(providerId) || !v || !requiredText(v.contestExternalId) || !requiredText(v.contestKey) || !requiredText(v.name) || !/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(String(v.contestKey))) throw invalid("Reviewed match ID mapping is invalid");
    if (Object.values(matchMappings).some(m => m.contestExternalId === v.contestExternalId || m.contestKey === v.contestKey)) throw invalid("Reviewed match identities must be unique");
    matchMappings[providerId] = { contestExternalId: String(v.contestExternalId), contestKey: String(v.contestKey), name: String(v.name) };
  }
  const teamMappings: Config["teamMappings"] = Object.create(null);
  for (const [providerId, value] of Object.entries(teams)) {
    const v = object(value);
    if (!/^\d+$/.test(providerId) || !v || !requiredText(v.eventEntryExternalId) || !requiredText(v.competitorExternalId) || !requiredText(v.name)) throw invalid("Reviewed team ID mapping is invalid");
    teamMappings[providerId] = { eventEntryExternalId: String(v.eventEntryExternalId), competitorExternalId: String(v.competitorExternalId), name: String(v.name) };
  }
  const stage = c.stage === undefined ? undefined : String(c.stage);
  const status = c.status === undefined ? undefined : String(c.status);
  if (stage && !STAGE_KEYS.has(stage)) throw invalid("Provider stage filter is not allowlisted");
  if (status && !Object.hasOwn(STATUS_MAP, status)) throw invalid("Provider status filter is not allowlisted");
  return { mode: "provider", season: c.season, providerCompetitionId: providerId(c.providerCompetitionId)!, providerSeasonId: providerId(c.providerSeasonId)!, seasonStart: c.seasonStart, seasonEnd: c.seasonEnd, competitionExternalId: String(c.competitionExternalId), eventEditionExternalId: String(c.eventEditionExternalId), stageMappings, matchMappings, teamMappings, ...(stage ? { stage } : {}), ...(status ? { status } : {}) };
}

export class FootballDataAdapter implements ProviderAdapter {
  readonly key = "football-data";
  readonly capabilities = new Set(["schedule", "live_status", "final_results"] as const);
  private readonly fetchImpl: FootballDataFetch;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(dependencies: { fetch: FootballDataFetch; timeoutMs?: number; maxResponseBytes?: number }) {
    this.fetchImpl = dependencies.fetch;
    this.timeoutMs = Math.min(TIMEOUT_MS, dependencies.timeoutMs ?? TIMEOUT_MS);
    this.maxResponseBytes = Math.min(MAX_RESPONSE_BYTES, dependencies.maxResponseBytes ?? MAX_RESPONSE_BYTES);
    if (!Number.isFinite(this.timeoutMs) || !Number.isFinite(this.maxResponseBytes) || this.timeoutMs < 1 || this.maxResponseBytes < 1) throw new Error("Invalid bounded transport limits");
  }

  classifyError(error: unknown): ProviderFailure {
    if (isProviderAdapterError(error)) return error.failure;
    return { code: "permanent", retry: "never", message: "Football-data pull failed", details: {} };
  }

  async pull(context: PullContext): Promise<ProviderBatch> {
    const config = safeConfig(context.adapterConfig);
    const receivedAt = context.requestedAt;
    if (config.mode === "manual") return providerBatchSchema.parse({ observations: [], fetchedCount: 0, receivedAt });
    if (!validDate(context.windowStart) || !validDate(context.windowEnd)) throw invalid("Requested UTC date window is invalid");
    const start = Math.max(Date.parse(context.windowStart), Date.parse(config.seasonStart));
    const end = Math.min(Date.parse(context.windowEnd), Date.parse(config.seasonEnd) + 86_400_000 - 1);
    if (end < start || end - start > MAX_WINDOW_MS) throw invalid("Requested UTC date window is outside the configured season or exceeds 31 days");
    const url = new URL(PATH, ORIGIN);
    url.searchParams.set("season", String(config.season));
    url.searchParams.set("dateFrom", new Date(start).toISOString().slice(0, 10));
    url.searchParams.set("dateTo", new Date(end).toISOString().slice(0, 10));
    if (config.stage) url.searchParams.set("stage", config.stage);
    if (config.status) url.searchParams.set("status", config.status);
    let token: string;
    try { token = context.credential.getValue(); } catch { throw new ProviderAdapterError({ code: "authentication", retry: "never", message: "Provider credential is unavailable", details: {} }); }
    if (!token || /[\r\n]/.test(token)) throw new ProviderAdapterError({ code: "authentication", retry: "never", message: "Provider credential is invalid", details: {} });
    const { body } = await fetchJsonBounded(this.fetchImpl, url, { method: "GET", headers: { "X-Auth-Token": token, Accept: "application/json" } }, { timeoutMs: this.timeoutMs, maxBytes: this.maxResponseBytes });
    const envelope = object(body);
    const matchRows = envelope?.matches;
    if (!Array.isArray(matchRows) || matchRows.some((row) => !object(row))) throw new ProviderAdapterError({ code: "unsupported_shape", retry: "never", message: "Football-data response shape is unsupported", details: {} });
    if (!competitionMatches(envelope?.competition, config)) throw reviewError("competition_mismatch");
    const observations: NormalizedObservation[] = [];
    for (const [rowIndex, row] of matchRows.entries()) {
      try {
        observations.push(...normalizeMatch(row, config, context.requestedAt, start, end));
      } catch (error) {
        // Atomic rejection: no successfully normalized prefix can be dispatched.
        if (isProviderAdapterError(error)) throw new ProviderAdapterError({
          ...error.failure, details: { ...error.failure.details, rowIndex, fetchedCount: matchRows.length },
        });
        throw error;
      }
    }
    return providerBatchSchema.parse({ observations, fetchedCount: matchRows.length, receivedAt });
  }
}

function normalizeMatch(value: unknown, config: Config, observedAt: string, start: number, end: number): NormalizedObservation[] {
  const m = object(value)!;
  const fail = (reason: ReviewReason): never => { throw reviewError(reason, m); };
  const id = providerId(m.id);
  if (!id) return fail("invalid_match_id");
  if (!competitionMatches(m.competition, config)) return fail("competition_mismatch");
  const season = object(m.season);
  if (!season || providerId(season.id) !== config.providerSeasonId ||
      season.startDate !== config.seasonStart || season.endDate !== config.seasonEnd) return fail("season_mismatch");
  const scheduledAt = validDate(m.utcDate);
  if (!scheduledAt || Date.parse(scheduledAt) < start || Date.parse(scheduledAt) > end) return fail("outside_window");

  const stageKey = requiredText(m.stage);
  const stage = stageKey && STAGE_KEYS.has(stageKey) ? config.stageMappings[stageKey] : undefined;
  if (!stage) return fail("unknown_stage");
  if (config.stage && config.stage !== stageKey) return fail("filter_mismatch");
  const matchMapping = config.matchMappings[id];
  if (!matchMapping) return fail("unmapped_match");
  const homeId = providerId(object(m.homeTeam)?.id);
  const awayId = providerId(object(m.awayTeam)?.id);
  const home = homeId ? config.teamMappings[homeId] : undefined;
  const away = awayId ? config.teamMappings[awayId] : undefined;
  if (!home || !away) return fail("unmapped_team");
  if (home.eventEntryExternalId === away.eventEntryExternalId || home.competitorExternalId === away.competitorExternalId) return fail("conflicting_entries");

  const statusText = requiredText(m.status);
  if (!statusText || !Object.hasOwn(STATUS_MAP, statusText)) return fail("unknown_status");
  if (config.status && config.status !== statusText) return fail("filter_mismatch");
  // Awarded outcomes require an independently reviewed awarding authority.
  if (statusText === "AWARDED") return fail("unsupported_award");
  const score = object(m.score);
  const duration = requiredText(score?.duration);
  if (duration && !["REGULAR", "EXTRA_TIME", "PENALTY_SHOOTOUT"].includes(duration)) return fail("unknown_duration");
  const regulation = duration === "REGULAR" ? integerPair(score?.fullTime) : integerPair(score?.regularTime);
  const fullTime = integerPair(score?.fullTime);
  const penalties = integerPair(score?.penalties);
  const declaredWinner = requiredText(score?.winner);
  const finished = statusText === "FINISHED";
  const isFinal = stageKey === "FINAL";
  let settledPair = regulation;
  let outcome: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | undefined;
  if (finished) {
    if (!duration) return fail("unknown_duration");
    if (!regulation) return fail("missing_score");
    if (duration === "REGULAR") {
      outcome = pairWinner(regulation);
      if (declaredWinner !== outcome) return fail("score_conflict");
    } else {
      if (!fullTime) return fail("missing_score");
      if (fullTime.home < regulation.home || fullTime.away < regulation.away) return fail("score_conflict");
      const decider = duration === "PENALTY_SHOOTOUT" ? penalties : fullTime;
      if (!decider) return fail("missing_score");
      const deciderWinner = pairWinner(decider);
      if (declaredWinner !== deciderWinner || (duration === "PENALTY_SHOOTOUT" && deciderWinner === "DRAW")) return fail("score_conflict");
      outcome = isFinal ? deciderWinner : pairWinner(regulation);
      if (isFinal) {
        // A single-match final cannot need extra time without a regulation draw,
        // or penalties without a tied post-extra-time score.
        if (regulation.home !== regulation.away ||
            (duration === "PENALTY_SHOOTOUT" && fullTime.home !== fullTime.away)) return fail("score_conflict");
        settledPair = fullTime;
      }
    }
    if (isFinal && outcome === "DRAW") return fail("score_conflict");
  }
  const lastUpdated = validDate(m.lastUpdated);
  const resultData: JsonObject = {
    duration: duration ?? "unknown",
    ...(declaredWinner && ["HOME_TEAM", "AWAY_TEAM", "DRAW"].includes(declaredWinner) ? { declaredWinner } : {}),
    ...(isFinal ? { settlementScope: "inclusive_final" } : { settlementScope: "regulation" }),
    ...(penalties ? { penalties } : {}),
  };
  // Provenance only. lastUpdated has no trusted revision/causal-order contract:
  // deliberately do not populate providerUpdatedAt/providerEffectiveAt/correctionReason.
  const sanitizedPayload: JsonObject = {
    id, competitionId: config.providerCompetitionId, competitionCode: "CL",
    seasonId: config.providerSeasonId, seasonStart: config.seasonStart, seasonEnd: config.seasonEnd,
    status: statusText, stage: stageKey!, utcDate: scheduledAt, homeTeamId: homeId!, awayTeamId: awayId!,
    ...(regulation ? { regulationHome: regulation.home, regulationAway: regulation.away } : {}),
    ...(fullTime ? { fullTime } : {}), ...(penalties ? { penalties } : {}),
    ...(lastUpdated ? { lastUpdated } : {}),
  };
  const base = { observedAt, completeness: "full" as const, sanitizedPayload };
  // The reviewed mapping is the single external reference published by this
  // adapter. Raw provider match ID remains evidence, not an implicit second alias.
  const contest: NormalizedObservation = {
    ...base, externalId: matchMapping.contestExternalId, entityKind: "contest",
    data: {
      eventEditionExternalId: config.eventEditionExternalId, stageExternalId: stage.externalId,
      contestKey: matchMapping.contestKey, name: matchMapping.name, contestKind: "match",
      status: STATUS_MAP[statusText] as "scheduled" | "live" | "suspended" | "postponed" | "final" | "canceled",
      requiredForCompletion: true, scheduledAt, entries: [
        { eventEntryExternalId: home.eventEntryExternalId, role: "competitor", side: "home", ordinal: 1, metadata: {} },
        { eventEntryExternalId: away.eventEntryExternalId, role: "competitor", side: "away", ordinal: 2, metadata: {} },
      ], metadata: {},
    },
  };
  const result: NormalizedObservation = {
    ...base, externalId: id, entityKind: "result",
    data: {
      eventEditionExternalId: config.eventEditionExternalId, contestExternalId: contest.externalId,
      resultStatus: finished ? "final" : "unresolved",
      outcomeType: finished ? outcome === "DRAW" ? "draw" : "winner" : "pending",
      resultData,
      ...(finished && settledPair ? { score: settledPair } : {}),
      ...(finished && outcome !== "DRAW" ? { winnerEventEntryExternalId: outcome === "HOME_TEAM" ? home.eventEntryExternalId : away.eventEntryExternalId } : {}),
    },
  };
  return [contest, result];
}

function integerPair(value: unknown): { home: number; away: number } | undefined {
  const p = object(value);
  return p && Number.isSafeInteger(p.home) && Number(p.home) >= 0 && Number.isSafeInteger(p.away) && Number(p.away) >= 0 ? { home: Number(p.home), away: Number(p.away) } : undefined;
}
function pairWinner(pair: { home: number; away: number }): "HOME_TEAM" | "AWAY_TEAM" | "DRAW" {
  return pair.home === pair.away ? "DRAW" : pair.home > pair.away ? "HOME_TEAM" : "AWAY_TEAM";
}
function validDate(value: unknown): string | undefined {
  return typeof value === "string" && isoDateTimeSchema.safeParse(value).success && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;
}
function dateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function providerId(value: unknown): string | undefined {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : undefined;
  return typeof value === "string" && /^[1-9]\d{0,19}$/.test(value) ? value : undefined;
}
function competitionMatches(value: unknown, config: Config): boolean {
  const competition = object(value);
  return competition?.code === "CL" && providerId(competition?.id) === config.providerCompetitionId;
}
type ReviewReason = "invalid_match_id" | "competition_mismatch" | "season_mismatch" | "outside_window" |
  "unknown_stage" | "unmapped_match" | "unmapped_team" | "conflicting_entries" | "unknown_status" |
  "filter_mismatch" | "unsupported_award" | "unknown_duration" | "missing_score" | "score_conflict";
function reviewError(reason: ReviewReason, row?: Record<string, unknown>): ProviderAdapterError {
  // Only bounded numeric source IDs and fixed reason codes survive errors;
  // arbitrary provider strings, names, URLs and entire bodies never do.
  return new ProviderAdapterError({
    code: "invalid_response", retry: "never", message: "Football-data batch requires reviewed reconciliation",
    details: {
      reviewRequired: true, reason,
      ...(providerId(row?.id) ? { matchId: providerId(row?.id)! } : {}),
      ...(providerId(object(row?.homeTeam)?.id) ? { homeTeamId: providerId(object(row?.homeTeam)?.id)! } : {}),
      ...(providerId(object(row?.awayTeam)?.id) ? { awayTeamId: providerId(object(row?.awayTeam)?.id)! } : {}),
    },
  });
}
function invalid(message: string): ProviderAdapterError { return new ProviderAdapterError({ code: "invalid_response", retry: "never", message, details: {} }); }
