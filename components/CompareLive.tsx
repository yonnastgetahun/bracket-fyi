"use client";

import { useCallback, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useLiveRefresh } from "./useLiveRefresh";
import { cn } from "@/lib/ui";
import type {
  PickResultRow,
  TemplateMatch,
  Participant,
  PickemCategory,
} from "@/lib/types";

interface Props {
  leagueId: string;
  initialParticipants: Participant[];
  initialPicks: PickResultRow[];
  matches: TemplateMatch[];
  teamMap: Record<string, string>;
  seedMap: Record<number, string>;
  pickemCategories?: PickemCategory[] | null;
}

type PickState = "correct" | "wrong" | "pending" | "dead";

function getPickState(pick: PickResultRow): PickState {
  if (pick.is_correct === true) return "correct";
  if (pick.is_correct === false) return "wrong";
  if (pick.still_possible) return "pending";
  return "dead";
}

const STATE_ICON: Record<PickState, string> = {
  correct: "✓",
  wrong: "✗",
  pending: "⏳",
  dead: "💀",
};

const STATE_COLOR: Record<PickState, string> = {
  correct: "text-correct",
  wrong: "text-wrong",
  pending: "text-secondary",
  dead: "text-muted",
};

function abbr(name: string): string {
  return name.slice(0, 3).toUpperCase();
}

function resolveSlot(
  slot: string,
  matches: TemplateMatch[],
  teamMap: Record<string, string>,
  seedMap: Record<number, string>,
  results: Map<string, string | null>
): string {
  const seedMatch = slot.match(/^s(\d+)$/i);
  if (seedMatch) {
    const seed = parseInt(seedMatch[1], 10);
    const teamId = seedMap[seed];
    return teamId ? (teamMap[teamId] ?? teamId) : "TBD";
  }

  const winnerMatch = slot.match(/^w(?:inner)?-?r(\d+)m(\d+)$/i);
  if (winnerMatch) {
    const round = parseInt(winnerMatch[1], 10);
    const matchNum = parseInt(winnerMatch[2], 10);
    const feeder = matches.find(
      (m) => m.round === round && m.match_number === matchNum
    );
    if (!feeder) return "TBD";
    const winnerId = results.get(feeder.id);
    if (!winnerId) return "TBD";
    return teamMap[winnerId] ?? winnerId;
  }

  if (teamMap[slot]) return teamMap[slot];
  return "TBD";
}

export default function CompareLive({
  leagueId,
  initialParticipants,
  initialPicks,
  matches,
  teamMap,
  seedMap,
  pickemCategories,
}: Props) {
  const [participants] = useState(initialParticipants);
  const [picks, setPicks] = useState(initialPicks);

  const refetch = useCallback(async () => {
    const supabase = getBrowserClient();
    const { data } = await supabase
      .from("v_pick_results")
      .select("*")
      .eq("league_id", leagueId);
    if (data) setPicks(data as PickResultRow[]);
  }, [leagueId]);

  useLiveRefresh(refetch);

  // ----- Pickem branch -----
  if (pickemCategories && pickemCategories.length > 0) {
    // Map category id → template_match id (for looking up per-participant picks)
    const categoryToMatchId = new Map<string, string>();
    for (const m of matches) {
      const catMatch = m.home_slot.match(/^category:(.+)$/);
      if (catMatch) categoryToMatchId.set(catMatch[1], m.id);
    }
    // Build pick lookup: participant_id -> slot_id -> PickResultRow
    const pickLookup = new Map<string, Map<string, PickResultRow>>();
    for (const pick of picks) {
      let bySlot = pickLookup.get(pick.participant_id);
      if (!bySlot) {
        bySlot = new Map();
        pickLookup.set(pick.participant_id, bySlot);
      }
      bySlot.set(pick.slot_id, pick);
    }

    if (participants.length === 0) {
      return (
        <div className="px-3 py-4 text-sm text-secondary">
          No participants yet.
        </div>
      );
    }

    return (
      <div className="py-4">
        <h1 className="px-3 font-display text-base tracking-wide text-primary mb-3">
          COMPARE
        </h1>
        <div className="overflow-x-auto">
          <table className="min-w-max border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-canvas px-3 py-2 text-left text-muted font-normal border-b border-border min-w-[140px]">
                  Category
                </th>
                {participants.map((p) => (
                  <th
                    key={p.id}
                    className="px-2 py-2 text-center font-semibold text-primary border-b border-border whitespace-nowrap min-w-[70px]"
                  >
                    {p.emoji ? `${p.emoji} ` : ""}
                    {p.display_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pickemCategories.map((cat) => {
                const matchId = categoryToMatchId.get(cat.id);
                const winnerId = cat.winner ?? null;
                const winnerName = winnerId
                  ? (teamMap[winnerId] ?? winnerId)
                  : null;
                const shortName =
                  cat.name.length > 24 ? cat.name.slice(0, 22) + "…" : cat.name;
                return (
                  <tr
                    key={cat.id}
                    className="border-b border-border/50 hover:bg-surface/40"
                  >
                    <td className="sticky left-0 z-10 bg-canvas px-3 py-2 text-muted whitespace-nowrap">
                      <span className="font-semibold text-primary">
                        {shortName}
                      </span>
                      {winnerName && (
                        <span className="ml-2 text-correct">✓ {winnerName}</span>
                      )}
                    </td>
                    {participants.map((p) => {
                      const pick = matchId
                        ? pickLookup.get(p.id)?.get(matchId)
                        : undefined;
                      if (!pick) {
                        return (
                          <td
                            key={p.id}
                            className="px-2 py-2 text-center text-muted"
                          >
                            —
                          </td>
                        );
                      }
                      const state = getPickState(pick);
                      const pickedName =
                        teamMap[pick.picked_team_id] ?? pick.picked_team_id;
                      return (
                        <td
                          key={p.id}
                          className={cn(
                            "px-2 py-2 text-center font-mono",
                            STATE_COLOR[state]
                          )}
                          title={pickedName}
                        >
                          {STATE_ICON[state]}
                          {abbr(pickedName)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Build a results map from picks: template_match_id -> winner_team_id
  // We can infer the winner from any correct pick
  const resultsMap = new Map<string, string | null>();
  for (const pick of picks) {
    if (pick.slot_id === "champion") continue;
    if (pick.winner_team_id !== undefined) {
      resultsMap.set(pick.slot_id, pick.winner_team_id);
    }
  }

  // Only bracket matches (exclude champion slot — handled separately)
  const bracketMatches = matches.sort((a, b) =>
    a.round !== b.round ? a.round - b.round : a.match_number - b.match_number
  );

  // Build pick lookup: participant_id -> slot_id -> PickResultRow
  const pickLookup = new Map<string, Map<string, PickResultRow>>();
  for (const pick of picks) {
    let bySlot = pickLookup.get(pick.participant_id);
    if (!bySlot) {
      bySlot = new Map();
      pickLookup.set(pick.participant_id, bySlot);
    }
    bySlot.set(pick.slot_id, pick);
  }

  if (participants.length === 0) {
    return (
      <div className="px-3 py-4 text-sm text-secondary">
        No participants yet.
      </div>
    );
  }

  return (
    <div className="py-4">
      <h1 className="px-3 font-display text-base tracking-wide text-primary mb-3">
        COMPARE
      </h1>
      <div className="overflow-x-auto">
        <table className="min-w-max border-collapse text-xs">
          <thead>
            <tr>
              {/* sticky header corner */}
              <th className="sticky left-0 z-10 bg-canvas px-3 py-2 text-left text-muted font-normal border-b border-border min-w-[100px]">
                Match
              </th>
              {participants.map((p) => (
                <th
                  key={p.id}
                  className="px-2 py-2 text-center font-semibold text-primary border-b border-border whitespace-nowrap min-w-[60px]"
                >
                  {p.emoji ? `${p.emoji} ` : ""}{p.display_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bracketMatches.map((match) => {
              const homeName = resolveSlot(
                match.home_slot,
                matches,
                teamMap,
                seedMap,
                resultsMap
              );
              const awayName = resolveSlot(
                match.away_slot,
                matches,
                teamMap,
                seedMap,
                resultsMap
              );

              return (
                <tr key={match.id} className="border-b border-border/50 hover:bg-surface/40">
                  {/* sticky row header */}
                  <td className="sticky left-0 z-10 bg-canvas px-3 py-2 text-muted whitespace-nowrap">
                    <span className="font-semibold text-primary">
                      R{match.round}-M{match.match_number}
                    </span>{" "}
                    <span className="text-secondary">
                      {homeName !== "TBD" || awayName !== "TBD"
                        ? `${homeName} vs ${awayName}`
                        : "TBD"}
                    </span>
                  </td>
                  {participants.map((p) => {
                    const pick = pickLookup.get(p.id)?.get(match.id);
                    if (!pick) {
                      return (
                        <td
                          key={p.id}
                          className="px-2 py-2 text-center text-muted"
                        >
                          —
                        </td>
                      );
                    }
                    const state = getPickState(pick);
                    const pickedName =
                      teamMap[pick.picked_team_id] ?? pick.picked_team_id;
                    return (
                      <td
                        key={p.id}
                        className={cn(
                          "px-2 py-2 text-center font-mono",
                          STATE_COLOR[state],
                          state === "dead" ? "line-through" : ""
                        )}
                        title={pickedName}
                      >
                        {STATE_ICON[state]}{abbr(pickedName)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Champion row */}
            <tr className="border-t-2 border-accent/30 hover:bg-surface/40">
              <td className="sticky left-0 z-10 bg-canvas px-3 py-2 text-muted whitespace-nowrap">
                <span className="font-semibold text-accent">Champion</span>
              </td>
              {participants.map((p) => {
                const pick = pickLookup.get(p.id)?.get("champion");
                if (!pick) {
                  return (
                    <td key={p.id} className="px-2 py-2 text-center text-muted">
                      —
                    </td>
                  );
                }
                const state = getPickState(pick);
                const pickedName =
                  teamMap[pick.picked_team_id] ?? pick.picked_team_id;
                return (
                  <td
                    key={p.id}
                    className={cn(
                      "px-2 py-2 text-center font-mono",
                      STATE_COLOR[state],
                      state === "dead" ? "line-through" : ""
                    )}
                    title={pickedName}
                  >
                    {STATE_ICON[state]}{abbr(pickedName)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
