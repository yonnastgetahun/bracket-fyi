"use client";

import { useCallback, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useLiveRefresh } from "./useLiveRefresh";
import { cn } from "@/lib/ui";
import type { PickResultRow, League, TemplateMatch } from "@/lib/types";

interface Participant {
  id: string;
  display_name: string;
  emoji: string | null;
  league_id: string;
}

interface Props {
  participant: Participant;
  initialPicks: PickResultRow[];
  teamMap: Record<string, string>;
  league: League;
  matches: TemplateMatch[];
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

const STATE_CARD: Record<PickState, string> = {
  correct: "border-correct bg-correct/10",
  wrong: "border-wrong bg-wrong/10",
  pending: "border-border",
  dead: "border-border",
};

const STATE_TEXT: Record<PickState, string> = {
  correct: "text-correct",
  wrong: "text-wrong",
  pending: "text-secondary",
  dead: "text-muted line-through",
};

function PickCard({
  pick,
  teamMap,
}: {
  pick: PickResultRow;
  teamMap: Record<string, string>;
}) {
  const state = getPickState(pick);
  const teamName = teamMap[pick.picked_team_id] ?? pick.picked_team_id;
  const pts = pick.points_value;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5",
        STATE_CARD[state]
      )}
    >
      <span className="w-4 shrink-0 text-center text-sm">{STATE_ICON[state]}</span>
      <span className={cn("flex-1 text-sm font-medium", STATE_TEXT[state])}>
        {teamName}
      </span>
      <span className="shrink-0 text-xs text-muted">
        +{pts} pt{pts !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

function ChampionSection({
  pick,
  teamMap,
}: {
  pick: PickResultRow;
  teamMap: Record<string, string>;
}) {
  const teamName = teamMap[pick.picked_team_id] ?? pick.picked_team_id;
  const pts = pick.points_value;
  const state = getPickState(pick);

  let label: string;
  if (state === "correct") {
    label = `🏆 ${teamName} (+${pts} pts)`;
  } else if (state === "dead") {
    label = `💀 ${teamName} (eliminated)`;
  } else {
    label = `⏳ ${teamName} (+${pts} pts if wins)`;
  }

  return (
    <div className="space-y-1.5">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted">
        Champion Pick
      </h2>
      <div
        className={cn(
          "rounded-lg border px-3 py-2.5 text-sm font-medium",
          state === "correct"
            ? "border-correct bg-correct/10 text-correct"
            : state === "dead"
            ? "border-border text-muted line-through"
            : "border-accent/40 bg-accent/5 text-accent"
        )}
      >
        {label}
      </div>
    </div>
  );
}

export default function BracketLive({
  participant,
  initialPicks,
  teamMap,
  league,
  matches: _matches,
}: Props) {
  const [picks, setPicks] = useState(initialPicks);

  const refetch = useCallback(async () => {
    const supabase = getBrowserClient();
    const { data } = await supabase
      .from("v_pick_results")
      .select("*")
      .eq("participant_id", participant.id)
      .eq("league_id", participant.league_id);
    if (data) setPicks(data as PickResultRow[]);
  }, [participant.id, participant.league_id]);

  useLiveRefresh(refetch);

  const championPick = picks.find((p) => p.slot_id === "champion");
  const roundPicks = picks.filter((p) => p.slot_id !== "champion");

  const totalPoints = picks.reduce((s, p) => s + p.points_earned, 0);

  // Group by round
  const roundsMap = new Map<number, PickResultRow[]>();
  for (const pick of roundPicks) {
    const arr = roundsMap.get(pick.round) ?? [];
    arr.push(pick);
    roundsMap.set(pick.round, arr);
  }
  const sortedRounds = Array.from(roundsMap.entries()).sort(([a], [b]) => a - b);

  const displayName = participant.emoji
    ? `${participant.emoji} ${participant.display_name}`
    : participant.display_name;

  return (
    <div className="space-y-4 px-3 py-4">
      {/* Header */}
      <div className="px-1">
        <h1 className="font-display text-lg text-primary">
          {displayName}&apos;s bracket
        </h1>
        <p className="text-sm text-muted">{totalPoints} pts</p>
      </div>

      {/* Champion pick */}
      {championPick && (
        <ChampionSection pick={championPick} teamMap={teamMap} />
      )}

      {/* Rounds */}
      {sortedRounds.map(([round, roundPickList]) => (
        <div key={round} className="space-y-1.5">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted">
            Round {round}
          </h2>
          <div className="space-y-1.5">
            {roundPickList.map((pick) => (
              <PickCard key={pick.pick_id} pick={pick} teamMap={teamMap} />
            ))}
          </div>
        </div>
      ))}

      {picks.length === 0 && (
        <p className="px-1 text-sm text-secondary">No picks found.</p>
      )}
    </div>
  );
}
