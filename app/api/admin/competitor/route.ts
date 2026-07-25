import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { leagueId, teamId, newName } = body as {
    leagueId: string;
    teamId: string;
    newName: string;
  };

  if (!leagueId || !teamId || !newName) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const trimmed = newName.trim().slice(0, 60);
  if (!trimmed) {
    return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
  }

  const supabase = getAdminClient();

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

  const registry = template.team_registry as Array<{ id: string; name: string; [key: string]: unknown }>;
  const idx = registry.findIndex((t) => t.id === teamId);
  if (idx === -1) {
    return NextResponse.json({ error: "Team not found in registry" }, { status: 404 });
  }

  const updated = registry.map((t) =>
    t.id === teamId ? { ...t, name: trimmed } : t
  );

  const { error: updateErr } = await supabase
    .from("templates")
    .update({ team_registry: updated })
    .eq("id", league.template_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
