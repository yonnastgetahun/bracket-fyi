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

  it("rejects UUIDs with invalid version or variant bits", () => {
    expect(() => createAttemptKey({ runId: "123e4567-e89b-02d3-a456-426614174000", retryIndex: 0, pageKey })).toThrow(AttemptKeyValidationError);
    expect(() => createAttemptKey({ runId: "123e4567-e89b-12d3-c456-426614174000", retryIndex: 0, pageKey })).toThrow(AttemptKeyValidationError);
  });

  it("converts hostile objects into the fixed validation error", () => {
    const throwingGet = new Proxy({ runId, retryIndex: 0, pageKey }, { get: () => { throw new Error("secret"); } });
    const throwingKeys = new Proxy({ runId, retryIndex: 0, pageKey }, { ownKeys: () => { throw new Error("secret"); } });
    const revoked = Proxy.revocable({ runId, retryIndex: 0, pageKey }, {});
    revoked.revoke();

    for (const input of [throwingGet, throwingKeys, revoked.proxy]) {
      expect(() => createAttemptKey(input)).toThrow(AttemptKeyValidationError);
      expect(() => createAttemptKey(input)).toThrow("Invalid attempt key input");
    }
  });
});
