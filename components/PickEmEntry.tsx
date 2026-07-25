"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/ui";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import LockedState from "@/components/LockedState";
import type { League, PickemCategory, TeamEntry, TemplateMatch } from "@/lib/types";

// ─── preset emojis (same as PickEntry) ──────────────────────────────────────

const PRESET_EMOJIS = ["⚽", "🏆", "🔥", "💪", "👑", "🎯", "🤝", "⚡"];

// ─── view types ─────────────────────────────────────────────────────────────

type View = "entry" | "identity" | "confirm";

// ─── props ──────────────────────────────────────────────────────────────────

interface Props {
  league: League;
  categories: PickemCategory[];
  teamRegistry: TeamEntry[];
  templateMatches: TemplateMatch[];
}

// ─── main component ─────────────────────────────────────────────────────────

export default function PickEmEntry({
  league,
  categories,
  teamRegistry,
  templateMatches,
}: Props) {
  // Build category id → template_match.id lookup (memoized)
  const categoryMatchId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const cat of categories) {
      const match = templateMatches.find(
        (m) => m.home_slot === `category:${cat.id}`
      );
      if (match) map[cat.id] = match.id;
    }
    return map;
  }, [categories, templateMatches]);

  // picks: matchId → teamId
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [view, setView] = useState<View>("entry");
  const [displayName, setDisplayName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [magicToken, setMagicToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const pickedCount = Object.keys(picks).length;
  const totalCount = categories.length;
  const allPicked = pickedCount === totalCount;

  // ─── locked state ──────────────────────────────────────────────────────────

  const isLocked = !!league.locked_at && new Date(league.locked_at) <= new Date();
  if (isLocked) {
    return (
      <LockedState
        leagueName={league.name}
        lockedAt={league.locked_at!}
        leagueId={league.id}
      />
    );
  }

  // ─── submit handler ────────────────────────────────────────────────────────

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
              Your picks link — bookmark this!
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
                  text: `I picked ${totalCount} Oscar categories · ${league.name}`,
                  url: magicLink,
                });
              } else {
                navigator.clipboard.writeText(
                  `I picked ${totalCount} Oscar categories · ${league.name} ${magicLink}`
                );
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
            <p className="text-secondary text-sm mt-1">
              {pickedCount}/{totalCount} categories picked
            </p>
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
            <p className="text-xs text-muted text-right">{displayName.length}/30</p>
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
              onClick={() => setView("entry")}
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

  // ─── entry view ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-canvas">
      {/* Sticky progress header */}
      <div className="sticky top-0 z-10 bg-canvas/95 backdrop-blur border-b border-border px-4 py-3">
        <p className="text-xs text-muted uppercase tracking-wide">{league.name}</p>
        <div className="flex items-center justify-between mt-0.5">
          <h1 className="font-display text-base text-primary">
            {pickedCount}/{totalCount} categories picked
          </h1>
          <div className="flex gap-0.5">
            {categories.map((cat) => {
              const matchId = categoryMatchId[cat.id];
              const picked = matchId ? !!picks[matchId] : false;
              return (
                <div
                  key={cat.id}
                  className={cn(
                    "h-1 rounded-full",
                    picked ? "bg-accent" : "bg-border"
                  )}
                  style={{ width: `${Math.max(4, Math.floor(200 / totalCount))}px` }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Category cards */}
      <div className="px-4 py-4 pb-28 space-y-4 max-w-sm mx-auto">
        {categories.map((cat) => {
          const matchId = categoryMatchId[cat.id];
          return (
            <div
              key={cat.id}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
                {cat.name}
              </p>
              <div className="space-y-2">
                {cat.nominees.map((nomineeId) => {
                  const team = teamRegistry.find((t) => t.id === nomineeId);
                  const isSelected = matchId
                    ? picks[matchId] === nomineeId
                    : false;
                  return (
                    <button
                      key={nomineeId}
                      onClick={() => {
                        if (matchId) {
                          setPicks((prev) => ({
                            ...prev,
                            [matchId]: nomineeId,
                          }));
                        }
                      }}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors focus:outline-none",
                        isSelected
                          ? "bg-accent text-canvas font-semibold border-accent"
                          : "border-border bg-canvas text-primary hover:border-accent/50"
                      )}
                    >
                      {team?.name ?? nomineeId}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Fixed bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-canvas/95 backdrop-blur border-t border-border px-4 pt-3 pb-6">
        <div className="max-w-sm mx-auto">
          <Button
            className="w-full py-3"
            disabled={!allPicked}
            onClick={() => setView("identity")}
          >
            {allPicked
              ? "Submit picks"
              : `Pick ${totalCount - pickedCount} more categor${totalCount - pickedCount === 1 ? "y" : "ies"}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
