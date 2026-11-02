import { describe, expect, it, vi } from "vitest";
import { fetchJsonBounded } from "@/lib/ingestion/providers/http";

const url = new URL("https://api.football-data.org/v4/competitions/CL/matches");
const options = { timeoutMs: 10_000, maxBytes: 2 * 1024 * 1024 };

describe("bounded provider HTTP transport", () => {
  it.each([
    [401, "authentication"], [403, "authorization"], [404, "not_found"],
    [429, "rate_limited"], [503, "provider_server"], [400, "permanent"],
  ])("classifies HTTP %i without retaining body/header secrets", async (status, code) => {
    const fetch = vi.fn(async () => new Response("SENTINEL", { status, headers: { "x-private": "SENTINEL" } }));
    let failure;
    try { await fetchJsonBounded(fetch, url, {}, options); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ failure: { code, httpStatus: status } });
    expect(JSON.stringify(failure)).not.toContain("SENTINEL");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("makes one injected call with redirect rejection and parses JSON", async () => {
    const fetch = vi.fn(async () => new Response('{"matches":[]}'));
    await expect(fetchJsonBounded(fetch, url, {}, options)).resolves.toMatchObject({ body: { matches: [] } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toEqual([url, expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) })]);
  });

  it.each([
    () => new Response("{}", { headers: { "content-length": String(options.maxBytes + 1) } }),
    () => new Response("x".repeat(options.maxBytes + 1)),
    () => new Response(new Uint8Array([0xff])),
    () => new Response("{invalid"),
  ])("rejects oversized, malformed UTF-8 or JSON %#", async makeResponse => {
    await expect(fetchJsonBounded(async () => makeResponse(), url, {}, options)).rejects.toMatchObject({ failure: { code: "invalid_response" } });
  });

  it("bounds fetch and body consumption using the same timeout", async () => {
    const fetch = vi.fn((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("SENTINEL")));
    }));
    await expect(fetchJsonBounded(fetch, url, {}, { ...options, timeoutMs: 5 })).rejects.toMatchObject({ failure: { code: "timeout" } });
    const body = new Response(new ReadableStream<Uint8Array>({ start() {} }));
    await expect(fetchJsonBounded(async () => body, url, {}, { ...options, timeoutMs: 5 })).rejects.toMatchObject({ failure: { code: "timeout" } });
  });
});
