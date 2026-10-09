import { z } from "zod";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const jsonPrimitiveSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const jsonArraySchema = z.preprocess(
  (value, context) => {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      context.addIssue({ code: "custom", message: "Expected a plain JSON array" });
      return z.NEVER;
    }
    return value;
  },
  z.array(z.lazy(() => jsonValueSchema)),
);

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([jsonPrimitiveSchema, jsonArraySchema, jsonObjectSchema]),
);

export const jsonObjectSchema: z.ZodType<JsonObject> = z.preprocess(
  (value, context) => {
    if (!isPlainObject(value)) {
      context.addIssue({ code: "custom", message: "Expected a plain JSON object" });
      return z.NEVER;
    }
    return value;
  },
  z.record(z.string(), jsonValueSchema),
) as z.ZodType<JsonObject>;

export const canonicalKeySchema = z.string().regex(/^[a-z0-9]+([._-][a-z0-9]+)*$/);
export const externalIdSchema = z.string().trim().min(1).max(512);
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const nonBlankTextSchema = z.string().trim().min(1);

export const providerCapabilities = [
  "schedule",
  "live_status",
  "final_results",
  "bracket_structure",
  "series",
  "aggregate_ties",
  "nominations",
  "ceremony_results",
] as const;

export const providerCapabilitySchema = z.enum(providerCapabilities);
export type ProviderCapability = z.infer<typeof providerCapabilitySchema>;

export const providerEntityKinds = [
  "organization",
  "competition",
  "event_edition",
  "competitor",
  "event_entry",
  "stage",
  "round",
  "contest",
  "bracket",
  "result",
] as const;

export const providerEntityKindSchema = z.enum(providerEntityKinds);
export type ProviderEntityKind = z.infer<typeof providerEntityKindSchema>;
export type MappableProviderEntityKind = Exclude<ProviderEntityKind, "result">;

const organizationKindSchema = z.enum([
  "governing_body",
  "league",
  "conference",
  "studio",
  "academy",
  "owner",
  "other",
]);

export const normalizedOrganizationSchema = z
  .object({
    organizationKind: organizationKindSchema,
    name: nonBlankTextSchema,
    metadata: jsonObjectSchema,
    officialUrl: z.url().optional(),
  })
  .strict();

export type NormalizedOrganization = z.infer<typeof normalizedOrganizationSchema>;

const competitionDomainSchema = z.enum(["sport", "awards", "other"]);

export const normalizedCompetitionSchema = z
  .object({
    name: nonBlankTextSchema,
    domain: competitionDomainSchema,
    rulesMetadata: jsonObjectSchema,
    organizationExternalId: externalIdSchema.optional(),
    sportCode: nonBlankTextSchema.optional(),
    officialUrl: z.url().optional(),
  })
  .strict();

export type NormalizedCompetition = z.infer<typeof normalizedCompetitionSchema>;

const eventEditionStatusSchema = z.enum([
  "planned",
  "scheduled",
  "active",
  "complete",
  "canceled",
]);

const rejectReversedDates = (
  value: { startsAt?: string; endsAt?: string },
  context: z.RefinementCtx,
) => {
  if (value.startsAt && value.endsAt && Date.parse(value.endsAt) < Date.parse(value.startsAt)) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "endsAt must not precede startsAt" });
  }
};

export const normalizedEventEditionSchema = z
  .object({
    competitionExternalId: externalIdSchema,
    editionKey: canonicalKeySchema,
    name: nonBlankTextSchema,
    seasonLabel: nonBlankTextSchema,
    timezone: nonBlankTextSchema,
    status: eventEditionStatusSchema,
    metadata: jsonObjectSchema,
    startsAt: isoDateTimeSchema.optional(),
    endsAt: isoDateTimeSchema.optional(),
    officialUrl: z.url().optional(),
  })
  .strict()
  .superRefine(rejectReversedDates);

export type NormalizedEventEdition = z.infer<typeof normalizedEventEditionSchema>;

const competitorKindSchema = z.enum([
  "team",
  "national_side",
  "school",
  "person",
  "film",
  "song",
  "album",
  "other_work",
  "other",
]);

export const normalizedCompetitorSchema = z
  .object({
    competitorKind: competitorKindSchema,
    canonicalName: nonBlankTextSchema,
    metadata: jsonObjectSchema,
    organizationExternalId: externalIdSchema.optional(),
    shortName: nonBlankTextSchema.optional(),
    countryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
  })
  .strict();

export type NormalizedCompetitor = z.infer<typeof normalizedCompetitorSchema>;

const eventEntryStatusSchema = z.enum(["invited", "confirmed", "withdrawn", "disqualified"]);

export const normalizedEventEntrySchema = z
  .object({
    eventEditionExternalId: externalIdSchema,
    competitorExternalId: externalIdSchema,
    role: nonBlankTextSchema,
    status: eventEntryStatusSchema,
    metadata: jsonObjectSchema,
    seed: z.number().int().positive().optional(),
    region: nonBlankTextSchema.optional(),
    conference: nonBlankTextSchema.optional(),
  })
  .strict();

export type NormalizedEventEntry = z.infer<typeof normalizedEventEntrySchema>;

const stageKindSchema = z.enum(["league", "group", "knockout", "playoffs", "nominations", "ceremony", "other"]);

export const normalizedStageSchema = z
  .object({
    eventEditionExternalId: externalIdSchema,
    stageKey: canonicalKeySchema,
    name: nonBlankTextSchema,
    stageKind: stageKindSchema,
    ordinal: z.number().int().positive(),
    metadata: jsonObjectSchema,
    parentStageExternalId: externalIdSchema.optional(),
    startsAt: isoDateTimeSchema.optional(),
    endsAt: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine(rejectReversedDates);

export type NormalizedStage = z.infer<typeof normalizedStageSchema>;

export const normalizedRoundSchema = z
  .object({
    eventEditionExternalId: externalIdSchema,
    stageExternalId: externalIdSchema,
    roundKey: canonicalKeySchema,
    name: nonBlankTextSchema,
    ordinal: z.number().int().positive(),
    metadata: jsonObjectSchema,
    providerLabel: nonBlankTextSchema.optional(),
    startsAt: isoDateTimeSchema.optional(),
    endsAt: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine(rejectReversedDates);

export type NormalizedRound = z.infer<typeof normalizedRoundSchema>;

const contestKindSchema = z.enum(["game", "match", "series", "tie", "award", "category"]);
const contestStatusSchema = z.enum([
  "scheduled",
  "pregame",
  "live",
  "suspended",
  "postponed",
  "final",
  "canceled",
  "void",
]);

const contestEntrySchema = z
  .object({
    eventEntryExternalId: externalIdSchema,
    role: nonBlankTextSchema,
    side: nonBlankTextSchema.optional(),
    ordinal: z.number().int().positive(),
    metadata: jsonObjectSchema,
  })
  .strict();

const hasUniqueValues = (values: Array<string | number>) => new Set(values).size === values.length;

export const normalizedContestSchema = z
  .object({
    eventEditionExternalId: externalIdSchema,
    stageExternalId: externalIdSchema,
    contestKey: canonicalKeySchema,
    name: nonBlankTextSchema,
    contestKind: contestKindSchema,
    status: contestStatusSchema,
    requiredForCompletion: z.boolean(),
    entries: z.array(contestEntrySchema),
    metadata: jsonObjectSchema,
    roundExternalId: externalIdSchema.optional(),
    parentContestExternalId: externalIdSchema.optional(),
    scheduledAt: isoDateTimeSchema.optional(),
    startsAt: isoDateTimeSchema.optional(),
    endsAt: isoDateTimeSchema.optional(),
    bestOf: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const entryIds = value.entries.map((entry) => entry.eventEntryExternalId);
    const ordinals = value.entries.map((entry) => entry.ordinal);
    if (!hasUniqueValues(entryIds)) {
      context.addIssue({ code: "custom", path: ["entries"], message: "Contest entry IDs must be unique" });
    }
    if (!hasUniqueValues(ordinals)) {
      context.addIssue({ code: "custom", path: ["entries"], message: "Contest entry ordinals must be unique" });
    }
    rejectReversedDates(value, context);
  });

export type NormalizedContest = z.infer<typeof normalizedContestSchema>;

const bracketEdgeSchema = z
  .object({
    fromContestExternalId: externalIdSchema,
    toContestExternalId: externalIdSchema,
    outcome: z.enum(["winner", "loser", "qualifier", "seed", "placement"]),
    targetRole: nonBlankTextSchema,
    priority: z.number().int().positive(),
    metadata: jsonObjectSchema,
  })
  .strict();

export const normalizedBracketSchema = z
  .object({
    eventEditionExternalId: externalIdSchema,
    bracketKey: canonicalKeySchema,
    name: nonBlankTextSchema,
    bracketKind: z.enum(["single_elimination", "double_elimination", "reseeded", "knockout", "custom"]),
    edges: z.array(bracketEdgeSchema),
    metadata: jsonObjectSchema,
    stageExternalId: externalIdSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    value.edges.forEach((edge, index) => {
      if (edge.fromContestExternalId === edge.toContestExternalId) {
        context.addIssue({ code: "custom", path: ["edges", index], message: "Bracket edges cannot reference themselves" });
      }
    });
  });

export type NormalizedBracket = z.infer<typeof normalizedBracketSchema>;

const resultStatusSchema = z.enum(["provisional", "final", "awarded", "canceled", "void", "unresolved"]);
const outcomeTypeSchema = z.enum(["pending", "winner", "draw", "no_contest"]);

export const normalizedResultSchema = z
  .object({
    eventEditionExternalId: externalIdSchema,
    contestExternalId: externalIdSchema,
    resultStatus: resultStatusSchema,
    outcomeType: outcomeTypeSchema,
    resultData: jsonObjectSchema,
    winnerEventEntryExternalId: externalIdSchema.optional(),
    score: jsonObjectSchema.optional(),
    providerEffectiveAt: isoDateTimeSchema.optional(),
    correctionReason: nonBlankTextSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const requiresWinner = value.outcomeType === "winner";
    if (requiresWinner !== Boolean(value.winnerEventEntryExternalId)) {
      context.addIssue({ code: "custom", path: ["winnerEventEntryExternalId"], message: "Winner outcome requires exactly one winner" });
    }
    const validState =
      ((value.resultStatus === "provisional" || value.resultStatus === "unresolved") && value.outcomeType === "pending") ||
      (value.resultStatus === "final" && ["winner", "draw"].includes(value.outcomeType)) ||
      (value.resultStatus === "awarded" && value.outcomeType === "winner") ||
      (["canceled", "void"].includes(value.resultStatus) && value.outcomeType === "no_contest");
    if (!validState) {
      context.addIssue({ code: "custom", path: ["resultStatus"], message: "Result status and outcome are incompatible" });
    }
  });

export type NormalizedResult = z.infer<typeof normalizedResultSchema>;

export const normalizedEntitySchema = z.union([
  normalizedOrganizationSchema,
  normalizedCompetitionSchema,
  normalizedEventEditionSchema,
  normalizedCompetitorSchema,
  normalizedEventEntrySchema,
  normalizedStageSchema,
  normalizedRoundSchema,
  normalizedContestSchema,
  normalizedBracketSchema,
  normalizedResultSchema,
]);
export type NormalizedEntity = z.infer<typeof normalizedEntitySchema>;

const observationEnvelope = {
  externalId: externalIdSchema,
  providerRevision: nonBlankTextSchema.optional(),
  providerUpdatedAt: isoDateTimeSchema.optional(),
  observedAt: isoDateTimeSchema,
  completeness: z.enum(["full", "partial"]),
  sanitizedPayload: jsonObjectSchema,
} as const;

const organizationObservationSchema = z
  .object({ ...observationEnvelope, entityKind: z.literal("organization"), data: normalizedOrganizationSchema })
  .strict();
const competitionObservationSchema = z
  .object({ ...observationEnvelope, entityKind: z.literal("competition"), data: normalizedCompetitionSchema })
  .strict();
const eventEditionObservationSchema = z
  .object({ ...observationEnvelope, entityKind: z.literal("event_edition"), data: normalizedEventEditionSchema })
  .strict();
const competitorObservationSchema = z
  .object({ ...observationEnvelope, entityKind: z.literal("competitor"), data: normalizedCompetitorSchema })
  .strict();
const eventEntryObservationSchema = z
  .object({ ...observationEnvelope, entityKind: z.literal("event_entry"), data: normalizedEventEntrySchema })
  .strict();
const stageObservationSchema = z
  .object({ ...observationEnvelope, entityKind: z.literal("stage"), data: normalizedStageSchema })
  .strict();
const roundObservationSchema = z
  .object({ ...observationEnvelope, entityKind: z.literal("round"), data: normalizedRoundSchema })
  .strict();
const contestObservationSchema = z
  .object({ ...observationEnvelope, entityKind: z.literal("contest"), data: normalizedContestSchema })
  .strict();
const bracketObservationSchema = z
  .object({ ...observationEnvelope, entityKind: z.literal("bracket"), data: normalizedBracketSchema })
  .strict();
const resultObservationSchema = z
  .object({ ...observationEnvelope, entityKind: z.literal("result"), data: normalizedResultSchema })
  .strict();

export const normalizedObservationSchema = z.discriminatedUnion("entityKind", [
  organizationObservationSchema,
  competitionObservationSchema,
  eventEditionObservationSchema,
  competitorObservationSchema,
  eventEntryObservationSchema,
  stageObservationSchema,
  roundObservationSchema,
  contestObservationSchema,
  bracketObservationSchema,
  resultObservationSchema,
]);

export type NormalizedObservation = z.infer<typeof normalizedObservationSchema>;

const rateLimitSchema = z
  .object({
    limit: z.number().int().nonnegative().optional(),
    remaining: z.number().int().nonnegative().optional(),
    resetAt: isoDateTimeSchema.optional(),
    retryAfterAt: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.limit !== undefined && value.remaining !== undefined && value.remaining > value.limit) {
      context.addIssue({ code: "custom", path: ["remaining"], message: "remaining cannot exceed limit" });
    }
  });

export const providerBatchSchema = z
  .object({
    observations: z.array(normalizedObservationSchema),
    fetchedCount: z.number().int().nonnegative(),
    receivedAt: isoDateTimeSchema,
    nextCursor: jsonObjectSchema.optional(),
    etag: nonBlankTextSchema.optional(),
    providerRequestId: nonBlankTextSchema.optional(),
    rateLimit: rateLimitSchema.optional(),
  })
  .strict();

export type ProviderBatch = z.infer<typeof providerBatchSchema>;
