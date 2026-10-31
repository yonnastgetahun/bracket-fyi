import { fetchJsonBounded } from "@/lib/ingestion/providers/http";
import { ProviderAdapterError } from "@/lib/ingestion/errors";

type FetchLike = typeof fetch;
export type OscarMode = "manual" | "provider";
export interface FetchOscarPageInput {
  mode: OscarMode;
  year: number;
  ceremonyIds: number[];
  categoryIds: number[];
  page: number;
  fetch?: FetchLike;
}
export type OscarSafeRow = Record<string, string | number | boolean | null> & { disposition: "provisional" | "quarantined" };
export interface OscarSafePage { data: OscarSafeRow[]; total: number; page: number; totalPages: number; nextPage?: number }

const ENDPOINT = "https://api.oscarbase.com/api/nominations";
const FIELDS = ["id", "ceremony_id", "ceremony_year", "category_id", "category", "movie_id", "movie", "nominee_id", "nominee", "song_id", "song_title", "is_song", "winner"] as const;
const fail = (message: string) => new ProviderAdapterError({ code: "invalid_response", retry: "never", message, details: {} });
const obj = (value: unknown): Record<string, unknown> | undefined => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const validId = (value: unknown): value is string | number => typeof value === "string" && value.trim().length > 0 || typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const validOptionalScalar = (value: unknown, kind: "text" | "id" | "boolean"): boolean => value === null || (kind === "text" ? typeof value === "string" : kind === "id" ? validId(value) : typeof value === "boolean");

export async function fetchOscarPage(input: FetchOscarPageInput): Promise<OscarSafePage> {
  if (input.mode !== "manual" && input.mode !== "provider") throw fail("Oscarbase mode is invalid");
  if (input.mode === "manual") return { data: [], total: 0, page: input.page, totalPages: 0 };
  if (!Number.isInteger(input.year) || input.year < 1900 || input.year > 2200 || !Number.isSafeInteger(input.page) || input.page < 1 || input.page > 1_000_000 || !validSelection(input.ceremonyIds) || !validSelection(input.categoryIds)) throw fail("Oscarbase selection or page is invalid");
  if (!input.fetch) throw fail("Oscarbase fetch is unavailable");
  const url = new URL(ENDPOINT);
  url.searchParams.set("year", String(input.year));
  url.searchParams.set("ceremony_ids", input.ceremonyIds.join(","));
  url.searchParams.set("category_ids", input.categoryIds.join(","));
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("limit", "100");
  const { body } = await fetchJsonBounded(input.fetch, url, { method: "GET", headers: { Accept: "application/json" } }, { timeoutMs: 25_000, maxBytes: 2 * 1024 * 1024 });
  const envelope = obj(body);
  if (!envelope || !Array.isArray(envelope.data) || !integer(envelope.total) || !integer(envelope.page) || !integer(envelope.totalPages) || envelope.total > 10_000_000 || envelope.totalPages > 1_000_000 || envelope.page !== input.page || (envelope.total === 0 ? envelope.totalPages !== 0 : envelope.totalPages < 1 || envelope.totalPages > envelope.total)) throw fail("Oscarbase response pagination is invalid");
  // Empty results use page=1/totalPages=0. Sparse pages remain allowed:
  // the 100-row limit is a ceiling, not a promise of full page occupancy.
  if (envelope.data.length > 100 || envelope.data.length > envelope.total ||
      (envelope.total === 0 ? envelope.page !== 1 || envelope.data.length !== 0 :
        envelope.page > envelope.totalPages || envelope.total > envelope.totalPages * 100)) throw fail("Oscarbase response counts are inconsistent");
  const data = envelope.data.map(value => projectRow(value, input));
  const counts = new Map<string, number>();
  for (const row of data) counts.set(String(row.id), (counts.get(String(row.id)) ?? 0) + 1);
  for (const row of data) if (counts.get(String(row.id))! > 1) row.disposition = "quarantined";
  const totalPages = envelope.totalPages;
  return { data, total: envelope.total, page: envelope.page, totalPages, ...(envelope.page < totalPages ? { nextPage: envelope.page + 1 } : {}) };
}

function projectRow(value: unknown, input: FetchOscarPageInput): OscarSafeRow {
  const source = obj(value);
  if (!source) throw fail("Oscarbase nomination row is invalid");
  const required: Array<keyof typeof source> = ["id", "ceremony_id", "ceremony_year", "category_id"];
  if (required.some(key => !validId(source[key])) || typeof source.ceremony_year !== "number" || !Number.isSafeInteger(source.ceremony_year)) throw fail("Oscarbase nomination identity is invalid");
  const types: Record<(typeof FIELDS)[number], "id" | "text" | "boolean"> = {
    id: "id", ceremony_id: "id", ceremony_year: "id", category_id: "id", category: "text", movie_id: "id", movie: "text", nominee_id: "id", nominee: "text", song_id: "id", song_title: "text", is_song: "boolean", winner: "boolean",
  };
  const result: Record<string, string | number | boolean | null> = {};
  for (const field of FIELDS) {
    if (!Object.hasOwn(source, field)) continue;
    if (!validOptionalScalar(source[field], types[field])) throw fail(`Oscarbase nomination field ${field} has an invalid type`);
    result[field] = source[field] as string | number | boolean | null;
  }
  if (!Object.hasOwn(source, "winner") || typeof source.winner !== "boolean") throw fail("Oscarbase winner field is invalid");
  const matches = source.ceremony_year === input.year && input.ceremonyIds.includes(Number(source.ceremony_id)) && input.categoryIds.includes(Number(source.category_id));
  return { ...result, disposition: matches ? "provisional" : "quarantined" };
}
function validSelection(values: number[]): boolean { return Array.isArray(values) && values.length > 0 && values.length <= 100 && values.every(value => Number.isSafeInteger(value) && value >= 0) && new Set(values).size === values.length; }
function integer(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
