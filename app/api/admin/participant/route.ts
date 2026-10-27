import { NextRequest, NextResponse } from "next/server";
import { authorizeOrganizer } from "@/lib/auth/organizer";
import { UUID_RE } from "@/lib/auth/organizer-cookie";
import { readJsonObject } from "@/lib/http/json";

export async function PATCH(request: NextRequest) {
  const parsed = await readJsonObject<{
    leagueId?: unknown;
    participantId?: unknown;
    displayName?: unknown;
  }>(request);
  if (!parsed.ok) return parsed.response;

  const { leagueId, participantId, displayName } = parsed.body;

  if (
    typeof leagueId !== "string" ||
    typeof participantId !== "string" ||
    typeof displayName !== "string" ||
    !leagueId ||
    !participantId ||
    !displayName
  ) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!UUID_RE.test(participantId)) {
    return NextResponse.json({ error: "Invalid participantId" }, { status: 400 });
  }

  const trimmedName = displayName.trim();
  if (!trimmedName || trimmedName.length > 60) {
    return NextResponse.json(
      { error: "Display name must be between 1 and 60 characters" },
      { status: 400 }
    );
  }

  const authorization = await authorizeOrganizer(request, leagueId);
  if (!authorization.ok) return authorization.response;

  const { supabase } = authorization;

  const { data: updatedParticipant, error } = await supabase
    .from("participants")
    .update({ display_name: trimmedName })
    .eq("id", participantId)
    .eq("league_id", leagueId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updatedParticipant) {
    return NextResponse.json(
      { error: "Participant not found in league" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const parsed = await readJsonObject<{
    leagueId?: unknown;
    participantId?: unknown;
  }>(request);
  if (!parsed.ok) return parsed.response;

  const { leagueId, participantId } = parsed.body;

  if (
    typeof leagueId !== "string" ||
    typeof participantId !== "string" ||
    !leagueId ||
    !participantId
  ) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!UUID_RE.test(participantId)) {
    return NextResponse.json({ error: "Invalid participantId" }, { status: 400 });
  }

  const authorization = await authorizeOrganizer(request, leagueId);
  if (!authorization.ok) return authorization.response;

  const { supabase } = authorization;

  const { data: deletedParticipant, error } = await supabase
    .from("participants")
    .delete()
    .eq("id", participantId)
    .eq("league_id", leagueId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!deletedParticipant) {
    return NextResponse.json(
      { error: "Participant not found in league" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}

// Recovery is an explicit, single-participant operation, never a bulk page prop.
export async function POST(request: NextRequest) {
  const parsed = await readJsonObject<{ leagueId?: unknown; participantId?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const { leagueId, participantId } = parsed.body;
  if (typeof leagueId !== "string" || typeof participantId !== "string" ||
      !UUID_RE.test(leagueId) || !UUID_RE.test(participantId)) {
    return NextResponse.json({ error: "Invalid identifiers" }, { status: 400 });
  }
  const authorization = await authorizeOrganizer(request, leagueId);
  if (!authorization.ok) return authorization.response;
  const { data, error } = await authorization.supabase.from("participants")
    .select("magic_token").eq("league_id", leagueId).eq("id", participantId).maybeSingle();
  if (error) return NextResponse.json({ error: "Recovery unavailable" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Participant not found in league" }, { status: 404 });
  return NextResponse.json(
    { recoveryPath: `/l/${leagueId}/p/${data.magic_token}` },
    { headers: { "Cache-Control": "no-store" } }
  );
}
