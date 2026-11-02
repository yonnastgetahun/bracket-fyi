import { NextRequest, NextResponse } from "next/server";
import { authorizeOrganizer } from "@/lib/auth/organizer";
import { readJsonObject } from "@/lib/http/json";

export async function PATCH(request: NextRequest) {
  const parsed = await readJsonObject<{
    leagueId?: unknown;
    teamId?: unknown;
    newName?: unknown;
  }>(request);
  if (!parsed.ok) return parsed.response;

  const { leagueId, teamId, newName } = parsed.body;

  if (
    typeof leagueId !== "string" ||
    typeof teamId !== "string" ||
    typeof newName !== "string" ||
    !leagueId ||
    !teamId ||
    !newName
  ) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (teamId.length > 128) {
    return NextResponse.json({ error: "Invalid teamId" }, { status: 400 });
  }

  const trimmed = newName.trim().slice(0, 60);
  if (!trimmed) {
    return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
  }

  const authorization = await authorizeOrganizer(request, leagueId);
  if (!authorization.ok) return authorization.response;

  const { supabase } = authorization;

  // Get the league's template_id
  const { data: league, error: leagueErr } = await supabase
    .from("leagues")
    .select("template_id")
    .eq("id", leagueId)
    .single();

  if (leagueErr || !league?.template_id) {
    return NextResponse.json({ error: "League not found" }, { status: 404 });
  }

  // Get the template's team_registry
  const { data: template, error: templateErr } = await supabase
    .from("templates")
    .select("team_registry")
    .eq("id", league.template_id)
    .single();

  if (templateErr || !template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const registry = (Array.isArray(template.team_registry) ? template.team_registry : []) as Array<{ id: string }>;
  const idx = registry.findIndex((t) => t.id === teamId);
  if (idx === -1) {
    return NextResponse.json({ error: "Team not found in registry" }, { status: 404 });
  }

  // Display-only change: never mutate the shared template or competitor identity.
  const { error: updateErr } = await supabase
    .from("league_competitor_names")
    .upsert({ league_id: leagueId, template_id: league.template_id, team_id: teamId, name: trimmed },
      { onConflict: "league_id,template_id,team_id" });

  if (updateErr) {
    return NextResponse.json({ error: "Could not rename competitor. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ success: true, name: trimmed });
}
