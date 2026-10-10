import { describe, expect, it } from "vitest";

import type { CheckpointDecision } from "@/lib/ingestion/orchestrator/checkpoint";
import {
  cursorFingerprint,
  decidePagination,
  isRepeatedCursor,
  MAX_PAGES_PER_RUN,
} from "@/lib/ingestion/orchestrator/pagination";

const consumed: CheckpointDecision = { advance: true, reason: "page_consumed" };

describe("cursor pagination policies", () => {
  it("fingerprints equivalent cursor objects identically", () => {
    expect(cursorFingerprint({ page: 1, filter: { b: true, a: [1, 2] } })).toBe(
      cursorFingerprint({ filter: { a: [1, 2], b: true }, page: 1 }),
    );
  });

  it("detects current and historical cursor repetition", () => {
    const current = { page: 1 };
    const next = { page: 2 };
    expect(isRepeatedCursor({ currentCursor: current, nextCursor: current, seenCursorFingerprints: new Set() })).toBe(
      true,
    );
    expect(
      isRepeatedCursor({
        currentCursor: { page: 3 },
        nextCursor: next,
        seenCursorFingerprints: new Set([cursorFingerprint(next)]),
      }),
    ).toBe(true);
    expect(isRepeatedCursor({ currentCursor: current, seenCursorFingerprints: new Set() })).toBe(false);
  });

  it("continues and completes according to the next cursor", () => {
    expect(decidePagination({ pagesProcessed: 0, checkpoint: consumed, nextCursor: { page: 2 } })).toEqual({
      action: "continue",
      pagesProcessed: 1,
      scheduleImmediately: false,
      reason: "page_consumed",
    });
    expect(decidePagination({ pagesProcessed: 0, checkpoint: consumed })).toEqual({
      action: "complete",
      pagesProcessed: 1,
      scheduleImmediately: false,
      reason: "page_consumed",
    });
  });

  it("holds retryable checkpoints and invalidates bad checkpoints", () => {
    expect(
      decidePagination({
        pagesProcessed: 2,
        checkpoint: { advance: false, reason: "retryable_failure" },
        nextCursor: { page: 3 },
      }),
    ).toEqual({
      action: "hold",
      pagesProcessed: 2,
      scheduleImmediately: false,
      reason: "retryable_failure",
    });
    expect(
      decidePagination({ pagesProcessed: 2, checkpoint: { advance: false, reason: "repeated_cursor" } }),
    ).toEqual({
      action: "invalid",
      pagesProcessed: 2,
      scheduleImmediately: false,
      reason: "repeated_cursor",
    });
    expect(
      decidePagination({ pagesProcessed: 2, checkpoint: { advance: false, reason: "invalid_page" } }),
    ).toEqual({
      action: "invalid",
      pagesProcessed: 2,
      scheduleImmediately: false,
      reason: "invalid_page",
    });
  });

  it("continues through page 25 and yields instead of processing page 26", () => {
    expect(decidePagination({ pagesProcessed: 23, checkpoint: consumed, nextCursor: { page: 25 } })).toEqual({
      action: "continue",
      pagesProcessed: 24,
      scheduleImmediately: false,
      reason: "page_consumed",
    });
    expect(decidePagination({ pagesProcessed: 24, checkpoint: consumed, nextCursor: { page: 26 } })).toEqual({
      action: "yield",
      pagesProcessed: MAX_PAGES_PER_RUN,
      scheduleImmediately: true,
      reason: "page_limit",
    });
    expect(decidePagination({ pagesProcessed: 24, checkpoint: consumed })).toEqual({
      action: "complete",
      pagesProcessed: MAX_PAGES_PER_RUN,
      scheduleImmediately: false,
      reason: "page_consumed",
    });
  });

  it("rejects negative, fractional, unsafe, and over-limit page counts", () => {
    for (const pagesProcessed of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, MAX_PAGES_PER_RUN + 1]) {
      expect(decidePagination({ pagesProcessed, checkpoint: consumed })).toEqual({
        action: "invalid",
        pagesProcessed,
        scheduleImmediately: false,
        reason: "invalid_page",
      });
    }
  });

  it("is deterministic and does not mutate its input", () => {
    const input = { pagesProcessed: 3, checkpoint: consumed, nextCursor: { nested: { page: 4 } } };
    const before = structuredClone(input);
    expect(decidePagination(input)).toEqual(decidePagination(input));
    expect(input).toEqual(before);
  });
});
