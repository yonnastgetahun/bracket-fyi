import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { leagueId, message } = body as {
    leagueId: string;
    message: string | null;
  };

  if (!leagueId) {
    return NextResponse.json({ error: "Missing leagueId" }, { status: 400 });
  }

  const supabase = getAdminClient();

  const { error } = await supabase
    .from("leagues")
    .update({ announcement_text: message ?? null })
    .eq("id", leagueId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
