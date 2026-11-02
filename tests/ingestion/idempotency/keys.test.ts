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

  it("uses the cross-runtime numeric canonicalization vector", () => {
    expect(canonicalJson({
      ordinary: 42,
      large: 1e21,
      tiny: 1e-7,
      threshold: 0.000001,
      negativeZero: -0,
      safeMin: Number.MIN_SAFE_INTEGER,
      safeMax: Number.MAX_SAFE_INTEGER,
    })).toBe('{"large":1e+21,"negativeZero":0,"ordinary":42,"safeMax":9007199254740991,"safeMin":-9007199254740991,"threshold":0.000001,"tiny":1e-7}');
  });

  it("preserves the JavaScript-serialized RPC number before canonicalization", () => {
    // This literal is intentionally the acceptance vector; JSON.stringify applies
    // JavaScript's shortest-round-trip representation before the RPC is sent.
    const serialized = JSON.stringify({ value: 1.2345678901234567e21 });
    expect(serialized).toBe('{"value":1.2345678901234568e+21}');
    expect(canonicalJson(JSON.parse(serialized))).toBe(serialized);
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

  it("matches the SQL canonicalization vector used by result projection", () => {
    expect(resultIdempotencyKey({
      contestId: "99000000-0000-4000-8000-000000000008",
      resultStatus: "final",
      outcomeType: "winner",
      winnerEventEntryId: "99000000-0000-4000-8000-000000000012",
      score: { away: 1, home: 2 },
      resultData: { fixture: "synthetic-sports" },
      providerEffectiveAt: "2026-10-08T18:00:00Z",
      orderingPolicyVersion: "result-ordering-v1",
    })).toBe("v1:result:5be279699f32423f9de6e5164d8db47fc77a733a53d0159cf45f616fb21f19d0");
  });
});
