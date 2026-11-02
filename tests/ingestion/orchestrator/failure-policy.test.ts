import { describe, expect, it } from "vitest";

import {
  classifyFailure,
  sanitizeFailure,
  type FailurePolicyDecision,
} from "@/lib/ingestion/orchestrator/failure-policy";
import { providerFailureCodes, type ProviderFailure, type ProviderFailureCode } from "@/lib/ingestion/errors";

const retryableCodes = new Set<ProviderFailureCode>(["timeout", "network", "provider_server", "rate_limited"]);

const failure = (code: ProviderFailureCode): ProviderFailure => ({
  code,
  retry: code === "rate_limited" ? "provider_reset" : ["timeout", "network", "provider_server"].includes(code) ? "backoff" : "never",
  message: "Synthetic failure",
  details: { fixture: true },
});

describe("provider failure policy", () => {
  it.each(providerFailureCodes)("classifies every Slice 2A code: %s", (code) => {
    const decision: FailurePolicyDecision = classifyFailure(failure(code));

    expect(decision.code).toBe(code);
    expect(decision.retryable).toBe(retryableCodes.has(code));
    expect(decision.retryStrategy).toBe(
      code === "rate_limited" ? "provider_reset" : retryableCodes.has(code) ? "backoff" : "never",
    );
  });

  it("strictly validates and bounds sanitized failure fields", () => {
    const secret = "credential-secret-sentinel";
    const sanitized = sanitizeFailure({
      ...failure("invalid_response"),
      message: `  line one\nline two ${"x".repeat(800)} `,
      details: {
        safe: "  retained  value ",
        authorization: `Bearer ${secret}`,
        nested: { token: secret, payload: { raw: secret } },
      },
    });

    expect(sanitized.message.length).toBeLessThanOrEqual(512);
    expect(sanitized.message).not.toContain("\n");
    expect(sanitized.details).toMatchObject({
      safe: "retained value",
      authorization: "[redacted]",
      nested: { token: "[redacted]", payload: "[redacted]" },
    });
    expect(JSON.stringify(sanitized)).not.toContain(secret);
  });

  it("preserves safe bounded metadata and status", () => {
    expect(sanitizeFailure({
      ...failure("provider_server"),
      httpStatus: 503,
      retryAt: "2026-10-08T18:00:00-07:00",
      details: { status: 503, attempt: 2 },
    })).toEqual({
      code: "provider_server",
      retry: "backoff",
      message: "Synthetic failure",
      httpStatus: 503,
      retryAt: "2026-10-08T18:00:00-07:00",
      details: { status: 503, attempt: 2 },
    });
  });

  it("rejects malformed or unexpected failure fields", () => {
    expect(() => sanitizeFailure({ ...failure("timeout"), unexpected: true })).toThrow();
    expect(() => sanitizeFailure({ ...failure("timeout"), details: "raw response" })).toThrow();
    expect(() => sanitizeFailure({ ...failure("timeout"), message: "   " })).toThrow();
  });
});
