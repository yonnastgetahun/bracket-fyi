import { describe, expect, it } from "vitest";

import {
  IDENTITY_NORMALIZATION_VERSION,
  normalizeIdentityText,
} from "@/lib/ingestion/identity/normalize";

describe("identity normalization v1", () => {
  it("normalizes Unicode compatibility forms, punctuation, whitespace, and case", () => {
    expect(normalizeIdentityText("  ＡＣ Milan’s—  derby\u00a0team  ", "en-US")).toBe(
      "ac milan's derby team",
    );
  });

  it("preserves letters, numbers, and diacritics", () => {
    expect(normalizeIdentityText("São Tomé 2 — Équipe", "pt-BR")).toBe("são tomé 2 équipe");
  });

  it("requires an explicit valid BCP-47 locale", () => {
    expect(() => normalizeIdentityText("Team", "")).toThrow();
    expect(() => normalizeIdentityText("Team", "not a locale")).toThrow();
    expect(normalizeIdentityText("Iİ", "tr")).toBe("ıi");
  });

  it("exposes a version that can be persisted with automatic mappings", () => {
    expect(IDENTITY_NORMALIZATION_VERSION).toBe("identity-normalization-v1");
  });
});
