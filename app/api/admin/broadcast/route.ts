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

  const { error } = await supabase
    .from("leagues")
    .update({ announcement_text: message ?? null })
    .eq("id", leagueId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Legacy announcement-only compatibility. Real fanout is disabled unconditionally.
  // Event broadcasts belong in the transactional consented outbox, not direct fanout.

  return NextResponse.json({ success: true })
}
