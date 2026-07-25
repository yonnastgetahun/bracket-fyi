"use client";

import { useState } from "react";
import { cn } from "@/lib/ui";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import CascadeModal from "@/components/CascadeModal";
import type { League, TemplateMatch, TeamEntry } from "@/lib/types";

// ─── helpers ────────────────────────────────────────────────────────────────

function resolveTeam(
  slot: string,
  matches: TemplateMatch[],
  teamRegistry: TeamEntry[],
  picks: Record<string, string>
): string {
  if (slot.startsWith("seed-")) {
    const idx = parseInt(slot.replace("seed-", ""), 10);
    return teamRegistry[idx]?.name ?? "TBD";
  }
  const m = slot.match(/^w-r(\d+)m(\d+)$/);
  if (!m) return "TBD";
  const round = parseInt(m[1], 10);
  const matchNum = parseInt(m[2], 10);
  const feeder = matches.find(
    (x) => x.round === round && x.match_number === matchNum
  );
  if (!feeder) return "TBD";
  const pickedTeamId = picks[feeder.id];
  if (!pickedTeamId) return `Winner of R${round}-M${matchNum}`;
  return teamRegistry.find((t) => t.id === pickedTeamId)?.name ?? pickedTeamId;
}

function findDownstreamAffected(
  changedMatchId: string,
  oldTeamId: string | undefined,
  matches: TemplateMatch[],
  picks: Record<string, string>
): string[] {
  if (!oldTeamId) return [];
  const changedMatch = matches.find((m) => m.id === changedMatchId);
  if (!changedMatch) return [];

  const affected: string[] = [];

  function recurse(matchId: string, teamId: string) {
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;
    if (picks[matchId] !== teamId) return;
    affected.push(matchId);
    const ref = `w-r${match.round}m${match.match_number}`;
    matches
      .filter((m) => m.home_slot === ref || m.away_slot === ref)
      .forEach((dm) => recurse(dm.id, teamId));
  }

  const slotRef = `w-r${changedMatch.round}m${changedMatch.match_number}`;
  matches
    .filter((m) => m.home_slot === slotRef || m.away_slot === slotRef)
    .forEach((dm) => recurse(dm.id, oldTeamId));

  return affected;
}

// ─── preset emojis ──────────────────────────────────────────────────────────

const PRESET_EMOJIS = ["⚽", "🏆", "🔥", "💪", "👑", "🎯", "🤝", "⚡"];

// ─── view types ─────────────────────────────────────────────────────────────

type View = "entry" | "map" | "champion" | "identity" | "confirm";

// ─── main component ─────────────────────────────────────────────────────────

interface Props {
  league: League;
  matches: TemplateMatch[];
  teamRegistry: TeamEntry[];
}

export default function PickEntry({ league, matches, teamRegistry }: Props) {
  const rounds = Array.from(new Set(matches.map((m) => m.round))).sort(
    (a, b) => a - b
  );
  const totalRounds = rounds.length;

  const [picks, setPicks] = useState<Record<string, string>>({});
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [view, setView] = useState<View>("entry");
  const [displayName, setDisplayName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [magicToken, setMagicToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // cascade modal state
  const [cascadePending, setCascadePending] = useState<{
    matchId: string;
    teamId: string;
    affected: string[];
  } | null>(null);

  const currentRound = rounds[currentRoundIndex];
  const matchesThisRound = matches.filter((m) => m.round === currentRound);
  const pickedThisRound = matchesThisRound.filter((m) => picks[m.id]).length;
  const allPickedThisRound = pickedThisRound === matchesThisRound.length;

  function applyPick(matchId: string, teamId: string) {
    const oldTeamId = picks[matchId];
    if (oldTeamId === teamId) return; // no-op

    const affected = findDownstreamAffected(matchId, oldTeamId, matches, picks);

    if (affected.length > 0) {
      setCascadePending({ matchId, teamId, affected });
      return;
    }

    setPicks((prev) => ({ ...prev, [matchId]: teamId }));
  }

  function confirmCascade() {
    if (!cascadePending) return;
    const { matchId, teamId, affected } = cascadePending;
    setPicks((prev) => {
      const next = { ...prev, [matchId]: teamId };
      affected.forEach((id) => delete next[id]);
      return next;
    });
    setCascadePending(null);
  }

  function cancelCascade() {
    setCascadePending(null);
  }

  async function handleSubmit() {
    if (!displayName.trim() || displayName.trim().length < 2) {
      setSubmitError("Display name must be at least 2 characters.");
      return;
    }
    if (displayName.trim().length > 30) {
      setSubmitError("Display name must be 30 characters or fewer.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        leagueId: league.id,
        displayName: displayName.trim(),
        emoji: emoji || null,
        picks: Object.entries(picks).map(([slotId, teamId]) => ({
          slotId,
          teamId,
        })),
      };

      const res = await fetch("/api/submit-picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error ?? "Submission failed. Please try again.");
        return;
      }

      setMagicToken(data.magicToken);
      setView("confirm");
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const magicLink = magicToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/l/${league.id}/p/${magicToken}`
    : "";

  const totalPicks = Object.keys(picks).length;
  const shareText = `I'm in — ${totalPicks} picks · ${league.name}`;

  // ─── confirm view ──────────────────────────────────────────────────────────

  if (view === "confirm") {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <div className="max-w-sm w-full space-y-6">
          <div className="text-center space-y-2">
            <div className="text-4xl">✓</div>
            <h1 className="font-display text-2xl text-primary">You're in!</h1>
            <p className="text-secondary text-sm">
              {emoji ? `${emoji} ` : ""}
              {displayName}
            </p>
            <p className="text-muted text-xs">{league.name}</p>
          </div>

          <Card className="space-y-3">
            <p className="text-xs text-secondary font-semibold uppercase tracking-wide">
              Your bracket link — bookmark this!
            </p>
            <p className="text-xs text-muted break-all font-mono">{magicLink}</p>
            <Button
              variant="secondary"
              className="w-full text-sm"
              onClick={() => {
                navigator.clipboard.writeText(magicLink);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied!" : "Copy link"}
            </Button>
          </Card>

          <Button
            variant="secondary"
            className="w-full text-sm"
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: "Bracket.fyi",
                  text: shareText,
                  url: magicLink,
                });
              } else {
                navigator.clipboard.writeText(`${shareText} ${magicLink}`);
              }
            }}
          >
            Share to group chat
          </Button>

          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              window.location.href = magicLink;
            }}
          >
            Go to leaderboard
          </Button>
        </div>
      </div>
    );
  }

  // ─── identity view ─────────────────────────────────────────────────────────

  if (view === "identity") {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <div className="max-w-sm w-full space-y-6">
          <div className="text-center">
            <h1 className="font-display text-2xl text-primary">Almost there!</h1>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-primary">
              Your display name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={30}
              placeholder="e.g. Yonnas"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-primary placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <p className="text-xs text-muted text-right">
              {displayName.length}/30
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-primary">
              Pick an emoji (optional)
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESET_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(emoji === e ? "" : e)}
                  className={cn(
                    "text-2xl rounded-lg p-2 border transition-colors",
                    emoji === e
                      ? "border-accent bg-accent/10"
                      : "border-border bg-surface"
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {submitError && (
            <p className="text-wrong text-sm">{submitError}</p>
          )}

          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setView("champion")}
            >
              Back
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={submitting || displayName.trim().length < 2}
              onClick={handleSubmit}
            >
              {submitting ? "Submitting..." : "Submit picks"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── champion pick view ────────────────────────────────────────────────────

  if (view === "champion") {
    return (
      <div className="min-h-screen bg-canvas px-4 py-8">
        <div className="max-w-sm mx-auto space-y-6">
          <div className="text-center">
            <h1 className="font-display text-2xl text-primary">
              Choose your champion
            </h1>
            <p className="text-secondary text-sm mt-1">
              Who wins it all? +{league.scoring_config.champion_bonus} pts bonus
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {teamRegistry.map((team) => {
              const selected = picks["champion"] === team.id;
              return (
                <button
                  key={team.id}
                  onClick={() =>
                    setPicks((prev) => ({ ...prev, champion: team.id }))
                  }
                  className={cn(
                    "rounded-xl border p-3 text-sm font-semibold transition-colors text-left",
                    selected
                      ? "border-accent bg-accent text-canvas"
                      : "border-border bg-surface text-primary"
                  )}
                >
                  {team.flag_emoji && (
                    <span className="mr-1">{team.flag_emoji}</span>
                  )}
                  {team.name}
                </button>
              );
            })}
          </div>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setCurrentRoundIndex(totalRounds - 1);
                setView("entry");
              }}
            >
              Back
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={!picks["champion"]}
              onClick={() => setView("identity")}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── map view ──────────────────────────────────────────────────────────────

  if (view === "map") {
    return (
      <div className="min-h-screen bg-canvas px-4 py-6">
        <div className="max-w-sm mx-auto space-y-5">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-lg text-primary">Bracket map</h1>
            <Button
              variant="secondary"
              className="text-sm px-3 py-1.5"
              onClick={() => setView("entry")}
            >
              Back to entry
            </Button>
          </div>

          {rounds.map((round) => {
            const roundMatches = matches.filter((m) => m.round === round);
            return (
              <div key={round} className="space-y-2">
                <p className="text-xs text-muted uppercase tracking-wide font-semibold">
                  Round {round}
                </p>
                {roundMatches.map((match) => {
                  const home = resolveTeam(
                    match.home_slot,
                    matches,
                    teamRegistry,
                    picks
                  );
                  const away = resolveTeam(
                    match.away_slot,
                    matches,
                    teamRegistry,
                    picks
                  );
                  const picked = picks[match.id];
                  const pickedName = picked
                    ? (teamRegistry.find((t) => t.id === picked)?.name ?? picked)
                    : null;

                  return (
                    <div
                      key={match.id}
                      className="rounded-xl border border-border bg-surface p-3 text-sm"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-secondary">
                          {home} vs {away}
                        </span>
                        {pickedName ? (
                          <span className="text-accent font-semibold">
                            {pickedName}
                          </span>
                        ) : (
                          <span className="text-muted italic">unpicked</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {picks["champion"] && (
            <div className="space-y-2">
              <p className="text-xs text-muted uppercase tracking-wide font-semibold">
                Champion pick
              </p>
              <div className="rounded-xl border border-accent bg-accent/10 p-3 text-sm font-semibold text-accent">
                {teamRegistry.find((t) => t.id === picks["champion"])?.name ??
                  picks["champion"]}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── entry view (default) ──────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-canvas px-4 py-6">
      {cascadePending && (
        <CascadeModal
          count={cascadePending.affected.length}
          onConfirm={confirmCascade}
          onCancel={cancelCascade}
        />
      )}

      <div className="max-w-sm mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted uppercase tracking-wide">
              {league.name}
            </p>
            <h1 className="font-display text-lg text-primary mt-0.5">
              Round {currentRound} of {totalRounds}
            </h1>
            <p className="text-xs text-secondary mt-0.5">
              {pickedThisRound}/{matchesThisRound.length} picks
            </p>
          </div>

          {/* Map toggle */}
          <button
            onClick={() => setView("map")}
            className="rounded-lg border border-border bg-surface p-2 text-secondary hover:text-primary transition-colors"
            title="View bracket map"
            aria-label="View bracket map"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="4" rx="1" />
              <rect x="3" y="13" width="7" height="4" rx="1" />
              <rect x="14" y="8" width="7" height="4" rx="1" />
              <line x1="10" y1="5" x2="14" y2="10" />
              <line x1="10" y1="15" x2="14" y2="10" />
            </svg>
          </button>
        </div>

        {/* Matches */}
        <div className="space-y-3">
          {matchesThisRound.map((match) => {
            const home = resolveTeam(
              match.home_slot,
              matches,
              teamRegistry,
              picks
            );
            const away = resolveTeam(
              match.away_slot,
              matches,
              teamRegistry,
              picks
            );
            const homeTeam = teamRegistry.find(
              (t) => t.name === home || t.id === picks[match.id]
            );
            const awayTeam = teamRegistry.find((t) => t.name === away);

            // resolve team ids from slot
            const homeTeamId = (() => {
              if (match.home_slot.startsWith("seed-")) {
                const idx = parseInt(
                  match.home_slot.replace("seed-", ""),
                  10
                );
                return teamRegistry[idx]?.id;
              }
              const m = match.home_slot.match(/^w-r(\d+)m(\d+)$/);
              if (!m) return undefined;
              const feeder = matches.find(
                (x) =>
                  x.round === parseInt(m[1], 10) &&
                  x.match_number === parseInt(m[2], 10)
              );
              return feeder ? picks[feeder.id] : undefined;
            })();

            const awayTeamId = (() => {
              if (match.away_slot.startsWith("seed-")) {
                const idx = parseInt(
                  match.away_slot.replace("seed-", ""),
                  10
                );
                return teamRegistry[idx]?.id;
              }
              const m = match.away_slot.match(/^w-r(\d+)m(\d+)$/);
              if (!m) return undefined;
              const feeder = matches.find(
                (x) =>
                  x.round === parseInt(m[1], 10) &&
                  x.match_number === parseInt(m[2], 10)
              );
              return feeder ? picks[feeder.id] : undefined;
            })();

            const selectedTeamId = picks[match.id];

            const homeDisabled = !homeTeamId;
            const awayDisabled = !awayTeamId;

            return (
              <Card key={match.id}>
                <p className="text-xs text-muted mb-3 font-semibold uppercase tracking-wide">
                  R{match.round} · M{match.match_number}
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={homeDisabled}
                    onClick={() =>
                      homeTeamId && applyPick(match.id, homeTeamId)
                    }
                    className={cn(
                      "flex-1 rounded-lg border py-2.5 px-3 text-sm font-semibold transition-colors text-center",
                      homeDisabled && "opacity-40 cursor-not-allowed",
                      !homeDisabled &&
                        selectedTeamId === homeTeamId
                        ? "bg-accent text-canvas border-accent"
                        : "bg-raised border-border text-primary hover:border-accent/50"
                    )}
                  >
                    {home}
                  </button>
                  <button
                    disabled={awayDisabled}
                    onClick={() =>
                      awayTeamId && applyPick(match.id, awayTeamId)
                    }
                    className={cn(
                      "flex-1 rounded-lg border py-2.5 px-3 text-sm font-semibold transition-colors text-center",
                      awayDisabled && "opacity-40 cursor-not-allowed",
                      !awayDisabled &&
                        selectedTeamId === awayTeamId
                        ? "bg-accent text-canvas border-accent"
                        : "bg-raised border-border text-primary hover:border-accent/50"
                    )}
                  >
                    {away}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Nav */}
        <div className="flex gap-3 pt-2">
          {currentRoundIndex > 0 ? (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setCurrentRoundIndex((i) => i - 1)}
            >
              Back
            </Button>
          ) : (
            <div className="flex-1" />
          )}

          {currentRoundIndex < totalRounds - 1 ? (
            <Button
              variant="primary"
              className="flex-1"
              disabled={!allPickedThisRound}
              onClick={() => setCurrentRoundIndex((i) => i + 1)}
            >
              Next round
            </Button>
          ) : (
            <Button
              variant="primary"
              className="flex-1"
              disabled={!allPickedThisRound}
              onClick={() => setView("champion")}
            >
              Champion pick
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
