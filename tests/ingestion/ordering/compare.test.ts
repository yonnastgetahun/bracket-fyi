import { describe, expect, it } from "vitest";

import {
  compareContestLifecycleOrdering,
  compareResultOrdering,
  type ResultOrderingState,
} from "@/lib/ingestion/ordering/compare";

const result = (overrides: Partial<ResultOrderingState["normalizedResult"]> = {}) => ({
  eventEditionExternalId: "edition-1",
  contestExternalId: "contest-1",
  resultStatus: "provisional" as const,
  outcomeType: "pending" as const,
  resultData: { score: 0 },
  ...overrides,
});

const state = (overrides: Partial<ResultOrderingState> = {}): ResultOrderingState => ({
  normalizedResult: result(),
  sourceObservationId: "observation-1",
  observedAt: "2026-10-08T17:00:00Z",
  receivedAt: "2026-10-08T17:01:00Z",
  semanticKey: "semantic-1",
  ...overrides,
});

describe("separate contest lifecycle and result ordering", () => {
  it("projects an initial result and valid newer lifecycle states", () => {
    expect(compareResultOrdering({ incoming: state(), explicitCorrection: false })).toMatchObject({ decision: "project" });
    expect(compareContestLifecycleOrdering({
      current: { status: "scheduled", observedAt: "2026-10-08T17:00:00Z" },
      incoming: { status: "live", observedAt: "2026-10-08T18:00:00Z" },
    })).toMatchObject({ decision: "project" });
  });

  it("returns no-op for exact semantic replay and ignores older updates", () => {
    expect(compareResultOrdering({ current: state(), incoming: state(), explicitCorrection: false })).toMatchObject({ decision: "no_op_duplicate" });
    expect(compareResultOrdering({
      current: state({ providerUpdatedAt: "2026-10-08T18:00:00Z" }),
      incoming: state({ providerUpdatedAt: "2026-10-08T17:00:00Z", semanticKey: "older" }),
      explicitCorrection: false,
    })).toMatchObject({ decision: "ignore_older" });
  });

  it("rejects missing timestamp replacement of a terminal result", () => {
    expect(compareResultOrdering({
      current: state({
        normalizedResult: result({ resultStatus: "final", outcomeType: "draw", resultData: { score: 2 } }),
        providerEffectiveAt: "2026-10-08T18:00:00Z",
        semanticKey: "terminal",
      }),
      incoming: state({
        normalizedResult: result({ resultStatus: "final", outcomeType: "draw", resultData: { score: 3 } }),
        providerEffectiveAt: undefined,
        providerUpdatedAt: undefined,
        semanticKey: "changed",
      }),
      explicitCorrection: false,
    })).toMatchObject({ decision: "quarantine_terminal_conflict" });
  });

  it("quarantines equal-timestamp terminal changes and does not lexically order revisions", () => {
    expect(compareResultOrdering({
      current: state({
        normalizedResult: result({ resultStatus: "final", outcomeType: "draw" }),
        providerUpdatedAt: "2026-10-08T18:00:00Z",
        providerRevision: "10",
        semanticKey: "terminal-a",
      }),
      incoming: state({
        normalizedResult: result({ resultStatus: "final", outcomeType: "draw", resultData: { score: 1 } }),
        providerUpdatedAt: "2026-10-08T18:00:00Z",
        providerRevision: "2",
        semanticKey: "terminal-b",
      }),
      explicitCorrection: false,
    })).toMatchObject({ decision: "quarantine_terminal_conflict" });
  });

  it("accepts only a newer explicit terminal correction", () => {
    const input = {
      current: state({
        normalizedResult: result({ resultStatus: "final", outcomeType: "winner", winnerEventEntryExternalId: "entry-1" }),
        providerEffectiveAt: "2026-10-08T18:00:00Z",
        semanticKey: "old-terminal",
      }),
      incoming: state({
        normalizedResult: result({
          resultStatus: "final",
          outcomeType: "winner",
          winnerEventEntryExternalId: "entry-2",
          correctionReason: "Synthetic correction",
        }),
        providerEffectiveAt: "2026-10-08T19:00:00Z",
        correctionProvenance: "synthetic-operator",
        semanticKey: "corrected-terminal",
      }),
      explicitCorrection: true,
      bindingAllowsTrustedCorrections: true,
    } as const;
    expect(compareResultOrdering(input)).toMatchObject({ decision: "project", correctionReasonRequired: false });
    expect(compareResultOrdering({ ...input, explicitCorrection: false })).toMatchObject({ decision: "quarantine_terminal_conflict" });
  });

  it.each([
    ["final"],
    ["awarded"],
    ["canceled"],
    ["void"],
  ] as const)("requires correction provenance and binding permission for %s -> unresolved", (terminalStatus) => {
    const current = state({
      normalizedResult: result({ resultStatus: terminalStatus, outcomeType: terminalStatus === "awarded" ? "winner" : terminalStatus === "final" ? "draw" : "no_contest" }),
      providerEffectiveAt: "2026-10-08T18:00:00Z",
      semanticKey: `${terminalStatus}-current`,
    });
    const incoming = state({
      normalizedResult: result({ resultStatus: "unresolved", outcomeType: "pending", correctionReason: "operator correction" }),
      providerEffectiveAt: "2026-10-08T19:00:00Z",
      semanticKey: `${terminalStatus}-unresolved`,
      correctionProvenance: "synthetic-operator",
    });

    expect(compareResultOrdering({ current, incoming, explicitCorrection: true, bindingAllowsTrustedCorrections: true })).toMatchObject({ decision: "project" });
    expect(compareResultOrdering({ current, incoming: { ...incoming, correctionProvenance: undefined }, explicitCorrection: true })).toMatchObject({ decision: "quarantine_terminal_conflict" });
    expect(compareResultOrdering({ current, incoming, explicitCorrection: true, bindingAllowsTrustedCorrections: false })).toMatchObject({ decision: "quarantine_terminal_conflict" });
  });

  it.each([
    ["final", { resultStatus: "final", outcomeType: "draw" }],
    ["awarded", { resultStatus: "awarded", outcomeType: "winner", winnerEventEntryExternalId: "entry-1" }],
    ["canceled", { resultStatus: "canceled", outcomeType: "no_contest" }],
    ["void", { resultStatus: "void", outcomeType: "no_contest" }],
  ] as const)("keeps %s-to-provisional illegal before stale ordering", (_terminalStatus, terminalResult) => {
    for (const incomingProviderUpdatedAt of [
      "2026-10-08T17:00:00Z",
      "2026-10-08T18:00:00Z",
      "2026-10-08T19:00:00Z",
    ]) {
      expect(compareResultOrdering({
        current: state({ normalizedResult: result(terminalResult), providerEffectiveAt: "2026-10-08T18:00:00Z" }),
        incoming: state({ normalizedResult: result({ resultStatus: "provisional", outcomeType: "pending", correctionReason: "correction" }), providerEffectiveAt: incomingProviderUpdatedAt, correctionProvenance: "synthetic-operator", semanticKey: `provisional-${incomingProviderUpdatedAt}` }),
        explicitCorrection: true,
        bindingAllowsTrustedCorrections: true,
      })).toMatchObject({ decision: "quarantine_regression" });
    }
  });

  it("separately rejects an illegal contest lifecycle regression", () => {
    expect(compareContestLifecycleOrdering({
      current: { status: "final", observedAt: "2026-10-08T19:00:00Z" },
      incoming: { status: "live", observedAt: "2026-10-08T20:00:00Z" },
    })).toMatchObject({ decision: "quarantine_regression" });
  });
});
