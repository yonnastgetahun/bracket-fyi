import { describe, expect, it } from "vitest";

import {
  providerFailureCodes,
  providerFailureSchema,
  ProviderAdapterError,
  isProviderAdapterError,
} from "@/lib/ingestion/errors";

const baseFailure = {
  message: "Synthetic failure",
  details: { fixture: true },
};

describe("provider failure contracts", () => {
  it("accepts every legal code and retry combination", () => {
    for (const code of providerFailureCodes) {
      const retry = code === "rate_limited" ? "provider_reset" : ["timeout", "network", "provider_server"].includes(code) ? "backoff" : "never";
      expect(providerFailureSchema.parse({ ...baseFailure, code, retry })).toMatchObject({ code, retry });
    }
  });

  it("rejects every illegal code and retry combination", () => {
    for (const code of providerFailureCodes) {
      const expected = code === "rate_limited" ? "provider_reset" : ["timeout", "network", "provider_server"].includes(code) ? "backoff" : "never";
      for (const retry of ["never", "backoff", "provider_reset"] as const) {
        if (retry !== expected) {
          expect(() => providerFailureSchema.parse({ ...baseFailure, code, retry })).toThrow();
        }
      }
    }
  });

  it("validates rate-limited failures with and without retryAt", () => {
    expect(providerFailureSchema.parse({
      ...baseFailure,
      code: "rate_limited",
      retry: "provider_reset",
    })).toBeTruthy();
    expect(providerFailureSchema.parse({
      ...baseFailure,
      code: "rate_limited",
      retry: "provider_reset",
      retryAt: "2026-10-08T18:00:00-07:00",
    })).toBeTruthy();
  });

  it("distinguishes ProviderAdapterError from arbitrary errors", () => {
    const error = new ProviderAdapterError({ ...baseFailure, code: "permanent", retry: "never" }, new Error("raw"));
    expect(isProviderAdapterError(error)).toBe(true);
    expect(isProviderAdapterError(new Error("raw"))).toBe(false);
    expect(error.failure.code).toBe("permanent");
  });

  it("does not serialize a raw cause or credential sentinel", () => {
    const sentinel = "credential-secret-sentinel";
    const error = new ProviderAdapterError({
      code: "invalid_response",
      retry: "never",
      message: "Synthetic invalid response",
      details: { field: "status" },
    }, { authorization: `Bearer ${sentinel}`, payload: sentinel });
    expect(JSON.stringify(error)).not.toContain(sentinel);
    expect(JSON.stringify(error.failure)).not.toContain(sentinel);
  });
});
