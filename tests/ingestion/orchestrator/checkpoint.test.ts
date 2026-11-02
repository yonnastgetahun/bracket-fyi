import { describe, expect, it } from "vitest";

import { decideCheckpoint, type CheckpointInput } from "@/lib/ingestion/orchestrator/checkpoint";

describe("decideCheckpoint", () => {
  const complete = (overrides: Record<string, unknown> = {}) => ({
    transportSucceeded: true,
    pageValid: true,
    observationsTerminal: true,
    pageWasNotModified: false,
    validPartialPage: false,
    repeatedCursor: false,
    ...overrides,
  }) as CheckpointInput;

  it("advances the first complete page without inventing a cursor", () => {
    expect(decideCheckpoint(complete())).toEqual({
      advance: true,
      reason: "page_consumed",
    });
  });

  it("advances to a supplied cursor and replaces the ETag", () => {
    expect(
      decideCheckpoint(
        complete({
          currentCursor: { page: 1 },
          currentEtag: "old",
          nextCursor: { page: 2 },
          responseEtag: "new",
        }),
      ),
    ).toEqual({
      advance: true,
      cursorAfter: { page: 2 },
      etag: "new",
      reason: "page_consumed",
    });
  });

  it("preserves the current cursor and ETag for an empty or final page", () => {
    expect(
      decideCheckpoint(complete({ currentCursor: { page: 1 }, currentEtag: "old" })),
    ).toEqual({
      advance: true,
      cursorAfter: { page: 1 },
      etag: "old",
      reason: "page_consumed",
    });
  });

  it("preserves the current ETag when the response omits one", () => {
    expect(
      decideCheckpoint(complete({ currentCursor: { page: 1 }, currentEtag: "old", nextCursor: { page: 2 } })),
    ).toEqual({
      advance: true,
      cursorAfter: { page: 2 },
      etag: "old",
      reason: "page_consumed",
    });
  });

  it("accepts a valid terminal partial page", () => {
    expect(decideCheckpoint(complete({ nextCursor: { page: 2 }, validPartialPage: true }))).toEqual({
      advance: true,
      cursorAfter: { page: 2 },
      reason: "partial_page",
    });
  });

  it("holds the checkpoint for transport failure or nonterminal observations", () => {
    expect(decideCheckpoint(complete({ transportSucceeded: false }))).toEqual({
      advance: false,
      reason: "retryable_failure",
    });
    expect(decideCheckpoint(complete({ observationsTerminal: false }))).toEqual({
      advance: false,
      reason: "retryable_failure",
    });
  });

  it("rejects an invalid page and a repeated cursor", () => {
    expect(decideCheckpoint(complete({ pageValid: false }))).toEqual({
      advance: false,
      reason: "invalid_page",
    });
    expect(decideCheckpoint(complete({ nextCursor: { page: 1 }, repeatedCursor: true }))).toEqual({
      advance: false,
      reason: "repeated_cursor",
    });
  });

  it("rejects malformed cursor JSON and contradictory flags", () => {
    expect(decideCheckpoint(complete({ currentCursor: [] }) as never)).toEqual({
      advance: false,
      reason: "invalid_page",
    });
    expect(decideCheckpoint(complete({ pageWasNotModified: true, validPartialPage: true }))).toEqual({
      advance: false,
      reason: "invalid_page",
    });
    expect(decideCheckpoint(complete({ pageWasNotModified: true, nextCursor: { page: 2 } }))).toEqual({
      advance: false,
      reason: "invalid_page",
    });
  });

  it("accepts a successful not-modified page without changing the cursor", () => {
    expect(
      decideCheckpoint(
        complete({ currentCursor: { page: 1 }, currentEtag: "old", pageWasNotModified: true, responseEtag: "new" }),
      ),
    ).toEqual({
      advance: true,
      cursorAfter: { page: 1 },
      etag: "new",
      reason: "not_modified",
    });
  });

  it("rejects unknown and Last-Modified fields", () => {
    expect(decideCheckpoint(complete({ lastModified: "yesterday" }) as never)).toEqual({
      advance: false,
      reason: "invalid_page",
    });
  });

  it("accepts ordinary quoted and weak ETags but rejects unsafe or oversized values", () => {
    expect(decideCheckpoint(complete({ responseEtag: '"quoted"' })).etag).toBe('"quoted"');
    expect(decideCheckpoint(complete({ responseEtag: 'W/"weak"' })).etag).toBe('W/"weak"');
    for (const responseEtag of ["   ", "etag\rvalue", "etag\nvalue", "etag\u0000value", "etag\tvalue", "etag\u0001value"]) {
      expect(decideCheckpoint(complete({ responseEtag }))).toEqual({
        advance: false,
        reason: "invalid_page",
      });
    }
    expect(decideCheckpoint(complete({ responseEtag: "e".repeat(1024) })).etag).toBe("e".repeat(1024));
    expect(decideCheckpoint(complete({ responseEtag: "e".repeat(1025) }))).toEqual({
      advance: false,
      reason: "invalid_page",
    });
    expect(decideCheckpoint(complete({ responseEtag: ` ${"e".repeat(1024)} ` }))).toEqual({
      advance: false,
      reason: "invalid_page",
    });
  });

  it("does not mutate input objects", () => {
    const input = complete({
      currentCursor: { nested: { page: 1 } },
      nextCursor: { nested: { page: 2 } },
      responseEtag: "next",
    });
    const before = structuredClone(input);
    decideCheckpoint(input);
    expect(input).toEqual(before);
  });
});
