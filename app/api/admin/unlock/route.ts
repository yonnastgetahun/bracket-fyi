import { NextRequest, NextResponse } from "next/server";
import { authorizeOrganizer } from "@/lib/auth/organizer";
import { readJsonObject } from "@/lib/http/json";

export async function POST(request: NextRequest) {
  const parsed = await readJsonObject<{ leagueId?: unknown }>(request);
  if (!parsed.ok) return parsed.response;

  const { leagueId } = parsed.body;

  if (typeof leagueId !== "string" || !leagueId) {
    return NextResponse.json({ error: "Missing leagueId" }, { status: 400 });
  }

  const authorization = await authorizeOrganizer(request, leagueId);
  if (!authorization.ok) return authorization.response;
  if (authorization.league.status !== "locked") {
    return NextResponse.json(
      { error: "Only a locked league can be unlocked" },
      { status: 409 }
    );
  }

  const { supabase } = authorization;

  const { error } = await supabase
    .from("leagues")
    .update({ locked_at: null, status: "active" })
    .eq("id", leagueId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
