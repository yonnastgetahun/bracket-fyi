import { describe, expect, it } from "vitest";

import { AttemptKeyValidationError, createAttemptKey } from "@/lib/ingestion/rate-limit/attempt-key";

const runId = "123e4567-e89b-12d3-a456-426614174000";
const pageKey = "a".repeat(64);

describe("attempt-key policy", () => {
  it("creates the exact deterministic key", () => {
    expect(createAttemptKey({ runId, retryIndex: 0, pageKey })).toBe(`v1:request:${runId}:0:${pageKey}`);
    expect(createAttemptKey({ runId, retryIndex: 3, pageKey })).toBe(`v1:request:${runId}:3:${pageKey}`);
  });

  it.each([
    null,
    [],
    { runId, retryIndex: 0, pageKey, extra: true },
    { runId: "123E4567-E89B-12D3-A456-426614174000", retryIndex: 0, pageKey },
    { runId: ` ${runId}`, retryIndex: 0, pageKey },
    { runId, retryIndex: -1, pageKey },
    { runId, retryIndex: 4, pageKey },
    { runId, retryIndex: 1.5, pageKey },
    { runId, retryIndex: 0, pageKey: pageKey.toUpperCase() },
    { runId, retryIndex: 0, pageKey: "a".repeat(63) },
    { runId, retryIndex: 0, pageKey: `${pageKey}a` },
  ])("rejects malformed input: %j", (input) => {
    expect(() => createAttemptKey(input)).toThrow(AttemptKeyValidationError);
    expect(() => createAttemptKey(input)).toThrow("Invalid attempt key input");
  });
});
