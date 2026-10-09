import { describe, expect, it } from "vitest";

import { parseEventIngestionConfig } from "@/lib/ingestion/config";

const baseConfig = {
  configVersion: 1,
  eventEditionKey: "ucl-2026-27",
  timezone: "Europe/Zurich",
  requiredCapabilities: ["schedule", "live_status", "final_results"],
  providerBinding: {
    providerKey: "synthetic-sports",
    competitionExternalId: "ucl",
    adapterConfigVersion: 1,
    credentialRef: "vault:synthetic/provider",
    adapterConfig: { competition: "synthetic" },
  },
  structure: {
    scoringContestKinds: ["match", "tie"],
    includeStageKeys: ["league-phase", "knockout"],
    completionPolicy: "all_required_contests_terminal",
  },
  pollingPolicy: {
    idleSeconds: 900,
    pregameSeconds: 120,
    liveSeconds: 30,
    postgameSeconds: 300,
    staleAfterSeconds: 3600,
  },
  attribution: {
    displayName: "Synthetic Sports Feed",
    termsUrl: "https://example.test/terms",
    attributionText: "Synthetic fixture data",
  },
  fallbackMode: "manual_and_shadow_provider",
} as const;

describe("event ingestion configuration", () => {
  it("accepts a UCL-style sports configuration", () => {
    expect(parseEventIngestionConfig(baseConfig)).toEqual(baseConfig);
  });

  it("accepts an Oscars-style ceremony configuration", () => {
    expect(parseEventIngestionConfig({
      ...baseConfig,
      eventEditionKey: "oscars-2027",
      timezone: "America/Los_Angeles",
      requiredCapabilities: ["nominations", "ceremony_results"],
      providerBinding: { ...baseConfig.providerBinding, providerKey: "synthetic-ceremony" },
      structure: {
        scoringContestKinds: ["category"],
        includeStageKeys: ["nominations", "ceremony"],
        completionPolicy: "all_required_categories_awarded",
      },
    })).toMatchObject({ eventEditionKey: "oscars-2027", fallbackMode: "manual_and_shadow_provider" });
  });

  it("rejects duplicate or empty capabilities, contest kinds, and stage keys", () => {
    for (const override of [
      { requiredCapabilities: [] },
      { requiredCapabilities: ["schedule", "schedule"] },
      { structure: { ...baseConfig.structure, scoringContestKinds: [] } },
      { structure: { ...baseConfig.structure, scoringContestKinds: ["match", "match"] } },
      { structure: { ...baseConfig.structure, includeStageKeys: [] } },
      { structure: { ...baseConfig.structure, includeStageKeys: ["knockout", "knockout"] } },
    ]) {
      expect(() => parseEventIngestionConfig({ ...baseConfig, ...override })).toThrow();
    }
  });

  it("rejects invalid timezone and polling minima", () => {
    expect(() => parseEventIngestionConfig({ ...baseConfig, timezone: "Mars/Olympus" })).toThrow();
    expect(() => parseEventIngestionConfig({ ...baseConfig, pollingPolicy: { ...baseConfig.pollingPolicy, idleSeconds: 299 } })).toThrow();
    expect(() => parseEventIngestionConfig({ ...baseConfig, pollingPolicy: { ...baseConfig.pollingPolicy, pregameSeconds: 59 } })).toThrow();
    expect(() => parseEventIngestionConfig({ ...baseConfig, pollingPolicy: { ...baseConfig.pollingPolicy, liveSeconds: 29 } })).toThrow();
    expect(() => parseEventIngestionConfig({ ...baseConfig, pollingPolicy: { ...baseConfig.pollingPolicy, postgameSeconds: 59 } })).toThrow();
  });

  it("rejects stale windows shorter than live polling", () => {
    expect(() => parseEventIngestionConfig({
      ...baseConfig,
      pollingPolicy: { ...baseConfig.pollingPolicy, liveSeconds: 600, staleAfterSeconds: 599 },
    })).toThrow();
  });

  it("rejects secret-like unknown fields through strict objects", () => {
    expect(() => parseEventIngestionConfig({ ...baseConfig, apiKey: "secret-sentinel" })).toThrow();
    expect(() => parseEventIngestionConfig({
      ...baseConfig,
      providerBinding: { ...baseConfig.providerBinding, token: "secret-sentinel" },
    })).toThrow();
  });

  it("returns a typed copy without mutating the input", () => {
    const input = structuredClone(baseConfig);
    const parsed = parseEventIngestionConfig(input);
    expect(parsed).not.toBe(input);
    expect(input).toEqual(baseConfig);
    expect(parsed.providerBinding.adapterConfig).toEqual({ competition: "synthetic" });
  });
});
