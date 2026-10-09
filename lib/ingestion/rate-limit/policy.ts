import type { RateBudgetDecision, RateBudgetInput } from "@/lib/ingestion/orchestrator/types";

const invalid = (cost: number): RateBudgetDecision => ({
  allowed: false,
  cost,
  reason: "invalid_budget",
});

const parseTimestamp = (value: string): number | null => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const isSafeCounter = (value: number | undefined): value is number =>
  value !== undefined && Number.isSafeInteger(value) && value >= 0;

export function decideRateBudget(input: RateBudgetInput): RateBudgetDecision {
  const cost = input.cost ?? 1;
  if (!Number.isSafeInteger(cost) || cost <= 0) return invalid(cost);

  const nowTimestamp = parseTimestamp(input.now);
  if (nowTimestamp === null) return invalid(cost);

  if (input.configuredLimit === undefined || input.available === undefined) {
    return { allowed: false, cost, reason: "unknown_budget" };
  }
  if (!Number.isSafeInteger(input.configuredLimit) || input.configuredLimit <= 0 || !isSafeCounter(input.available)) {
    return invalid(cost);
  }
  if (input.available > input.configuredLimit) return invalid(cost);

  let effectiveAvailable = input.available;
  let trustedResetTimestamp: number | null = null;
  if (input.trustedResetAt !== undefined) {
    trustedResetTimestamp = parseTimestamp(input.trustedResetAt);
    if (trustedResetTimestamp === null) return invalid(cost);
    if (trustedResetTimestamp <= nowTimestamp) effectiveAvailable = input.configuredLimit;
  }

  if (effectiveAvailable >= cost) return { allowed: true, cost, reason: "available" };
  return {
    allowed: false,
    cost,
    ...(trustedResetTimestamp !== null && trustedResetTimestamp > nowTimestamp
      ? { retryAt: new Date(trustedResetTimestamp).toISOString() }
      : {}),
    reason: "exhausted",
  };
}
