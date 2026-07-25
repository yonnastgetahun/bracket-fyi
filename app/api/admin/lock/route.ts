import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { leagueId } = body as { leagueId: string };

  if (!leagueId) {
    return NextResponse.json({ error: "Missing leagueId" }, { status: 400 });
  }

  const supabase = getAdminClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("leagues")
    .update({ locked_at: now, status: "locked" })
    .eq("id", leagueId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, lockedAt: now });
}
