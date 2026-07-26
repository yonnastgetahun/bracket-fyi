import { NextRequest, NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"

// UUID regex — mirrors middleware.ts validation pattern
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface PushSubscriptionBody {
  endpoint: string
  expirationTime?: number | null
  keys: {
    p256dh: string
    auth: string
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const {
    leagueId,
    magicToken,
    subscription,
  } = body as {
    leagueId: string
    magicToken: string
    subscription: PushSubscriptionBody | null
  }

  if (!leagueId || !magicToken) {
    return NextResponse.json(
      { error: "Missing leagueId or magicToken" },
      { status: 400 }
    )
  }

  // Validate UUID format before hitting the DB
  if (!UUID_RE.test(leagueId) || !UUID_RE.test(magicToken)) {
    return NextResponse.json({ error: "Invalid token format" }, { status: 400 })
  }

  // Validate subscription shape if provided (prevents malformed data in DB)
  if (subscription !== null) {
    if (
      typeof subscription?.endpoint !== "string" ||
      typeof subscription?.keys?.p256dh !== "string" ||
      typeof subscription?.keys?.auth !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid subscription shape" },
        { status: 400 }
      )
    }
  }

  const supabase = getAdminClient()

  // Validate magicToken belongs to this league
  const { data: participant, error: lookupErr } = await supabase
    .from("participants")
    .select("id")
    .eq("magic_token", magicToken)
    .eq("league_id", leagueId)
    .single()

  if (lookupErr || !participant) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 })
  }

  const { error } = await supabase
    .from("participants")
    .update({ push_subscription: subscription })
    .eq("id", participant.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
