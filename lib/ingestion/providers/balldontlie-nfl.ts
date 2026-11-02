import { z } from "zod";
import { isoDateTimeSchema, providerBatchSchema, type NormalizedObservation, type ProviderBatch } from "@/lib/ingestion/contracts";
import { isProviderAdapterError, ProviderAdapterError, type ProviderFailure } from "@/lib/ingestion/errors";
import { fetchBdlPage, type BdlFetch } from "@/lib/ingestion/providers/balldontlie";
import type { ProviderAdapter, PullContext } from "@/lib/ingestion/providers/provider-adapter";

const text = z.string().trim().min(1);
const sourceId = z.string().regex(/^[1-9]\d{0,15}$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
const configSchema = z.object({
  mode: z.literal("provider"), sport: z.literal("nfl"), season: z.number().int().min(1900).max(2200),
  seasonStart: day, seasonEnd: day, eventEditionExternalId: text,
  matchMappings: z.record(sourceId, z.object({
    contestExternalId: text, contestKey: z.string().regex(/^[a-z0-9]+([._-][a-z0-9]+)*$/), name: text,
    stageExternalId: text, homeTeamId: sourceId, awayTeamId: sourceId, week: z.number().int().positive(),
    scheduledAt: isoDateTimeSchema,
  })),
  teamMappings: z.record(sourceId, z.object({ eventEntryExternalId: text, competitorExternalId: text, name: text })),
});
type Config = z.infer<typeof configSchema>;
const reject = (reason: string) => new ProviderAdapterError({
  code: "invalid_response", retry: "never", message: "BALLDONTLIE NFL batch requires reviewed reconciliation",
  details: { reviewRequired: true, reason },
});
function configFor(value: unknown): Config {
  const parsed = configSchema.safeParse(value);
  if (!parsed.success) throw reject("invalid_config");
  const c = parsed.data;
  if (c.seasonStart > c.seasonEnd || Number(c.seasonStart.slice(0, 4)) !== c.season) throw reject("invalid_season_bounds");
  const matches = Object.values(c.matchMappings), teams = Object.values(c.teamMappings);
  for (const values of [matches.map(m => m.contestExternalId), matches.map(m => m.contestKey),
    teams.map(t => t.eventEntryExternalId), teams.map(t => t.competitorExternalId)]) {
    if (new Set(values).size !== values.length) throw reject("duplicate_mapping");
  }
  for (const m of matches) {
    const date = new Date(m.scheduledAt).toISOString().slice(0, 10);
    if (m.homeTeamId === m.awayTeamId || !Object.hasOwn(c.teamMappings, m.homeTeamId) ||
      !Object.hasOwn(c.teamMappings, m.awayTeamId) || date < c.seasonStart || date > c.seasonEnd) throw reject("invalid_match_mapping");
  }
  return c;
}
const object = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
const id = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? String(v) : undefined;

/** Bounded NFL game seam. Structure and kickoff are reviewed, never inferred from names/date-only data. */
export class BdlNflAdapter implements ProviderAdapter {
  readonly key = "balldontlie";
  readonly capabilities = new Set(["schedule", "live_status", "final_results"] as const);
  constructor(private readonly dependencies: { fetch: BdlFetch }) {}
  classifyError(error: unknown): ProviderFailure {
    return isProviderAdapterError(error) ? error.failure :
      { code: "permanent", retry: "never", message: "BALLDONTLIE NFL pull failed", details: {} };
  }
  async pull(context: PullContext): Promise<ProviderBatch> {
    if (context.adapterConfig.mode === "manual") return providerBatchSchema.parse({ observations: [], fetchedCount: 0, receivedAt: context.requestedAt });
    const c = configFor(context.adapterConfig);
    if (!isoDateTimeSchema.safeParse(context.windowStart).success || !isoDateTimeSchema.safeParse(context.windowEnd).success ||
      Date.parse(context.windowStart) > Date.parse(context.windowEnd)) throw reject("invalid_window");
    const dateStart = new Date(context.windowStart).toISOString().slice(0, 10);
    const dateEnd = new Date(context.windowEnd).toISOString().slice(0, 10);
    // NFL's approved API has a date-list filter, not a date range. One pull = one explicit UTC day.
    if (dateStart !== dateEnd || dateStart < c.seasonStart || dateEnd > c.seasonEnd) throw reject("invalid_window");
    // The durable ledger represents an initial checkpoint as an empty object.
    const cursor = context.cursor && Object.keys(context.cursor).length > 0 ? context.cursor : undefined;
    if (cursor !== undefined && (Object.keys(cursor).length !== 1 || !Number.isSafeInteger(cursor.cursor) || Number(cursor.cursor) < 0)) throw reject("invalid_cursor");
    const page = await fetchBdlPage({ sport: "nfl", season: c.season, mode: "provider", dateStart, dateEnd,
      ...(cursor ? { cursor: Number(cursor.cursor) } : {}), credential: context.credential, fetch: this.dependencies.fetch });
    const observations: NormalizedObservation[] = [];
    const seen = new Set<string>();
    for (const [rowIndex, row] of page.data.entries()) {
      try {
        const gameId = id(row.id);
        if (!gameId || seen.has(gameId)) throw reject("invalid_or_duplicate_game");
        seen.add(gameId);
        const mapping = Object.hasOwn(c.matchMappings, gameId) ? c.matchMappings[gameId] : undefined;
        if (!mapping) throw reject("unmapped_game");
        if (row.postseason !== true || row.week !== mapping.week) throw reject("edition_membership_mismatch");
        if (row.date !== dateStart || new Date(mapping.scheduledAt).toISOString().slice(0, 10) !== row.date ||
          Date.parse(mapping.scheduledAt) < Date.parse(context.windowStart) || Date.parse(mapping.scheduledAt) > Date.parse(context.windowEnd)) throw reject("schedule_mismatch");
        if (id(object(row.home_team)?.id) !== mapping.homeTeamId || id(object(row.visitor_team)?.id) !== mapping.awayTeamId) throw reject("pairing_mismatch");
        const home = c.teamMappings[mapping.homeTeamId], away = c.teamMappings[mapping.awayTeamId];
        const state = row.status_state;
        const status = state === "completed" ? "final" : state === "scheduled" ? "scheduled" : state === "in_progress" ? "live" : undefined;
        if (!status) throw reject("unknown_status");
        // No OR-ing a Final label with an explicitly unknown/nonfinal lifecycle.
        const finalLabel = typeof row.status === "string" && /^final(?:\/ot)?$/i.test(row.status);
        if ((state === "completed") !== finalLabel) throw reject("status_conflict");
        const hs = row.home_team_score, vs = row.visitor_team_score;
        const finished = status === "final";
        if (finished && (typeof hs !== "number" || typeof vs !== "number" || hs === vs)) throw reject("missing_or_tied_final_score");
        const sanitizedPayload = { id: gameId, date: dateStart, season: c.season, week: mapping.week,
          statusState: String(state), homeTeamId: mapping.homeTeamId, visitorTeamId: mapping.awayTeamId,
          ...(typeof hs === "number" ? { homeScore: hs } : {}), ...(typeof vs === "number" ? { visitorScore: vs } : {}) };
        const base = { observedAt: context.requestedAt, completeness: "full" as const, sanitizedPayload };
        observations.push({ ...base, externalId: mapping.contestExternalId, entityKind: "contest", data: {
          eventEditionExternalId: c.eventEditionExternalId, stageExternalId: mapping.stageExternalId,
          contestKey: mapping.contestKey, name: mapping.name, contestKind: "game", status, requiredForCompletion: true,
          scheduledAt: mapping.scheduledAt, entries: [
            { eventEntryExternalId: home.eventEntryExternalId, role: "competitor", side: "home", ordinal: 1, metadata: {} },
            { eventEntryExternalId: away.eventEntryExternalId, role: "competitor", side: "away", ordinal: 2, metadata: {} },
          ], metadata: {},
        } });
        observations.push({ ...base, externalId: gameId, entityKind: "result", data: {
          eventEditionExternalId: c.eventEditionExternalId, contestExternalId: mapping.contestExternalId,
          resultStatus: finished ? "final" : "unresolved", outcomeType: finished ? "winner" : "pending",
          resultData: { settlementScope: "including_overtime" },
          ...(finished ? { winnerEventEntryExternalId: Number(hs) > Number(vs) ? home.eventEntryExternalId : away.eventEntryExternalId,
            score: { home: Number(hs), away: Number(vs) } } : {}),
        } });
      } catch (error) {
        if (isProviderAdapterError(error)) throw new ProviderAdapterError({ ...error.failure,
          details: { ...error.failure.details, rowIndex, fetchedCount: page.data.length } });
        throw error;
      }
    }
    // updated_at is deliberately not revision/correction authority.
    return providerBatchSchema.parse({ observations, fetchedCount: page.data.length, receivedAt: context.requestedAt,
      ...(page.nextCursor !== undefined ? { nextCursor: { cursor: page.nextCursor } } : {}) });
  }
}
