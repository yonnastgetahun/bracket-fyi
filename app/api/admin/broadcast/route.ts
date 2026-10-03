import { NextRequest, NextResponse } from "next/server"
import { authorizeOrganizer } from "@/lib/auth/organizer"
import { readJsonObject } from "@/lib/http/json"

export async function POST(request: NextRequest) {
  const parsed = await readJsonObject<{
    leagueId?: unknown
    message?: unknown
  }>(request)
  if (!parsed.ok) return parsed.response

  const { leagueId, message } = parsed.body

  if (typeof leagueId !== "string" || !leagueId) {
    return NextResponse.json({ error: "Missing leagueId" }, { status: 400 })
  }
  if (message !== null && typeof message !== "string") {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 })
  }
  if (typeof message === "string" && message.length > 500) {
    return NextResponse.json(
      { error: "Message must be 500 characters or less" },
      { status: 400 }
    )
  }

  const authorization = await authorizeOrganizer(request, leagueId)
  if (!authorization.ok) return authorization.response

  const { supabase } = authorization

  // Fetch league name for notification title (used in push fanout below)
  const { data: league } = await supabase
    .from("leagues")
    .select("name")
    .eq("id", leagueId)
    .single()

  const { error } = await supabase
    .from("leagues")
    .update({ announcement_text: message ?? null })
    .eq("id", leagueId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fire-and-forget push fanout — non-blocking, best-effort.
  // The DB write already succeeded; push failure does not affect the response.
  if (message && league) {
    const notifyUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify`
    // The notify function checks Authorization against BROADCAST_TRIGGER_SECRET
    // (a shared secret we set in both Vercel and Supabase Edge Function env).
    // We avoid SUPABASE_SERVICE_ROLE_KEY here because:
    //   1. Supabase auto-injects it as a legacy JWT inside Edge Functions,
    //   2. But locally we hold the new opaque sb_secret_* format,
    // so the two would never match. A separate shared secret sidesteps both.
    try {
      fetch(notifyUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.BROADCAST_TRIGGER_SECRET ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leagueId,
          title: league.name,
          body: message,
          url: `/l/${leagueId}`,
        }),
      }).catch((err) => console.warn("Push fanout failed (non-blocking):", err))
    } catch (err) {
      // Synchronous fetch errors (e.g. URL parse failure) — log and continue
      console.warn("Push fanout setup failed (non-blocking):", err)
    }
  }

  return NextResponse.json({ success: true })
}
