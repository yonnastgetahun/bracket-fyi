import type { JsonValue } from "@/lib/ingestion/contracts";

const canonicalNumber = (value: number): string => {
  if (!Number.isFinite(value)) throw new TypeError("Canonical JSON accepts finite numbers only");
  return value === 0 ? "0" : value.toString();
};

export function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }

  if (typeof value === "number") return canonicalNumber(value);
  return JSON.stringify(value);
}
