import { z } from "zod";

import { isoDateTimeSchema, jsonObjectSchema, nonBlankTextSchema } from "@/lib/ingestion/contracts";

export const providerFailureCodes = [
  "authentication",
  "authorization",
  "not_found",
  "rate_limited",
  "timeout",
  "network",
  "provider_server",
  "invalid_response",
  "unsupported_shape",
  "permanent",
] as const;

export type ProviderFailureCode = (typeof providerFailureCodes)[number];

export const providerRetryStrategies = ["never", "backoff", "provider_reset"] as const;
export const providerRetryStrategySchema = z.enum(providerRetryStrategies);
export type ProviderRetryStrategy = z.infer<typeof providerRetryStrategySchema>;

export const providerFailureSchema = z
  .object({
    code: z.enum(providerFailureCodes),
    retry: providerRetryStrategySchema,
    message: nonBlankTextSchema,
    httpStatus: z.number().int().min(100).max(599).optional(),
    retryAt: isoDateTimeSchema.optional(),
    details: jsonObjectSchema,
  })
  .strict()
  .superRefine((failure, context) => {
    const expectedRetry: ProviderRetryStrategy =
      failure.code === "rate_limited"
        ? "provider_reset"
        : ["timeout", "network", "provider_server"].includes(failure.code)
          ? "backoff"
          : "never";
    if (failure.retry !== expectedRetry) {
      context.addIssue({ code: "custom", path: ["retry"], message: `Expected retry strategy ${expectedRetry}` });
    }
  });

export type ProviderFailure = z.infer<typeof providerFailureSchema>;

export class ProviderAdapterError extends Error {
  readonly failure: ProviderFailure;

  constructor(failure: ProviderFailure, cause?: unknown) {
    super(failure.message);
    this.name = "ProviderAdapterError";
    this.failure = providerFailureSchema.parse(failure);
    Object.defineProperty(this, "cause", {
      configurable: true,
      enumerable: false,
      value: cause,
      writable: true,
    });
  }
}

export function isProviderAdapterError(error: unknown): error is ProviderAdapterError {
  return error instanceof ProviderAdapterError;
}
