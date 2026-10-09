import { z } from "zod";

import {
  canonicalKeySchema,
  externalIdSchema,
  jsonObjectSchema,
  nonBlankTextSchema,
  providerCapabilitySchema,
} from "@/lib/ingestion/contracts";

const uniqueNonEmptyArray = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.array(itemSchema).min(1).superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", message: "Values must be unique" });
    }
  });

const isIanaTimezone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};

const timezoneSchema = nonBlankTextSchema.refine(isIanaTimezone, "Expected a valid IANA timezone");
const positiveIntegerSchema = z.number().int().positive();
const pollingSecondsSchema = (minimum: number) => z.number().int().min(minimum);

const providerBindingSchema = z
  .object({
    providerKey: canonicalKeySchema,
    competitionExternalId: externalIdSchema,
    adapterConfigVersion: positiveIntegerSchema,
    credentialRef: nonBlankTextSchema,
    adapterConfig: jsonObjectSchema,
  })
  .strict();

const contestKinds = z.enum(["game", "match", "series", "tie", "award", "category"]);

export const eventIngestionConfigSchema = z
  .object({
    configVersion: positiveIntegerSchema,
    eventEditionKey: canonicalKeySchema,
    timezone: timezoneSchema,
    requiredCapabilities: uniqueNonEmptyArray(providerCapabilitySchema),
    providerBinding: providerBindingSchema,
    structure: z
      .object({
        scoringContestKinds: uniqueNonEmptyArray(contestKinds),
        includeStageKeys: uniqueNonEmptyArray(canonicalKeySchema),
        completionPolicy: z.enum([
          "all_required_contests_terminal",
          "all_required_categories_awarded",
          "manual",
        ]),
      })
      .strict(),
    pollingPolicy: z
      .object({
        idleSeconds: pollingSecondsSchema(300),
        pregameSeconds: pollingSecondsSchema(60),
        liveSeconds: pollingSecondsSchema(30),
        postgameSeconds: pollingSecondsSchema(60),
        staleAfterSeconds: pollingSecondsSchema(60),
      })
      .strict()
      .superRefine((value, context) => {
        if (value.staleAfterSeconds < value.liveSeconds) {
          context.addIssue({ code: "custom", path: ["staleAfterSeconds"], message: "staleAfterSeconds must be at least liveSeconds" });
        }
      }),
    attribution: z
      .object({
        displayName: nonBlankTextSchema,
        termsUrl: z.url().optional(),
        attributionText: nonBlankTextSchema.optional(),
      })
      .strict(),
    fallbackMode: z.enum(["manual_only", "manual_and_shadow_provider"]),
  })
  .strict();

export type EventIngestionConfig = z.infer<typeof eventIngestionConfigSchema>;

export function parseEventIngestionConfig(input: unknown): EventIngestionConfig {
  return eventIngestionConfigSchema.parse(input);
}
