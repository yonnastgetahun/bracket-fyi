import { NextRequest, NextResponse } from "next/server";
import { authorizeOrganizer } from "@/lib/auth/organizer";
import { UUID_RE } from "@/lib/auth/organizer-cookie";
import { readJsonObject } from "@/lib/http/json";

export async function POST(request: NextRequest) {
  const parsed = await readJsonObject<{
    leagueId?: unknown;
    templateMatchId?: unknown;
    winnerTeamId?: unknown;
  }>(request);
  if (!parsed.ok) return parsed.response;

  const { leagueId, templateMatchId, winnerTeamId } = parsed.body;

  if (
    typeof leagueId !== "string" ||
    typeof templateMatchId !== "string" ||
    typeof winnerTeamId !== "string" ||
    !leagueId ||
    !templateMatchId ||
    !winnerTeamId
  ) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!UUID_RE.test(templateMatchId) || winnerTeamId.length > 128) {
    return NextResponse.json({ error: "Invalid result" }, { status: 400 });
  }

  const authorization = await authorizeOrganizer(request, leagueId);
  if (!authorization.ok) return authorization.response;

  const { supabase, league } = authorization;
  if (!league.template_id) {
    return NextResponse.json(
      { error: "League has no template" },
      { status: 409 }
    );
  }

  const { data: templateMatch, error: matchError } = await supabase
    .from("template_matches")
    .select("id")
    .eq("id", templateMatchId)
    .eq("template_id", league.template_id)
    .single();

  if (matchError || !templateMatch) {
    return NextResponse.json(
      { error: "Match not found in league template" },
      { status: 404 }
    );
  }

  const { data: template, error: templateError } = await supabase
    .from("templates")
    .select("team_registry")
    .eq("id", league.template_id)
    .single();

  if (templateError || !template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const registry = Array.isArray(template.team_registry)
    ? (template.team_registry as Array<{ id?: unknown }>)
    : [];
  if (!registry.some((entry) => entry.id === winnerTeamId)) {
    return NextResponse.json(
      { error: "Winner not found in league template" },
      { status: 400 }
    );
  }

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
