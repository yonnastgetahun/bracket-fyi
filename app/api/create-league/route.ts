import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import type { ScoringConfig, TeamEntry } from "@/lib/types";

// ─── Bracket topology helpers ─────────────────────────────────────────────────

function inferSlotCount(count: number): number {
  if (count <= 4) return 4;
  if (count <= 8) return 8;
  if (count <= 16) return 16;
  if (count <= 32) return 32;
  return 64;
}

// Build template_matches rows for a single-elimination bracket of `slots` size.
// Round 1: seed-1 vs seed-2, seed-3 vs seed-4, …
// Later rounds: w-r{r}m{n} refs
function buildMatchRows(
  templateId: string,
  slots: number
): {
  template_id: string;
  round: number;
  match_number: number;
  home_slot: string;
  away_slot: string;
}[] {
  const rows: {
    template_id: string;
    round: number;
    match_number: number;
    home_slot: string;
    away_slot: string;
  }[] = [];

  let matchesInRound = slots / 2;
  let round = 1;

  while (matchesInRound >= 1) {
    for (let m = 1; m <= matchesInRound; m++) {
      let homeSlot: string;
      let awaySlot: string;

      if (round === 1) {
        // seed positions: seed-1, seed-2, seed-3, seed-4, …
        const seedA = (m - 1) * 2 + 1;
        const seedB = (m - 1) * 2 + 2;
        homeSlot = `seed-${seedA}`;
        awaySlot = `seed-${seedB}`;
      } else {
        // winners from previous round
        const prevRound = round - 1;
        const winnerA = (m - 1) * 2 + 1;
        const winnerB = (m - 1) * 2 + 2;
        homeSlot = `w-r${prevRound}m${winnerA}`;
        awaySlot = `w-r${prevRound}m${winnerB}`;
      }

      rows.push({
        template_id: templateId,
        round,
        match_number: m,
        home_slot: homeSlot,
        away_slot: awaySlot,
      });
    }

    if (matchesInRound === 1) break; // done at the final
    matchesInRound = matchesInRound / 2;
    round++;
  }

  return rows;
}

// ─── Request body type ────────────────────────────────────────────────────────

interface CreateLeagueBody {
  leagueName: string;
  competitorNames: string[];
  lockedAt: string | null;
  scoringConfig: ScoringConfig;
}

// ─── POST /api/create-league ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: CreateLeagueBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { leagueName, competitorNames, lockedAt, scoringConfig } = body;

  // Validation
  if (!leagueName || typeof leagueName !== "string" || leagueName.trim().length === 0) {
    return NextResponse.json({ error: "leagueName is required" }, { status: 400 });
  }
  if (leagueName.trim().length > 60) {
    return NextResponse.json({ error: "leagueName must be 60 chars or less" }, { status: 400 });
  }
  if (!Array.isArray(competitorNames) || competitorNames.length < 3) {
    return NextResponse.json(
      { error: "competitorNames must have at least 3 entries" },
      { status: 400 }
    );
  }
  if (!scoringConfig || typeof scoringConfig !== "object") {
    return NextResponse.json({ error: "scoringConfig is required" }, { status: 400 });
  }

  const db = getAdminClient();
  const slots = inferSlotCount(competitorNames.length);

  // Build team_registry
  const teamRegistry: TeamEntry[] = competitorNames.map((name, i) => ({
    id: `custom-${i}`,
    name: name.trim(),
    aliases: [],
  }));

  // Build topology
  const topology = {
    rounds: Math.log2(slots),
    slots_per_round: Array.from({ length: Math.log2(slots) }, (_, i) =>
      slots / Math.pow(2, i + 1)
    ),
    has_third_place: scoringConfig.has_third_place ?? false,
  };

  // 1. Insert template
  const { data: template, error: templateErr } = await db
    .from("templates")
    .insert({
      name: leagueName.trim(),
      type: "bracket",
      topology,
      team_registry: teamRegistry,
      scoring_defaults: scoringConfig,
    })
    .select("id")
    .single();

  if (templateErr || !template) {
    console.error("template insert error", templateErr);
    return NextResponse.json(
      { error: "Failed to create template" },
      { status: 500 }
    );
  }

  // 2. Insert template_matches
  const matchRows = buildMatchRows(template.id, slots);
  const { error: matchErr } = await db.from("template_matches").insert(matchRows);

  if (matchErr) {
    console.error("template_matches insert error", matchErr);
    // Clean up template
    await db.from("templates").delete().eq("id", template.id);
    return NextResponse.json(
      { error: "Failed to create bracket matches" },
      { status: 500 }
    );
  }

  // 3. Insert league
  const { data: league, error: leagueErr } = await db
    .from("leagues")
    .insert({
      name: leagueName.trim(),
      template_id: template.id,
      scoring_config: scoringConfig,
      locked_at: lockedAt ?? null,
    })
    .select("id, organizer_token, join_token")
    .single();

  if (leagueErr || !league) {
    console.error("league insert error", leagueErr);
    // Clean up template (cascades to matches)
    await db.from("templates").delete().eq("id", template.id);
    return NextResponse.json(
      { error: "Failed to create league" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    leagueId: league.id,
    organizerToken: league.organizer_token,
    joinToken: league.join_token,
  });
}
