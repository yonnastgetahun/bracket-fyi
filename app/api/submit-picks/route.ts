import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

interface PickPayload {
  slotId: string;
  teamId: string;
}

interface RequestBody {
  leagueId: string;
  displayName: string;
  emoji: string | null;
  picks: PickPayload[];
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const { leagueId, displayName, emoji, picks } = body;

    // ── validate ────────────────────────────────────────────────────────────
    if (!leagueId || typeof leagueId !== "string") {
      return NextResponse.json({ error: "Missing leagueId" }, { status: 400 });
    }
    if (!displayName || typeof displayName !== "string") {
      return NextResponse.json(
        { error: "Missing displayName" },
        { status: 400 }
      );
    }
    const trimmedName = displayName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 30) {
      return NextResponse.json(
        { error: "Display name must be 2-30 characters" },
        { status: 400 }
      );
    }
    if (!picks || picks.length === 0) {
      return NextResponse.json(
        { error: "No picks provided" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    // ── check league exists and is not locked ────────────────────────────────
    const { data: league, error: leagueError } = await supabase
      .from("leagues")
      .select("id, locked_at")
      .eq("id", leagueId)
      .single();

    if (leagueError || !league) {
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    if (league.locked_at && new Date(league.locked_at) <= new Date()) {
      return NextResponse.json(
        { error: "Picks are locked" },
        { status: 400 }
      );
    }

    // ── create participant ───────────────────────────────────────────────────
    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .insert({
        league_id: leagueId,
        display_name: trimmedName,
        emoji: emoji ?? null,
      })
      .select("id, magic_token")
      .single();

    if (participantError || !participant) {
      console.error("Failed to create participant:", participantError);
      return NextResponse.json(
        { error: "Failed to create participant" },
        { status: 500 }
      );
    }

    // ── insert picks in bulk ─────────────────────────────────────────────────
    const pickRows = picks.map((p) => ({
      participant_id: participant.id,
      league_id: leagueId,
      slot_id: p.slotId,
      team_id: p.teamId,
    }));

    const { error: picksError } = await supabase
      .from("picks")
      .insert(pickRows);

    if (picksError) {
      // Roll back the participant — best effort
      await supabase.from("participants").delete().eq("id", participant.id);
      console.error("Failed to insert picks:", picksError);
      return NextResponse.json(
        { error: "Failed to save picks" },
        { status: 500 }
      );
    }

    return NextResponse.json({ magicToken: participant.magic_token });
  } catch (err) {
    console.error("submit-picks error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
