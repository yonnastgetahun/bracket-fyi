import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Cookie names — one per token type, path-scoped to /l/[league_id]
const COOKIE_PARTICIPANT = "bfyi_participant";
const COOKIE_LEAGUE = "bfyi_league";
const COOKIE_ORGANIZER = "bfyi_organizer";

// UUID regex — validates token format before DB lookup
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Edge-safe Supabase client using service role.
// Created per-request (no persistent session in Edge Runtime).
function getEdgeClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Append a request header to the cloned headers for downstream RLS use.
function withHeader(request: NextRequest, key: string, value: string) {
  const headers = new Headers(request.headers);
  headers.set(key, value);
  return headers;
}

// Cookie options: httpOnly, lax, scoped to the specific league path.
function cookieOpts(leagueId: string) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: `/l/${leagueId}`,
  };
}

// ============================================================
// Handler: /l/[id]/p/[magic_token]
// ============================================================
async function handleMagicToken(
  request: NextRequest,
  leagueId: string,
  magicToken: string
): Promise<NextResponse> {
  if (!UUID_RE.test(magicToken) || !UUID_RE.test(leagueId)) {
    return new NextResponse(null, { status: 404 });
  }

  const cookieValue = request.cookies.get(COOKIE_PARTICIPANT)?.value;

  // Second visit: cookie matches → skip DB, set RLS header
  if (cookieValue === `${leagueId}:${magicToken}`) {
    return NextResponse.next({
      request: { headers: withHeader(request, "x-magic-token", magicToken) },
    });
  }

  // First visit: validate against DB
  const { data, error } = await getEdgeClient()
    .from("participants")
    .select("id")
    .eq("magic_token", magicToken)
    .eq("league_id", leagueId)
    .single();

  if (error || !data) {
    return new NextResponse(null, { status: 404 });
  }

  // Valid — set cookie and pass through with RLS header
  const response = NextResponse.next({
    request: { headers: withHeader(request, "x-magic-token", magicToken) },
  });
  response.cookies.set(
    COOKIE_PARTICIPANT,
    `${leagueId}:${magicToken}`,
    cookieOpts(leagueId)
  );
  return response;
}

// ============================================================
// Handler: /l/[id]?join=[join_token]
// ============================================================
async function handleJoinToken(
  request: NextRequest,
  leagueId: string,
  joinToken: string | null
): Promise<NextResponse> {
  if (!UUID_RE.test(leagueId)) {
    return new NextResponse(null, { status: 404 });
  }

  if (joinToken) {
    if (!UUID_RE.test(joinToken)) {
      return new NextResponse(null, { status: 404 });
    }

    // Validate against DB
    const { data, error } = await getEdgeClient()
      .from("leagues")
      .select("id")
      .eq("join_token", joinToken)
      .eq("id", leagueId)
      .single();

    if (error || !data) {
      return new NextResponse(null, { status: 404 });
    }

    // Valid — strip token from URL, set cookie, redirect to clean URL
    const cleanUrl = new URL(request.url);
    cleanUrl.searchParams.delete("join");
    const response = NextResponse.redirect(cleanUrl);
    response.cookies.set(
      COOKIE_LEAGUE,
      `${leagueId}:${joinToken}`,
      cookieOpts(leagueId)
    );
    return response;
  }

  // No token in URL — check cookie
  const cookieValue = request.cookies.get(COOKIE_LEAGUE)?.value;
  if (cookieValue?.startsWith(`${leagueId}:`)) {
    const token = cookieValue.split(":").slice(1).join(":");
    return NextResponse.next({
      request: { headers: withHeader(request, "x-league-token", token) },
    });
  }

  // No credentials — pass through without league context (page renders in limited mode)
  return NextResponse.next();
}

// ============================================================
// Handler: /l/[id]/admin
// ============================================================
async function handleOrganizerToken(
  request: NextRequest,
  leagueId: string,
  organizerToken: string | null
): Promise<NextResponse> {
  if (!UUID_RE.test(leagueId)) {
    return new NextResponse(null, { status: 404 });
  }

  if (organizerToken) {
    if (!UUID_RE.test(organizerToken)) {
      return new NextResponse(null, { status: 403 });
    }

    // Validate against DB
    const { data, error } = await getEdgeClient()
      .from("leagues")
      .select("id")
      .eq("organizer_token", organizerToken)
      .eq("id", leagueId)
      .single();

    if (error || !data) {
      return new NextResponse(null, { status: 403 });
    }

    // Valid — strip token from URL, set cookie, redirect to clean URL
    const cleanUrl = new URL(request.url);
    cleanUrl.searchParams.delete("token");
    const response = NextResponse.redirect(cleanUrl);
    response.cookies.set(
      COOKIE_ORGANIZER,
      `${leagueId}:${organizerToken}`,
      cookieOpts(leagueId)
    );
    return response;
  }

  // No token in URL — check cookie
  const cookieValue = request.cookies.get(COOKIE_ORGANIZER)?.value;
  if (cookieValue?.startsWith(`${leagueId}:`)) {
    const token = cookieValue.split(":").slice(1).join(":");
    return NextResponse.next({
      request: { headers: withHeader(request, "x-organizer-token", token) },
    });
  }

  // No organizer credentials — 403
  return new NextResponse(null, { status: 403 });
}

// ============================================================
// Main middleware
// ============================================================
export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Extract league_id from /l/[league_id]/...
  const leagueMatch = pathname.match(
    /^\/l\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/.*)?$/i
  );
  if (!leagueMatch) return NextResponse.next();

  const leagueId = leagueMatch[1];
  const subPath = leagueMatch[2] || "";

  // /l/[id]/p/[magic_token]
  const magicMatch = subPath.match(
    /^\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i
  );
  if (magicMatch) {
    return handleMagicToken(request, leagueId, magicMatch[1]);
  }

  // /l/[id]/admin
  if (subPath.startsWith("/admin")) {
    return handleOrganizerToken(
      request,
      leagueId,
      searchParams.get("token")
    );
  }

  // /l/[id] — join link or returning participant
  return handleJoinToken(request, leagueId, searchParams.get("join"));
}

export const config = {
  matcher: ["/l/:path*"],
};
