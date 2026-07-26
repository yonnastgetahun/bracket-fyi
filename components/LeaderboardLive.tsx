"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/ui";
import { useLiveRefresh } from "./useLiveRefresh";
import type { LeaderboardRow, ChampionStatusRow, PickResultRow, League, ScoringConfig } from "@/lib/types";
import { isPickemConfig, isBracketConfig } from "@/lib/types";
import WinnerTakeover from "./WinnerTakeover";
import { Button } from "@/components/ui/Button";

// ---------- Sparkline ----------
function Sparkline({ picks, roundKeys }: { picks: PickResultRow[]; roundKeys: string[] }) {
  return (
    <div className="flex h-5 items-end gap-[3px]" title="Points by round">
      {roundKeys.map((r) => {
        const roundPicks = picks.filter((p) => p.round === Number(r));
        const maxPossible = roundPicks.reduce((s, p) => s + p.points_value, 0);
        const earned = roundPicks.reduce((s, p) => s + p.points_earned, 0);
        const hasResult = roundPicks.some((p) => p.is_correct !== null);
        const h = maxPossible > 0 ? (hasResult ? Math.max(0.15, earned / maxPossible) : 0.08) : 0.08;
        return (
          <div
            key={r}
            className={cn("w-[5px] rounded-sm", hasResult ? "bg-accent/80" : "bg-white/10")}
            style={{ height: `${h * 100}%` }}
          />
        );
      })}
    </div>
  );
}

// ---------- Rank accent ----------
const RANK_EDGE: Record<number, string> = {
  1: "border-l-4 border-l-gold",
  2: "border-l-4 border-l-silver",
  3: "border-l-4 border-l-bronze",
};
const RANK_TEXT: Record<number, string> = {
  1: "text-gold",
  2: "text-silver",
  3: "text-bronze",
};

// ---------- ChampionChip ----------
function ChampionChip({ teamId, correct, teamName }: { teamId: string; correct: boolean | null; teamName: string }) {
  const dead = correct === false;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs",
        dead
          ? "bg-wrong/15 text-wrong line-through"
          : "bg-correct/15 text-correct"
      )}
      title={`Champion pick: ${teamName}`}
    >
      {dead ? "💀" : "🏆"} {teamName || teamId}
    </span>
  );
}

// ---------- Row ----------
function LeaderboardRow({
  row,
  picks,
  roundKeys,
  leagueId,
  teamName,
}: {
  row: LeaderboardRow;
  picks: PickResultRow[];
  roundKeys: string[];
  leagueId: string;
  teamName: (id: string | null) => string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-xl border border-border bg-surface p-3 transition-shadow",
        RANK_EDGE[row.rank] ?? ""
      )}
    >
      {/* ghost rank number */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-1 -top-3 select-none font-display text-7xl leading-none text-white/[0.04]"
      >
        {row.rank}
      </span>
      <div className="flex items-center gap-3">
        {/* rank */}
        <div className={cn("w-8 shrink-0 text-center font-display text-xl", RANK_TEXT[row.rank] ?? "text-muted")}>
          {row.rank}
        </div>
        {/* name + stats */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="truncate font-semibold text-primary">
              {row.emoji ? `${row.emoji} ` : ""}
              {row.display_name}
            </span>
            {row.champion_team_id && (
              <ChampionChip
                teamId={row.champion_team_id}
                correct={row.champion_correct}
                teamName={teamName(row.champion_team_id)}
              />
            )}
          </div>
          <div className="mt-0.5 text-xs text-secondary">
            <span className="text-correct">{row.correct_picks} ✓</span>
            {" · "}
            <span className="text-wrong">{row.wrong_picks} ✗</span>
            {" · "}
            <span>max {row.max_possible}</span>
          </div>
        </div>
        {/* sparkline (hidden on very small) */}
        <div className="hidden shrink-0 sm:block">
          <Sparkline picks={picks} roundKeys={roundKeys} />
        </div>
        {/* points */}
        <div className="shrink-0 text-right">
          <div className="font-display text-3xl tabular-nums leading-none text-primary">
            {row.total_points}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-muted">pts</div>
        </div>
      </div>
      {/* sparkline below on mobile */}
      <div className="mt-1.5 flex justify-end sm:hidden">
        <Sparkline picks={picks} roundKeys={roundKeys} />
      </div>
    </div>
  );
}

// ---------- Scoring explainer ----------
function ScoringExplainer({ config }: { config: ScoringConfig }) {
  if (isPickemConfig(config)) {
    const tiebreakers = config.tiebreakers ?? [];
    return (
      <details className="rounded-xl border border-border bg-surface">
        <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold text-primary">
          How scoring works
        </summary>
        <div className="border-t border-border px-3 py-3 space-y-2 text-sm text-secondary">
          {config.scheme === "pickem_weighted" ? (
            <div>
              <p className="font-semibold text-primary mb-1">Points per category</p>
              <ul className="space-y-0.5">
                <li>
                  Major categories:{" "}
                  <span className="text-primary">
                    {config.major_points ?? 3} pts each
                  </span>
                </li>
                <li>
                  Other categories:{" "}
                  <span className="text-primary">
                    {config.other_points ?? 1} pt each
                  </span>
                </li>
              </ul>
            </div>
          ) : (
            <div>
              <p className="font-semibold text-primary mb-1">Points per category</p>
              <p>
                <span className="text-primary">{config.other_points ?? 1} pt</span> per correct pick
              </p>
            </div>
          )}
          {tiebreakers.length > 0 && (
            <div>
              <p className="font-semibold text-primary mb-1">Tiebreakers (in order)</p>
              <ol className="list-decimal list-inside space-y-0.5">
                {tiebreakers.map((tb) => (
                  <li key={tb}>{tb.replace(/_/g, " ")}</li>
                ))}
              </ol>
            </div>
          )}
          <div>
            <p className="font-semibold text-primary mb-1">max</p>
            <p>Your ceiling: current points plus every remaining pick that can still hit.</p>
          </div>
        </div>
      </details>
    );
  }

  // Bracket scoring explainer
  const rounds = Object.entries(config.round_points).sort(([a], [b]) => Number(a) - Number(b));
  return (
    <details className="rounded-xl border border-border bg-surface">
      <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold text-primary">
        How scoring works
      </summary>
      <div className="border-t border-border px-3 py-3 space-y-2 text-sm text-secondary">
        <div>
          <p className="font-semibold text-primary mb-1">Points per round</p>
          <ul className="space-y-0.5">
            {rounds.map(([round, pts]) => (
              <li key={round}>
                Round {round}: <span className="text-primary">{pts} pt{Number(pts) !== 1 ? "s" : ""}</span>
              </li>
            ))}
            {config.champion_bonus > 0 && (
              <li>
                Champion bonus: <span className="text-primary">{config.champion_bonus} pts</span>
              </li>
            )}
          </ul>
        </div>
        {config.tiebreakers.length > 0 && (
          <div>
            <p className="font-semibold text-primary mb-1">Tiebreakers (in order)</p>
            <ol className="list-decimal list-inside space-y-0.5">
              {config.tiebreakers.map((tb) => (
                <li key={tb}>{tb.replace(/_/g, " ")}</li>
              ))}
            </ol>
          </div>
        )}
        <div>
          <p className="font-semibold text-primary mb-1">max</p>
          <p>
            Your ceiling: current points plus every remaining pick that can still hit.
          </p>
        </div>
      </div>
    </details>
  );
}

// ---------- Main component ----------
interface Props {
  leagueId: string;
  initialRows: LeaderboardRow[];
  initialChampions: ChampionStatusRow[];
  initialPicks: PickResultRow[];
  league: League;
  teamRegistry: Record<string, string>; // id -> name
}

export default function LeaderboardLive({
  leagueId,
  initialRows,
  initialChampions,
  initialPicks,
  league,
  teamRegistry,
}: Props) {
  const [rows, setRows] = useState(initialRows);
  const [champions, setChampions] = useState(initialChampions);
  const [picks, setPicks] = useState(initialPicks);
  const [showTakeover, setShowTakeover] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(`bfyi_coronation_dismissed:${league.id}`);
    const previewMode = new URLSearchParams(window.location.search).get("takeover") === "1";
    const isComplete = league.status === "complete" || previewMode;
    if (isComplete && !dismissed) setShowTakeover(true);
  }, [league.id, league.status]);

  const handleDismissTakeover = useCallback(() => {
    try {
      localStorage.setItem(`bfyi_coronation_dismissed:${league.id}`, "true");
    } catch {
      // private mode
    }
    setShowTakeover(false);
  }, [league.id]);

  const refetch = useCallback(async () => {
    const supabase = getBrowserClient();
    const [lbRes, champsRes, picksRes] = await Promise.all([
      supabase.from("v_leaderboard").select("*").eq("league_id", leagueId).order("rank"),
      supabase.from("v_champion_status").select("*").eq("league_id", leagueId),
      supabase.from("v_pick_results").select("*").eq("league_id", leagueId),
    ]);
    if (lbRes.data) setRows(lbRes.data as LeaderboardRow[]);
    if (champsRes.data) setChampions(champsRes.data as ChampionStatusRow[]);
    if (picksRes.data) setPicks(picksRes.data as PickResultRow[]);
  }, [leagueId]);

  useLiveRefresh(refetch);

  const roundKeys = isBracketConfig(league.scoring_config)
    ? Object.keys(league.scoring_config.round_points).sort(
        (a, b) => Number(a) - Number(b)
      )
    : [];

  function teamName(id: string | null): string {
    if (!id) return "";
    return teamRegistry[id] ?? id;
  }

  const winners = rows.filter((r) => r.rank === 1);
  const winnerPoints = winners[0]?.total_points ?? 0;

  return (
    <div className="space-y-3 px-3 py-4">
      {/* Winner takeover overlay */}
      {showTakeover && winners.length > 0 && (
        <WinnerTakeover
          leagueName={league.name}
          winners={winners.map((w) => ({ display_name: w.display_name, emoji: w.emoji }))}
          totalPoints={winnerPoints}
          onDismiss={handleDismissTakeover}
        />
      )}

      {/* Announcement banner */}
      {league.announcement_text && (
        <div className="bg-accent-dim text-accent border border-accent rounded-lg px-3 py-2 text-sm">
          {league.announcement_text}
        </div>
      )}

      <h1 className="px-1 font-display text-base tracking-wide text-primary">LEADERBOARD</h1>

      {/* Champion chips strip */}
      {champions.length > 0 && (
        <div className="-mx-0 overflow-x-auto">
          <div className="flex w-max gap-1.5 pb-1">
            {champions.map((c) => {
              const name = teamName(c.champion_team_id);
              const dead = c.champion_correct === false;
              return (
                <div
                  key={c.participant_id}
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px]",
                    dead
                      ? "border-wrong/30 bg-wrong/10 text-wrong"
                      : "border-correct/30 bg-correct/10 text-correct"
                  )}
                >
                  <span>{dead ? "💀" : "🏆"}</span>
                  <span className={dead ? "line-through opacity-70" : ""}>{name || c.champion_team_id}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rows */}
      <div className="space-y-2">
        {rows.map((row) => (
          <LeaderboardRow
            key={row.participant_id}
            row={row}
            picks={picks.filter((p) => p.participant_id === row.participant_id)}
            roundKeys={roundKeys}
            leagueId={leagueId}
            teamName={teamName}
          />
        ))}
      </div>

      {/* Scoring explainer */}
      <ScoringExplainer config={league.scoring_config} />

      {/* Run it back CTA */}
      {league.status === "complete" && (
        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <div>
            <p className="font-semibold text-primary text-sm">Ready for a rematch?</p>
            <p className="text-xs text-secondary mt-1">
              Same template, same rules, fresh bracket. Nobody has to sign up again.
            </p>
          </div>
          <a href={`/create?from=${leagueId}`}>
            <Button className="w-full py-2.5 text-sm">
              Run it back &rarr;
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}
