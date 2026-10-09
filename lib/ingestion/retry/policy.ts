import { createHash } from "node:crypto";

import type { ProviderFailure } from "@/lib/ingestion/errors";
import {
  BACKOFF_BASE_SECONDS,
  BACKOFF_CAP_SECONDS,
  MAX_RETRIES,
  type RetryDecision,
  type RetryInput,
} from "@/lib/ingestion/orchestrator/types";

const retryableCodes = new Set<ProviderFailure["code"]>(["timeout", "network", "provider_server", "rate_limited"]);

const parseTimestamp = (value: string, label: string): number => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new RangeError(`${label} must be a valid timestamp`);
  return timestamp;
};

const jitterFraction = (claimKey: string, retryIndex: number): number => {
  const digest = createHash("sha256")
    .update(`slice-2c-jitter-v1${claimKey}:${retryIndex}`)
    .digest("hex");
  return Number.parseInt(digest.slice(0, 8), 16) / 0xffffffff;
};

const invalidRetryIndex = (retryIndex: number): boolean =>
  !Number.isSafeInteger(retryIndex) || retryIndex < 0 || retryIndex > MAX_RETRIES;

export function decideRetry(input: RetryInput): RetryDecision {
  if (invalidRetryIndex(input.retryIndex)) throw new RangeError("retryIndex must be between 0 and 3");
  if (input.claimKey.trim() === "") throw new RangeError("claimKey must be nonblank");

  const nowTimestamp = parseTimestamp(input.now, "now");
  const providerResetTimestamp = input.failure.retryAt === undefined
    ? undefined
    : parseTimestamp(input.failure.retryAt, "provider retryAt");
  const retryAfterTimestamp = input.retryAfterAt === undefined
    ? undefined
    : parseTimestamp(input.retryAfterAt, "retryAfterAt");

  if (!retryableCodes.has(input.failure.code)) {
    return { retry: false, retryIndex: input.retryIndex, reason: "terminal" };
  }
  if (input.retryIndex >= MAX_RETRIES) {
    return { retry: false, retryIndex: input.retryIndex, reason: "max_retries" };
  }

  const backoffSeconds = Math.min(BACKOFF_CAP_SECONDS, BACKOFF_BASE_SECONDS * 2 ** input.retryIndex);
  const jitterSeconds = backoffSeconds * jitterFraction(input.claimKey, input.retryIndex);
  const candidateTimestamps = [nowTimestamp + jitterSeconds * 1000];
  if (providerResetTimestamp !== undefined) candidateTimestamps.push(providerResetTimestamp);
  if (retryAfterTimestamp !== undefined) candidateTimestamps.push(retryAfterTimestamp);
  const selectedTimestamp = Math.max(...candidateTimestamps);

  return {
    retry: true,
    retryIndex: input.retryIndex + 1,
    retryAt: new Date(selectedTimestamp).toISOString(),
    delaySeconds: (selectedTimestamp - nowTimestamp) / 1000,
    reason: input.failure.code === "rate_limited" ? "provider_reset" : "retryable",
  };
}
