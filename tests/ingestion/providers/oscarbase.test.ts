import { describe, expect, it, vi } from "vitest";
import { fetchOscarPage } from "@/lib/ingestion/providers/oscarbase";

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 11, ceremony_id: 4, ceremony_year: 2027, category_id: 9,
  category: "Best Synthetic Picture", movie_id: 22, movie: "Synthetic Film",
  nominee_id: 33, nominee: "Invented Person", song_id: null, song_title: null,
  is_song: false, winner: true, secret: "DO-NOT-KEEP", ...overrides,
});
const response = (data: unknown[], meta: Record<string, unknown> = { total: 2, page: 1, totalPages: 2 }) => new Response(JSON.stringify({ data, ...meta }));
const base = { mode: "provider" as const, year: 2027, ceremonyIds: [4], categoryIds: [9], page: 1 };

describe("OSC-READ bounded synthetic transport", () => {
  it("uses only the fixed endpoint and selected allowlisted query, returning safe provisional evidence", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response([row()]));
    const result = await fetchOscarPage({ ...base, fetch: fetch as typeof globalThis.fetch });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [target, init] = fetch.mock.calls[0]!;
    const url = new URL(String(target));
    expect(url.origin).toBe("https://api.oscarbase.com");
    expect(url.pathname).toBe("/api/nominations");
    expect([...url.searchParams.keys()].sort()).toEqual(["category_ids", "ceremony_ids", "limit", "page", "year"]);
    expect(url.searchParams.get("year")).toBe("2027");
    expect(url.searchParams.get("ceremony_ids")).toBe("4");
    expect(url.searchParams.get("category_ids")).toBe("9");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("limit")).toBe("100");
    expect((init as RequestInit).method).toBe("GET");
    expect(result.data[0]).toMatchObject({ id: 11, disposition: "provisional", winner: true });
    const losing = await fetchOscarPage({ ...base, fetch: (async () => response([row({ winner: false })])) as typeof globalThis.fetch });
    expect(losing.data[0]).toMatchObject({ disposition: "provisional", winner: false });
    expect(JSON.stringify(result)).not.toContain("DO-NOT-KEEP");
    expect(result.nextPage).toBe(2);
  });

  it("strips unexpected values and rejects nested objects under scalar allowlisted fields", async () => {
    const safe = await fetchOscarPage({ ...base, fetch: (async () => response([row({ category_group: "ignored" })])) as typeof globalThis.fetch });
    expect(JSON.stringify(safe)).not.toContain("category_group");
    await expect(fetchOscarPage({ ...base, fetch: (async () => response([row({ movie: { token: "sentinel" } })])) as typeof globalThis.fetch })).rejects.toThrow();
  });

  it("holds identity mismatches and duplicates, without merging by credited entity", async () => {
    const mismatch = await fetchOscarPage({ ...base, fetch: (async () => response([row({ ceremony_year: 2026 })])) as typeof globalThis.fetch });
    expect(mismatch.data[0]?.disposition).toBe("quarantined");
    const duplicate = await fetchOscarPage({ ...base, fetch: (async () => response([row(), row({ nominee_id: 34 })])) as typeof globalThis.fetch });
    expect(duplicate.data).toHaveLength(2);
    expect(duplicate.data.every(item => item.disposition === "quarantined")).toBe(true);
  });

  it("requires numeric advancing pagination and valid selected scope; manual mode makes no request", async () => {
    const fetch = vi.fn();
    expect((await fetchOscarPage({ ...base, mode: "manual", fetch: fetch as typeof globalThis.fetch })).data).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    await expect(fetchOscarPage({ ...base, fetch: (async () => response([], { total: 0, page: "1", totalPages: 2 })) as typeof globalThis.fetch })).rejects.toThrow();
    await expect(fetchOscarPage({ ...base, page: 2, fetch: (async () => response([], { total: 0, page: 2, totalPages: 3 })) as typeof globalThis.fetch })).rejects.toThrow();
    await expect(fetchOscarPage({ ...base, categoryIds: [], fetch: fetch as typeof globalThis.fetch })).rejects.toThrow();
  });
});

describe("PS-04 OSC runtime admission", () => {
  it("rejects unsupported runtime modes before fetch", async () => {
    for (const mode of ["typo", "", null, undefined, 0, {}, ["provider"]]) {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => response([], { total: 0, page: 1, totalPages: 0 }));
      await expect(fetchOscarPage({ ...base, mode, fetch } as unknown as Parameters<typeof fetchOscarPage>[0])).rejects.toMatchObject({ failure: { code: "invalid_response" } });
      expect(fetch).not.toHaveBeenCalled();
    }
  });
});

describe("PS-05 OSC pagination coherence", () => {
  it.each([
    { total: 0, page: 1, totalPages: 0, count: 2 },
    { total: 1, page: 1, totalPages: 1, count: 2 },
    { total: 1, page: 3, totalPages: 1, count: 0 },
    { total: 101, page: 1, totalPages: 2, count: 101 },
    { total: 0, page: 2, totalPages: 0, count: 0 },
    { total: 201, page: 1, totalPages: 2, count: 1 },
  ])("rejects contradictory/beyond-limit envelope $total/$page/$totalPages/$count", async ({ total, page, totalPages, count }) => {
    const data = Array.from({ length: count }, (_, i) => row({ id: 900 + i, winner: false }));
    await expect(fetchOscarPage({ ...base, page,
      fetch: async () => response(data, { total, page, totalPages }),
    })).rejects.toMatchObject({ failure: { code: "invalid_response" } });
  });

  it.each([
    { total: 0, page: 1, totalPages: 0, count: 0, nextPage: undefined },
    { total: 1, page: 1, totalPages: 1, count: 1, nextPage: undefined },
    { total: 2, page: 1, totalPages: 2, count: 1, nextPage: 2 },
    { total: 2, page: 2, totalPages: 2, count: 1, nextPage: undefined },
    { total: 100, page: 1, totalPages: 1, count: 100, nextPage: undefined },
  ])("preserves empty/sparse/terminal provisional control $total/$page/$totalPages", async ({ total, page, totalPages, count, nextPage }) => {
    const data = Array.from({ length: count }, (_, i) => row({ id: 1200 + i, winner: i % 2 === 0 }));
    const result = await fetchOscarPage({ ...base, page, fetch: async () => response(data, { total, page, totalPages }) });
    expect(result).toMatchObject({ total, page, totalPages });
    expect(result.data).toHaveLength(count);
    expect(result.data.every(item => item.disposition === "provisional")).toBe(true);
    expect(result.nextPage).toBe(nextPage);
    if (nextPage === undefined) expect(result).not.toHaveProperty("nextPage");
  });
});
