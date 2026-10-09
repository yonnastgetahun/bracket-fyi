import { describe, expect, it } from "vitest";

import { canonicalJson } from "@/lib/ingestion/idempotency/canonical-json";
import {
  auditIdempotencyKey,
  observationIdempotencyKey,
  outboxIdempotencyKey,
  resultIdempotencyKey,
} from "@/lib/ingestion/idempotency/keys";

describe("deterministic Slice 2B idempotency keys", () => {
  it("sorts object keys recursively while preserving array order", () => {
    expect(canonicalJson({ b: 2, a: { z: true, y: [2, 1] } })).toBe(
      '{"a":{"y":[2,1],"z":true},"b":2}',
    );
    expect(canonicalJson({ a: { y: [1, 2], z: true }, b: 2 })).not.toBe(
      canonicalJson({ b: 2, a: { z: true, y: [2, 1] } }),
    );
  });

  it("creates stable semantic result keys independent of object insertion order", () => {
    const first = resultIdempotencyKey({
      contestId: "contest-1",
      resultStatus: "final",
      outcomeType: "winner",
      winnerEventEntryId: "entry-1",
      resultData: { score: { away: 1, home: 2 }, note: "synthetic" },
      score: { home: 2, away: 1 },
      orderingPolicyVersion: "result-ordering-v1",
    });
    const second = resultIdempotencyKey({
      contestId: "contest-1",
      resultStatus: "final",
      outcomeType: "winner",
      winnerEventEntryId: "entry-1",
      resultData: { note: "synthetic", score: { home: 2, away: 1 } },
      score: { away: 1, home: 2 },
      orderingPolicyVersion: "result-ordering-v1",
    });
    expect(first).toBe(second);
    expect(first).toMatch(/^v1:result:[a-f0-9]{64}$/);
  });

  it("uses opaque provider revisions as identity inputs, never sortable values", () => {
    const base = {
      bindingId: "binding-1",
      entityKind: "contest" as const,
      externalId: "contest-1",
      sanitizedPayload: { b: 2, a: 1 },
    };
    expect(observationIdempotencyKey({ ...base, providerRevision: "10" })).not.toBe(
      observationIdempotencyKey({ ...base, providerRevision: "2" }),
    );
    expect(observationIdempotencyKey({ ...base, providerRevision: undefined })).toMatch(
      /^v1:observation:[a-f0-9]{64}$/,
    );
  });

  it("derives audit and outbox keys from the accepted semantic result", () => {
    const resultKey = "v1:result:" + "a".repeat(64);
    expect(auditIdempotencyKey(resultKey, "result.projected")).toMatch(/^v1:audit:[a-f0-9]{64}$/);
    expect(outboxIdempotencyKey(resultKey, "result_final", "operator")).toMatch(/^v1:outbox:[a-f0-9]{64}$/);
  });
});
