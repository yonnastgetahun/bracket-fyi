import { NextRequest, NextResponse } from "next/server";

const DEFAULT_MAX_BYTES = 16 * 1024;

export type JsonBodyResult<T> =
  | { ok: true; body: T }
  | { ok: false; response: NextResponse };

export async function readJsonObject<T extends object>(
  request: NextRequest,
  maxBytes = DEFAULT_MAX_BYTES
): Promise<JsonBodyResult<T>> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Request body too large" },
        { status: 413 }
      ),
    };
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
    };
  }

  if (new TextEncoder().encode(rawBody).byteLength > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Request body too large" },
        { status: 413 }
      ),
    };
  }

  try {
    const body: unknown = JSON.parse(rawBody);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new TypeError("Expected a JSON object");
    }
    return { ok: true, body: body as T };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
    };
  }
}
