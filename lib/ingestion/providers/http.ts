import { ProviderAdapterError, isProviderAdapterError } from "@/lib/ingestion/errors";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function fetchJsonBounded(
  fetchImpl: FetchLike,
  url: URL,
  init: RequestInit,
  options: { timeoutMs: number; maxBytes: number },
): Promise<{ response: Response; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetchImpl(url, { ...init, signal: controller.signal, redirect: "error" });
    } catch {
      throw new ProviderAdapterError({ code: controller.signal.aborted ? "timeout" : "network", retry: "backoff", message: controller.signal.aborted ? "Provider request timed out" : "Provider request failed", details: {} });
    }
    if (!response.ok) {
      const status = response.status;
      const code = status === 401 ? "authentication" : status === 403 ? "authorization" : status === 404 ? "not_found" : status === 429 ? "rate_limited" : status >= 500 ? "provider_server" : "permanent";
      const retry = code === "rate_limited" ? "provider_reset" : code === "provider_server" ? "backoff" : "never";
      throw new ProviderAdapterError({ code, retry, message: "Football-data request was rejected", httpStatus: status, details: {} });
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) throw invalidResponse("Provider response exceeded the size limit");
    if (!response.body) throw invalidResponse("Provider response body was empty");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        if (controller.signal.aborted) throw timeoutError();
        let abortListener: (() => void) | undefined;
        const read = reader.read();
        const aborted = new Promise<never>((_, reject) => {
          abortListener = () => { void reader.cancel(); reject(timeoutError()); };
          controller.signal.addEventListener("abort", abortListener, { once: true });
        });
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try { chunk = await Promise.race([read, aborted]); }
        finally { if (abortListener) controller.signal.removeEventListener("abort", abortListener); }
        const { done, value } = chunk;
        if (done) break;
        size += value.byteLength;
        if (size > options.maxBytes) {
          await reader.cancel();
          throw invalidResponse("Provider response exceeded the size limit");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    if (controller.signal.aborted) throw timeoutError();
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw invalidResponse("Provider response was not valid UTF-8"); }
    try { return { response, body: JSON.parse(text) as unknown }; }
    catch { throw invalidResponse("Provider response was not valid JSON"); }
  } catch (error) {
    if (isProviderAdapterError(error)) throw error;
    throw new ProviderAdapterError({ code: controller.signal.aborted ? "timeout" : "network", retry: "backoff", message: controller.signal.aborted ? "Provider request timed out" : "Provider response could not be read", details: {} });
  } finally {
    clearTimeout(timer);
  }
}

const timeoutError = () => new ProviderAdapterError({ code: "timeout", retry: "backoff", message: "Provider request timed out", details: {} });
const invalidResponse = (message: string) => new ProviderAdapterError({ code: "invalid_response", retry: "never", message, details: {} });
