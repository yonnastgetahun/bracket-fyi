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

  it("treats absent and null next polls as unscheduled", () => {
    for (const mode of ["shadow", "write"] as const) {
      expect(isBindingDue(binding({ mode, nextPollAt: undefined }), "2026-10-08T17:00:00Z")).toBe(false);
      expect(isBindingDue(binding({ mode, nextPollAt: null as never }), "2026-10-08T17:00:00Z")).toBe(false);
    }
  });

  it.each([
    null,
    [],
    { ...binding(), unexpected: true },
    { ...binding(), mode: "unknown" },
    { ...binding(), phase: "unknown" },
    { ...binding(), liveSeconds: -1 },
    { ...binding(), nextPollAt: "not-a-time" },
  ])("fails closed for malformed policy input: %j", (input) => {
    expect(isBindingDue(input as never, "2026-10-08T17:00:00Z")).toBe(false);
    expect(nextPollAt(input as never, "2026-10-08T17:00:00Z")).toBeNull();
  });

  it("fails closed for malformed now values", () => {
    expect(isBindingDue(binding({ nextPollAt: "2026-10-08T17:00:00Z" }), "not-a-time")).toBe(false);
    expect(nextPollAt(binding(), "not-a-time")).toBeNull();
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

  it("fails closed for hostile policy objects", () => {
    const throwingGet = new Proxy(binding(), { get: () => { throw new Error("blocked"); } });
    const throwingKeys = new Proxy(binding(), { ownKeys: () => { throw new Error("blocked"); } });
    const revoked = Proxy.revocable(binding(), {});
    revoked.revoke();

    for (const input of [throwingGet, throwingKeys, revoked.proxy]) {
      expect(() => isBindingDue(input, "2026-10-08T17:00:00Z")).not.toThrow();
      expect(() => nextPollAt(input, "2026-10-08T17:00:00Z")).not.toThrow();
      expect(isBindingDue(input, "2026-10-08T17:00:00Z")).toBe(false);
      expect(nextPollAt(input, "2026-10-08T17:00:00Z")).toBeNull();
    }
  });

  it("fails closed when interval arithmetic exceeds safe or Date bounds", () => {
    expect(nextPollAt(binding({ liveSeconds: Number.MAX_SAFE_INTEGER }), "2026-10-08T17:00:00Z")).toBeNull();
    expect(nextPollAt(binding({ liveSeconds: 1 }), "+275760-09-12T23:59:59.999Z")).toBeNull();
  });
});
