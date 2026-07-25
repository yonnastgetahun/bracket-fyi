"use client";

import { useCallback, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useLiveRefresh } from "./useLiveRefresh";
import { cn } from "@/lib/ui";
import type { TemplateMatch } from "@/lib/types";

interface EffectiveResult {
  template_match_id: string;
  winner_team_id: string | null;
}

interface Props {
  leagueId: string;
  templateId: string;
  initialMatches: TemplateMatch[];
  teamMap: Record<string, string>;
  seedMap: Record<number, string>;
  initialResults: EffectiveResult[];
}

/**
 * Resolve a slot string to a team name.
 *
 * Slot formats observed:
 *   "s{N}"         — seed N (round 1)
 *   "w-r{R}m{M}"   — winner of round R match M
 *   "l-r{R}m{M}"   — loser (consolation / third place)
 *   Bare team id   — some templates store the team id directly
 */
function resolveSlot(
  slot: string,
  matches: TemplateMatch[],
  teamMap: Record<string, string>,
  seedMap: Record<number, string>,
  results: EffectiveResult[]
): string {
  // Seed slot: s1, s2, ...
  const seedMatch = slot.match(/^s(\d+)$/i);
  if (seedMatch) {
    const seed = parseInt(seedMatch[1], 10);
    const teamId = seedMap[seed];
    return teamId ? (teamMap[teamId] ?? teamId) : "TBD";
  }

  // Winner slot: w-r1m2 or winner-r1m2
  const winnerMatch = slot.match(/^w(?:inner)?-?r(\d+)m(\d+)$/i);
  if (winnerMatch) {
    const round = parseInt(winnerMatch[1], 10);
    const matchNum = parseInt(winnerMatch[2], 10);
    const feeder = matches.find(
      (m) => m.round === round && m.match_number === matchNum
    );
    if (!feeder) return "TBD";
    const result = results.find((r) => r.template_match_id === feeder.id);
    if (!result?.winner_team_id) return "TBD";
    return teamMap[result.winner_team_id] ?? result.winner_team_id;
  }

  // Loser slot: l-r1m1 (third-place match)
  const loserMatch = slot.match(/^l(?:oser)?-?r(\d+)m(\d+)$/i);
  if (loserMatch) {
    // We can't easily determine loser from our data; show TBD
    return "TBD";
  }

  // Direct team id
  if (teamMap[slot]) return teamMap[slot];

  return "TBD";
}

function MatchCard({
  match,
  matches,
  teamMap,
  seedMap,
  results,
}: {
  match: TemplateMatch;
  matches: TemplateMatch[];
  teamMap: Record<string, string>;
  seedMap: Record<number, string>;
  results: EffectiveResult[];
}) {
  const homeName = resolveSlot(match.home_slot, matches, teamMap, seedMap, results);
  const awayName = resolveSlot(match.away_slot, matches, teamMap, seedMap, results);

  const result = results.find((r) => r.template_match_id === match.id);
  const winnerName = result?.winner_team_id
    ? (teamMap[result.winner_team_id] ?? result.winner_team_id)
    : null;

  const scheduledLabel = match.scheduled_at
    ? new Date(match.scheduled_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-3 space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-muted">
        Round {match.round} · Match {match.match_number}
      </div>
      <div className="text-sm font-medium text-primary">
        {homeName} <span className="text-muted">vs</span> {awayName}
      </div>
      {winnerName ? (
        <div className="text-sm text-accent font-semibold">✓ {winnerName} won</div>
      ) : scheduledLabel ? (
        <div className="text-xs text-muted">Scheduled: {scheduledLabel}</div>
      ) : (
        <div className="text-xs text-muted">Result pending</div>
      )}
    </div>
  );
}

export default function MatchesLive({
  leagueId,
  templateId,
  initialMatches,
  teamMap,
  seedMap,
  initialResults,
}: Props) {
  const [matches] = useState(initialMatches);
  const [results, setResults] = useState(initialResults);

  // Pickem leagues don't use bracket-style matches
  const isPickem = Object.keys(seedMap).length === 0 && matches.some(m => m.home_slot.startsWith("category:"));
  if (isPickem) {
    return (
      <div className="px-4 py-8 text-center text-secondary text-sm">
        This view is optimized for bracket format — full pick'em support coming soon.
      </div>
    );
  }

  const refetch = useCallback(async () => {
    const supabase = getBrowserClient();
    const { data } = await supabase
      .from("effective_results")
      .select("template_match_id, winner_team_id")
      .eq("template_id", templateId)
      .eq("league_id", leagueId);
    if (data) setResults(data as EffectiveResult[]);
  }, [leagueId, templateId]);

  useLiveRefresh(refetch);

  // Group by round
  const roundsMap = new Map<number, TemplateMatch[]>();
  for (const match of matches) {
    const arr = roundsMap.get(match.round) ?? [];
    arr.push(match);
    roundsMap.set(match.round, arr);
  }
  const sortedRounds = Array.from(roundsMap.entries()).sort(([a], [b]) => a - b);

  return (
    <div className="space-y-4 px-3 py-4">
      <h1 className="px-1 font-display text-base tracking-wide text-primary">
        MATCHES
      </h1>
      {sortedRounds.map(([round, roundMatches]) => (
        <div key={round} className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted">
            Round {round}
          </h2>
          <div className="space-y-2">
            {roundMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                matches={matches}
                teamMap={teamMap}
                seedMap={seedMap}
                results={results}
              />
            ))}
          </div>
        </div>
      ))}
      {matches.length === 0 && (
        <p className="px-1 text-sm text-secondary">No matches found.</p>
      )}
    </div>
  );
}
