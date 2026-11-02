import type { ProviderFailure } from "@/lib/ingestion/errors";

export interface Clock {
  now(): Date;
}

export type PollPhase = "distant" | "pregame" | "live" | "postgame" | "complete";

export type DueBindingInput = Readonly<{
  mode: "disabled" | "shadow" | "write";
  nextPollAt?: string;
  phase: PollPhase;
  idleSeconds: number;
  pregameSeconds: number;
  liveSeconds: number;
  postgameSeconds: number;
}>;

export type RateBudgetDecision = Readonly<{
  allowed: boolean;
  cost: number;
  retryAt?: string;
  reason: "available" | "exhausted" | "unknown_budget" | "invalid_budget";
}>;

export type RateBudgetInput = Readonly<{
  configuredLimit?: number;
  available?: number;
  trustedResetAt?: string;
  now: string;
  cost?: number;
}>;

export type RetryDecision = Readonly<{
  retry: boolean;
  retryIndex: number;
  retryAt?: string;
  delaySeconds?: number;
  reason: "retryable" | "provider_reset" | "max_retries" | "terminal";
}>;

export type RetryInput = Readonly<{
  failure: ProviderFailure;
  retryIndex: number;
  now: string;
  claimKey: string;
  retryAfterAt?: string;
}>;

export const MAX_RETRIES = 3;
export const BACKOFF_BASE_SECONDS = 30;
export const BACKOFF_CAP_SECONDS = 900;
