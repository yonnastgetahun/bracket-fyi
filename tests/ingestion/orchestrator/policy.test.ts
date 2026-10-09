import { describe, expect, it } from "vitest";

import { isBindingDue, nextPollAt } from "@/lib/ingestion/orchestrator/policy";
import type { DueBindingInput, PollPhase } from "@/lib/ingestion/orchestrator/types";

const phases: readonly [PollPhase, keyof Pick<DueBindingInput, "idleSeconds" | "pregameSeconds" | "liveSeconds" | "postgameSeconds">][] = [
  ["distant", "idleSeconds"],
  ["pregame", "pregameSeconds"],
  ["live", "liveSeconds"],
  ["postgame", "postgameSeconds"],
];

const binding = (overrides: Partial<DueBindingInput> = {}): DueBindingInput => ({
  mode: "write",
  phase: "live",
  idleSeconds: 300,
  pregameSeconds: 60,
  liveSeconds: 30,
  postgameSeconds: 60,
  ...overrides,
});

describe("phase-based polling policy", () => {
  it.each(phases)("uses the %s interval", (phase, secondsField) => {
    const input = binding({ phase });
    const now = "2026-10-08T17:00:00.000Z";

    expect(nextPollAt(input, now)).toBe(
      new Date(new Date(now).getTime() + input[secondsField] * 1000).toISOString(),
    );
  });

  it("does not schedule complete or disabled bindings", () => {
    const now = "2026-10-08T17:00:00.000Z";

    expect(nextPollAt(binding({ phase: "complete" }), now)).toBeNull();
    expect(nextPollAt(binding({ mode: "disabled" }), now)).toBeNull();
    expect(isBindingDue(binding({ phase: "complete" }), now)).toBe(false);
    expect(isBindingDue(binding({ mode: "disabled" }), now)).toBe(false);
  });

  it("treats an absent next poll as due for active non-complete modes", () => {
    for (const mode of ["shadow", "write"] as const) {
      expect(isBindingDue(binding({ mode, nextPollAt: undefined }), "2026-10-08T17:00:00Z")).toBe(true);
    }
  });

  it("uses an inclusive exact due boundary", () => {
    const input = binding({ nextPollAt: "2026-10-08T17:00:00Z" });

    expect(isBindingDue(input, "2026-10-08T16:59:59.999Z")).toBe(false);
    expect(isBindingDue(input, "2026-10-08T17:00:00Z")).toBe(true);
    expect(isBindingDue(input, "2026-10-08T17:00:00.001Z")).toBe(true);
  });

  it("emits timezone-independent ISO timestamps", () => {
    expect(nextPollAt(binding({ phase: "pregame" }), "2026-10-08T10:00:00-07:00")).toBe(
      "2026-10-08T17:01:00.000Z",
    );
  });
});
