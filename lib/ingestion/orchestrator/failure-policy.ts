import {
  providerFailureSchema,
  type ProviderFailure,
  type ProviderFailureCode,
  type ProviderRetryStrategy,
} from "@/lib/ingestion/errors";
import type { JsonObject, JsonValue } from "@/lib/ingestion/contracts";

export type FailurePolicyDecision = Readonly<{
  code: ProviderFailureCode;
  retryable: boolean;
  retryStrategy: ProviderRetryStrategy;
}>;

export type SanitizedFailure = Readonly<{
  code: ProviderFailureCode;
  retry: ProviderRetryStrategy;
  message: string;
  httpStatus?: number;
  retryAt?: string;
  details: JsonObject;
}>;

const retryableCodes = new Set<ProviderFailureCode>(["timeout", "network", "provider_server", "rate_limited"]);
const sensitiveKey = /authorization|cookie|credential|password|secret|token|payload|raw|body/i;

const cleanString = (value: string, maximum: number): string =>
  value.replace(/\s+/gu, " ").trim().slice(0, maximum);

const sanitizeValue = (value: JsonValue, key?: string): JsonValue => {
  if (key !== undefined && sensitiveKey.test(key)) return "[redacted]";
  if (typeof value === "string") return cleanString(value, 256);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 20)
        .map(([entryKey, entryValue]) => [entryKey, sanitizeValue(entryValue, entryKey)]),
    ) as JsonObject;
  }
  return value;
};

export function classifyFailure(input: ProviderFailure): FailurePolicyDecision {
  const failure = providerFailureSchema.parse(input);
  return {
    code: failure.code,
    retryable: retryableCodes.has(failure.code),
    retryStrategy: failure.retry,
  };
}

export function sanitizeFailure(input: unknown): SanitizedFailure {
  const failure = providerFailureSchema.parse(input);
  const sanitized: SanitizedFailure = {
    code: failure.code,
    retry: failure.retry,
    message: cleanString(failure.message, 512),
    details: sanitizeValue(failure.details) as JsonObject,
  };
  if (failure.httpStatus !== undefined) return { ...sanitized, httpStatus: failure.httpStatus, ...(failure.retryAt === undefined ? {} : { retryAt: failure.retryAt }) };
  return failure.retryAt === undefined ? sanitized : { ...sanitized, retryAt: failure.retryAt };
}
