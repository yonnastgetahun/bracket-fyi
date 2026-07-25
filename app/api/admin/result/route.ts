import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { leagueId, templateMatchId, winnerTeamId } = body as {
    leagueId: string;
    templateMatchId: string;
    winnerTeamId: string;
  };

  if (!leagueId || !templateMatchId || !winnerTeamId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = getAdminClient();

  const { error } = await supabase.from("league_result_overrides").upsert(
    {
      league_id: leagueId,
      template_match_id: templateMatchId,
      winner_team_id: winnerTeamId,
    },
    { onConflict: "league_id,template_match_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
