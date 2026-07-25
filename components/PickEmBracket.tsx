"use client";

import { useCallback, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useLiveRefresh } from "./useLiveRefresh";
import { cn } from "@/lib/ui";
import type { PickResultRow, League, PickemCategory, TemplateMatch } from "@/lib/types";

// ─── types ───────────────────────────────────────────────────────────────────

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
  categories: PickemCategory[];
  templateMatches: TemplateMatch[];
}

// ─── pick state helpers (shared pattern with BracketLive) ─────────────────────

type PickState = "correct" | "wrong" | "pending";

function getPickState(pick: PickResultRow): PickState {
  if (pick.is_correct === true) return "correct";
  if (pick.is_correct === false) return "wrong";
  return "pending";
}

const STATE_ICON: Record<PickState, string> = {
  correct: "✓",
  wrong: "✗",
  pending: "⏳",
};

const STATE_CARD: Record<PickState, string> = {
  correct: "border-correct bg-correct/10",
  wrong: "border-wrong bg-wrong/10",
  pending: "border-border",
};

const STATE_TEXT: Record<PickState, string> = {
  correct: "text-correct",
  wrong: "text-wrong",
  pending: "text-secondary",
};

// ─── pick card ────────────────────────────────────────────────────────────────

function PickemPickCard({
  pick,
  teamMap,
  category,
}: {
  pick: PickResultRow;
  teamMap: Record<string, string>;
  category: PickemCategory | undefined;
}) {
  const state = getPickState(pick);
  const pickedName = teamMap[pick.picked_team_id] ?? pick.picked_team_id;
  const winnerName = pick.winner_team_id ? teamMap[pick.winner_team_id] : null;
  const categoryName = category?.name ?? pick.slot_id;

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 space-y-1",
        STATE_CARD[state]
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted">
          {STATE_ICON[state]} {categoryName}
        </span>
        <span className="text-xs text-muted shrink-0">
          {pick.points_earned > 0
            ? `+${pick.points_earned} pts`
            : pick.winner_team_id
            ? "0 pts"
            : `${pick.points_value} pts possible`}
        </span>
      </div>
      <div className="text-sm flex items-center gap-1.5 flex-wrap">
        <span className={cn("font-medium", STATE_TEXT[state])}>{pickedName}</span>
        {winnerName && winnerName !== pickedName && (
          <span className="text-muted text-xs">
            {" "}
            → winner: {winnerName}
          </span>
        )}
        {!winnerName && (
          <span className="text-muted text-xs"> · pending</span>
        )}
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function PickEmBracket({
  participant,
  initialPicks,
  teamMap,
  league: _league,
  categories,
  templateMatches,
}: Props) {
  const [picks, setPicks] = useState(initialPicks);

  // Build matchId → PickemCategory map (memoized)
  const categoryByMatchId = useMemo(() => {
    const map: Record<string, PickemCategory> = {};
    for (const match of templateMatches) {
      if (match.home_slot.startsWith("category:")) {
        const catId = match.home_slot.replace("category:", "");
        const cat = categories.find((c) => c.id === catId);
        if (cat) map[match.id] = cat;
      }
    }
    return map;
  }, [categories, templateMatches]);

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

  const totalPoints = picks.reduce((s, p) => s + p.points_earned, 0);
  const correctCount = picks.filter((p) => p.is_correct === true).length;
  const wrongCount = picks.filter((p) => p.is_correct === false).length;
  const pendingCount = picks.filter((p) => p.is_correct === null).length;

  const displayName = participant.emoji
    ? `${participant.emoji} ${participant.display_name}`
    : participant.display_name;

  // Sort picks by category order (match order in templateMatches)
  const matchOrder = templateMatches.map((m) => m.id);
  const sortedPicks = [...picks].sort(
    (a, b) => matchOrder.indexOf(a.slot_id) - matchOrder.indexOf(b.slot_id)
  );

  return (
    <div className="space-y-4 px-3 py-4">
      {/* Header */}
      <div className="px-1">
        <h1 className="font-display text-lg text-primary">{displayName}&apos;s picks</h1>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-secondary">
          <span className="font-display text-2xl text-primary">{totalPoints} pts</span>
          <span className="text-correct">{correctCount} ✓</span>
          <span className="text-wrong">{wrongCount} ✗</span>
          {pendingCount > 0 && <span className="text-muted">{pendingCount} pending</span>}
        </div>
      </div>

      {/* Category picks */}
      <div className="space-y-2">
        {sortedPicks.map((pick) => (
          <PickemPickCard
            key={pick.pick_id}
            pick={pick}
            teamMap={teamMap}
            category={categoryByMatchId[pick.slot_id]}
          />
        ))}
      </div>

      {picks.length === 0 && (
        <p className="px-1 text-sm text-secondary">No picks found.</p>
      )}
    </div>
  );
}
