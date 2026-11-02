import { z } from "zod";

import {
  canonicalKeySchema,
  isoDateTimeSchema,
  jsonObjectSchema,
  type ProviderBatch,
  type ProviderCapability,
} from "@/lib/ingestion/contracts";
import { type ProviderFailure } from "@/lib/ingestion/errors";

export const providerPullRequestSchema = z
  .object({
    bindingId: z.uuid(),
    providerKey: canonicalKeySchema,
    eventEditionId: z.uuid(),
    bindingKey: canonicalKeySchema,
    adapterConfigVersion: z.number().int().positive(),
    adapterConfig: jsonObjectSchema,
    windowStart: isoDateTimeSchema,
    windowEnd: isoDateTimeSchema,
    requestedAt: isoDateTimeSchema,
    cursor: jsonObjectSchema.optional(),
    etag: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Date.parse(value.windowEnd) < Date.parse(value.windowStart)) {
      context.addIssue({ code: "custom", path: ["windowEnd"], message: "windowEnd must not precede windowStart" });
    }
  });

export type ProviderPullRequest = Readonly<z.infer<typeof providerPullRequestSchema>>;

export interface ProviderCredential {
  readonly reference: string;
  readonly getValue: () => string;
}

export type PullContext = ProviderPullRequest & {
  readonly credential: ProviderCredential;
};

export interface ProviderAdapter {
  readonly key: string;
  readonly capabilities: ReadonlySet<ProviderCapability>;
  pull(context: PullContext): Promise<ProviderBatch>;
  classifyError(error: unknown): ProviderFailure;
}
