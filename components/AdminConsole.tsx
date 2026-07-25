"use client";

import { useState } from "react";
import { cn } from "@/lib/ui";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { League, TemplateMatch, TeamEntry, PickemCategory } from "@/lib/types";

interface ParticipantRow {
  id: string;
  display_name: string;
  emoji: string | null;
  magic_token: string;
  created_at: string;
}

interface ResultRow {
  template_match_id: string;
  winner_team_id: string | null;
  result_source?: string;
}

interface Props {
  league: League;
  participants: ParticipantRow[];
  matches: TemplateMatch[];
  teamRegistry: TeamEntry[];
  initialResults: ResultRow[];
  hasPicks: boolean;
  templateType?: string | null;
  categories?: PickemCategory[];
}

// ---- helpers ----

function resolveSlot(
  slot: string,
  round: number,
  teamRegistry: TeamEntry[],
  resultsMap: Map<string, string>
): string {
  if (round === 1) {
    // seed-0, seed-1, etc.
    const match = slot.match(/^seed-(\d+)$/);
    if (match) {
      const idx = parseInt(match[1], 10);
      return teamRegistry[idx]?.name ?? slot;
    }
    return slot;
  }
  // w-r{round}m{match} format
  const wMatch = slot.match(/^w-r(\d+)m(\d+)$/);
  if (wMatch) {
    return "TBD";
  }
  return slot;
}

// ---- Lock modal ----

type LockModalVariant = "empty" | "partial";

function LockConfirmModal({
  variant,
  participantCount,
  onConfirm,
  onCancel,
}: {
  variant: LockModalVariant;
  participantCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (variant === "empty") {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-raised border border-wrong/60 rounded-xl p-6 max-w-sm mx-4 w-full">
          <h2 className="font-semibold text-wrong text-lg mb-2">
            This league has no participants yet.
          </h2>
          <p className="text-secondary text-sm mb-5">
            Locking now means nobody can join or submit picks. Are you sure?
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <button
              onClick={onConfirm}
              className="rounded-lg px-4 py-2 text-sm font-semibold bg-wrong text-canvas hover:opacity-80 transition-opacity"
            >
              Lock anyway
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-raised border border-border rounded-xl p-6 max-w-sm mx-4 w-full">
        <h2 className="font-semibold text-primary text-lg mb-2">Lock picks now?</h2>
        <p className="text-secondary text-sm mb-5">
          This league has {participantCount} participant{participantCount !== 1 ? "s" : ""}. Lock picks now?
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            Lock
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- Pickem Results Section ----

function PickemResultsSection({
  league,
  matches,
  teamRegistry,
  resultsMap,
  onResultChange,
  categories,
  hasPicks,
}: {
  league: League;
  matches: TemplateMatch[];
  teamRegistry: TeamEntry[];
  resultsMap: Map<string, string>;
  onResultChange: (templateMatchId: string, winnerTeamId: string) => void;
  categories: PickemCategory[];
  hasPicks: boolean;
}) {
  async function handlePick(templateMatchId: string, teamId: string) {
    onResultChange(templateMatchId, teamId);
    await fetch("/api/admin/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leagueId: league.id,
        templateMatchId,
        winnerTeamId: teamId,
      }),
    });
  }

  if (!hasPicks) {
    return (
      <div className="pt-2 pb-4 px-1 space-y-1">
        <p className="text-secondary text-sm font-medium">Waiting for participants...</p>
        <p className="text-secondary text-xs">
          Results entry unlocks once at least one person has submitted picks.
          Share your join link to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      {categories.map((cat) => {
        const match = matches.find((m) => m.home_slot === `category:${cat.id}`);
        if (!match) return null;
        const winner = resultsMap.get(match.id);

        return (
          <div key={cat.id}>
            <p className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">
              {cat.name}
            </p>
            <div className="flex flex-wrap gap-2">
              {cat.nominees.map((nomineeId) => {
                const team = teamRegistry.find((t) => t.id === nomineeId);
                const name = team?.name ?? nomineeId;
                const isWinner = winner === nomineeId;
                return (
                  <button
                    key={nomineeId}
                    onClick={() => handlePick(match.id, nomineeId)}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm transition-colors",
                      isWinner
                        ? "bg-accent text-canvas font-semibold"
                        : "border border-border bg-surface text-primary hover:border-accent/60"
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {categories.length === 0 && (
        <p className="text-secondary text-sm">No categories found for this template.</p>
      )}
    </div>
  );
}

// ---- Section: Results Entry ----

function ResultsSection({
  league,
  matches,
  teamRegistry,
  resultsMap,
  onResultChange,
  hasPicks,
  templateType,
  categories,
}: {
  league: League;
  matches: TemplateMatch[];
  teamRegistry: TeamEntry[];
  resultsMap: Map<string, string>;
  onResultChange: (templateMatchId: string, winnerTeamId: string) => void;
  hasPicks: boolean;
  templateType?: string | null;
  categories?: PickemCategory[];
}) {
  // Build a lookup: (round, match_number) → match id, so w-r1m1 can resolve
  const matchByRoundNum = new Map<string, TemplateMatch>();
  for (const m of matches) {
    matchByRoundNum.set(`${m.round}-${m.match_number}`, m);
  }

  function resolveSlotFull(slot: string, round: number): string {
    if (round === 1) {
      const m = slot.match(/^seed-(\d+)$/);
      if (m) {
        const idx = parseInt(m[1], 10);
        return teamRegistry[idx]?.name ?? slot;
      }
      return slot;
    }
    const wm = slot.match(/^w-r(\d+)m(\d+)$/);
    if (wm) {
      const r = parseInt(wm[1], 10);
      const mn = parseInt(wm[2], 10);
      const refMatch = matchByRoundNum.get(`${r}-${mn}`);
      if (refMatch) {
        const winnerId = resultsMap.get(refMatch.id);
        if (winnerId) {
          const team = teamRegistry.find((t) => t.id === winnerId);
          return team?.name ?? winnerId;
        }
      }
      return "TBD";
    }
    return slot;
  }

  // Group matches by round
  const byRound = new Map<number, TemplateMatch[]>();
  for (const m of matches) {
    const arr = byRound.get(m.round) ?? [];
    arr.push(m);
    byRound.set(m.round, arr);
  }
  const rounds = Array.from(byRound.keys()).sort((a, b) => a - b);

  async function handlePick(templateMatchId: string, teamId: string) {
    onResultChange(templateMatchId, teamId);
    await fetch("/api/admin/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leagueId: league.id,
        templateMatchId,
        winnerTeamId: teamId,
      }),
    });
  }

  // Pickem format: delegate to PickemResultsSection
  if (templateType === "pickem") {
    return (
      <details open className="group">
        <summary className="cursor-pointer list-none flex items-center gap-2 py-3 px-1 select-none">
          <span className="text-sm font-semibold text-secondary uppercase tracking-wide">
            Enter results
          </span>
          <span className="ml-auto text-border group-open:rotate-90 transition-transform">▶</span>
        </summary>
        <PickemResultsSection
          league={league}
          matches={matches}
          teamRegistry={teamRegistry}
          resultsMap={resultsMap}
          onResultChange={onResultChange}
          categories={categories ?? []}
          hasPicks={hasPicks}
        />
      </details>
    );
  }

  return (
    <details open className="group">
      <summary className="cursor-pointer list-none flex items-center gap-2 py-3 px-1 select-none">
        <span className="text-sm font-semibold text-secondary uppercase tracking-wide">
          Enter results
        </span>
        <span className="ml-auto text-border group-open:rotate-90 transition-transform">▶</span>
      </summary>
      {!hasPicks ? (
        <div className="pt-2 pb-4 px-1 space-y-1">
          <p className="text-secondary text-sm font-medium">Waiting for participants...</p>
          <p className="text-secondary text-xs">
            Results entry unlocks once at least one person has submitted picks.
            Share your join link to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-6 pt-2">
          {rounds.map((round) => {
            const roundMatches = byRound.get(round)!;
            return (
              <div key={round}>
                <p className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">
                  Round {round}
                </p>
                <div className="space-y-2">
                  {roundMatches.map((match) => {
                    const homeTeam = resolveSlotFull(match.home_slot, match.round);
                    const awayTeam = resolveSlotFull(match.away_slot, match.round);
                    const homeId = getTeamId(match.home_slot, match.round, teamRegistry, matchByRoundNum, resultsMap);
                    const awayId = getTeamId(match.away_slot, match.round, teamRegistry, matchByRoundNum, resultsMap);
                    const winner = resultsMap.get(match.id);

                    return (
                      <Card key={match.id} className="flex items-center gap-3 py-2 px-3">
                        <span className="text-xs text-secondary w-20 shrink-0">
                          Match {match.match_number}
                        </span>
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => homeId && handlePick(match.id, homeId)}
                            disabled={!homeId || homeTeam === "TBD"}
                            className={cn(
                              "rounded-lg px-3 py-2 text-sm transition-colors",
                              winner === homeId
                                ? "bg-accent text-canvas font-semibold"
                                : "border border-border bg-surface text-primary hover:border-accent/60",
                              (!homeId || homeTeam === "TBD") && "opacity-40 cursor-not-allowed"
                            )}
                          >
                            {homeTeam}
                          </button>
                          <button
                            onClick={() => awayId && handlePick(match.id, awayId)}
                            disabled={!awayId || awayTeam === "TBD"}
                            className={cn(
                              "rounded-lg px-3 py-2 text-sm transition-colors",
                              winner === awayId
                                ? "bg-accent text-canvas font-semibold"
                                : "border border-border bg-surface text-primary hover:border-accent/60",
                              (!awayId || awayTeam === "TBD") && "opacity-40 cursor-not-allowed"
                            )}
                          >
                            {awayTeam}
                          </button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {matches.length === 0 && (
            <p className="text-secondary text-sm">No matches found for this league&apos;s template.</p>
          )}
        </div>
      )}
    </details>
  );
}

function getTeamId(
  slot: string,
  round: number,
  teamRegistry: TeamEntry[],
  matchByRoundNum: Map<string, TemplateMatch>,
  resultsMap: Map<string, string>
): string | null {
  if (round === 1) {
    const m = slot.match(/^seed-(\d+)$/);
    if (m) {
      const idx = parseInt(m[1], 10);
      return teamRegistry[idx]?.id ?? null;
    }
    return null;
  }
  const wm = slot.match(/^w-r(\d+)m(\d+)$/);
  if (wm) {
    const r = parseInt(wm[1], 10);
    const mn = parseInt(wm[2], 10);
    const refMatch = matchByRoundNum.get(`${r}-${mn}`);
    if (refMatch) {
      return resultsMap.get(refMatch.id) ?? null;
    }
  }
  return null;
}

// ---- Section: Lock Control ----

function LockSection({
  league,
  locked,
  lockedAt,
  participantCount,
  onLock,
  onUnlock,
}: {
  league: League;
  locked: boolean;
  lockedAt: string | null;
  participantCount: number;
  onLock: (lockedAt: string) => void;
  onUnlock: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<LockModalVariant | null>(null);

  const status = league.status === "complete" ? "COMPLETE" : locked ? "LOCKED" : "ACTIVE";

  function handleLockClick() {
    if (participantCount === 0) {
      setModal("empty");
    } else {
      setModal("partial");
    }
  }

  async function confirmLock() {
    setModal(null);
    setLoading(true);
    const res = await fetch("/api/admin/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leagueId: league.id }),
    });
    const data = await res.json();
    if (data.success) onLock(data.lockedAt);
    setLoading(false);
  }

  async function handleUnlock() {
    setLoading(true);
    await fetch("/api/admin/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leagueId: league.id }),
    });
    onUnlock();
    setLoading(false);
  }

  return (
    <>
      {modal && (
        <LockConfirmModal
          variant={modal}
          participantCount={participantCount}
          onConfirm={confirmLock}
          onCancel={() => setModal(null)}
        />
      )}
      <details open className="group">
        <summary className="cursor-pointer list-none flex items-center gap-2 py-3 px-1 select-none">
          <span className="text-sm font-semibold text-secondary uppercase tracking-wide">
            Pick lock
          </span>
          <span className="ml-auto text-border group-open:rotate-90 transition-transform">▶</span>
        </summary>
        <Card className="mt-2 flex items-center gap-4 flex-wrap">
          <span
            className={cn(
              "text-xs font-bold px-2 py-1 rounded-full",
              status === "ACTIVE" && "bg-correct/20 text-correct",
              status === "LOCKED" && "bg-accent/20 text-accent",
              status === "COMPLETE" && "bg-border/40 text-secondary"
            )}
          >
            {status}
          </span>
          {!locked && status !== "COMPLETE" && (
            <Button onClick={handleLockClick} disabled={loading}>
              Lock picks now
            </Button>
          )}
          {locked && (
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-sm text-secondary">
                Locked at {lockedAt ? new Date(lockedAt).toLocaleString() : "—"}
              </span>
              <button
                onClick={handleUnlock}
                disabled={loading}
                className="text-xs text-secondary underline hover:text-primary transition-colors disabled:opacity-40"
              >
                Unlock (emergency)
              </button>
            </div>
          )}
        </Card>
      </details>
    </>
  );
}

// ---- Section: Participants ----

function ParticipantRowItem({
  participant,
  leagueId,
  onRename,
  onRemove,
}: {
  participant: ParticipantRow;
  leagueId: string;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(participant.display_name);
  const [showLink, setShowLink] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  const magicLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/l/${leagueId}/p/${participant.magic_token}`
      : `/l/${leagueId}/p/${participant.magic_token}`;

  async function submitRename() {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === participant.display_name) {
      setRenaming(false);
      setNameInput(participant.display_name);
      return;
    }
    await fetch("/api/admin/participant", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId: participant.id, displayName: trimmed }),
    });
    onRename(participant.id, trimmed);
    setRenaming(false);
  }

  async function confirmRemove() {
    await fetch("/api/admin/participant", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId: participant.id }),
    });
    onRemove(participant.id);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(magicLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="border border-border rounded-lg px-3 py-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-base">{participant.emoji ?? "👤"}</span>
        {renaming ? (
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
              if (e.key === "Escape") {
                setRenaming(false);
                setNameInput(participant.display_name);
              }
            }}
            className="bg-canvas border border-accent rounded px-2 py-0.5 text-sm text-primary focus:outline-none"
          />
        ) : (
          <span className="text-sm text-primary font-medium">{participant.display_name}</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {!confirming && (
            <>
              <button
                onClick={() => setRenaming(true)}
                className="text-xs text-secondary hover:text-primary transition-colors px-1"
              >
                Rename
              </button>
              <button
                onClick={() => setShowLink((v) => !v)}
                className="text-xs text-secondary hover:text-primary transition-colors px-1"
                title="Reshare invite link"
              >
                🔗
              </button>
              <button
                onClick={() => setConfirming(true)}
                className="text-xs text-wrong hover:opacity-80 transition-opacity px-1"
              >
                Remove
              </button>
            </>
          )}
          {confirming && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-secondary">Remove {participant.display_name}?</span>
              <button
                onClick={confirmRemove}
                className="text-xs text-wrong font-semibold hover:opacity-80 px-1"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="text-xs text-secondary hover:text-primary px-1"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {showLink && (
        <div className="flex items-center gap-2 mt-1 bg-canvas rounded px-2 py-1.5">
          <span className="text-xs text-secondary truncate flex-1 font-mono">{magicLink}</span>
          <button
            onClick={copyLink}
            className="text-xs text-accent hover:opacity-80 shrink-0 font-medium"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}

function ParticipantsSection({
  league,
  participants,
  onRename,
  onRemove,
}: {
  league: League;
  participants: ParticipantRow[];
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <details open className="group">
      <summary className="cursor-pointer list-none flex items-center gap-2 py-3 px-1 select-none">
        <span className="text-sm font-semibold text-secondary uppercase tracking-wide">
          Participants ({participants.length})
        </span>
        <span className="ml-auto text-border group-open:rotate-90 transition-transform">▶</span>
      </summary>
      <div className="space-y-2 pt-2">
        {participants.map((p) => (
          <ParticipantRowItem
            key={p.id}
            participant={p}
            leagueId={league.id}
            onRename={onRename}
            onRemove={onRemove}
          />
        ))}
        {participants.length === 0 && (
          <p className="text-secondary text-sm">No participants yet.</p>
        )}
      </div>
    </details>
  );
}

// ---- Section: Edit competitors ----

function CompetitorRow({
  team,
  leagueId,
  onRename,
}: {
  team: TeamEntry;
  leagueId: string;
  onRename: (teamId: string, newName: string) => void;
}) {
  const isBye = team.id.startsWith("bye-");
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(team.name);

  async function submitRename() {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === team.name) {
      setRenaming(false);
      setNameInput(team.name);
      return;
    }
    await fetch("/api/admin/competitor", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leagueId, teamId: team.id, newName: trimmed }),
    });
    onRename(team.id, trimmed);
    setRenaming(false);
  }

  return (
    <div className="flex items-center gap-3 border border-border rounded-lg px-3 py-2">
      <span className="text-xs text-secondary font-mono w-16 shrink-0">{team.id}</span>
      {isBye ? (
        <span className="text-sm text-secondary flex-1 italic">{team.name} (bye)</span>
      ) : renaming ? (
        <input
          autoFocus
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onBlur={submitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitRename();
            if (e.key === "Escape") {
              setRenaming(false);
              setNameInput(team.name);
            }
          }}
          className="bg-canvas border border-accent rounded px-2 py-0.5 text-sm text-primary focus:outline-none flex-1"
        />
      ) : (
        <span className="text-sm text-primary flex-1">{team.name}</span>
      )}
      {!isBye && !renaming && (
        <button
          onClick={() => setRenaming(true)}
          className="text-xs text-secondary hover:text-primary transition-colors px-1 shrink-0"
        >
          Rename
        </button>
      )}
    </div>
  );
}

function CompetitorsSection({
  league,
  teamRegistry,
  onRename,
}: {
  league: League;
  teamRegistry: TeamEntry[];
  onRename: (teamId: string, newName: string) => void;
}) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none flex items-center gap-2 py-3 px-1 select-none">
        <span className="text-sm font-semibold text-secondary uppercase tracking-wide">
          Edit competitors ({teamRegistry.length})
        </span>
        <span className="ml-auto text-border group-open:rotate-90 transition-transform">▶</span>
      </summary>
      <div className="space-y-2 pt-2">
        {teamRegistry.map((team) => (
          <CompetitorRow
            key={team.id}
            team={team}
            leagueId={league.id}
            onRename={onRename}
          />
        ))}
        {teamRegistry.length === 0 && (
          <p className="text-secondary text-sm">No competitors found.</p>
        )}
      </div>
    </details>
  );
}

// ---- Section: Broadcast ----

function BroadcastSection({
  league,
  announcement,
  onAnnouncementChange,
}: {
  league: League;
  announcement: string | null;
  onAnnouncementChange: (text: string | null) => void;
}) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!message.trim()) return;
    setSending(true);
    await fetch("/api/admin/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leagueId: league.id, message: message.trim() }),
    });
    onAnnouncementChange(message.trim());
    setMessage("");
    setSending(false);
  }

  async function handleClear() {
    await fetch("/api/admin/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leagueId: league.id, message: null }),
    });
    onAnnouncementChange(null);
  }

  return (
    <details open className="group">
      <summary className="cursor-pointer list-none flex items-center gap-2 py-3 px-1 select-none">
        <span className="text-sm font-semibold text-secondary uppercase tracking-wide">
          Announce to league
        </span>
        <span className="ml-auto text-border group-open:rotate-90 transition-transform">▶</span>
      </summary>
      <div className="space-y-3 pt-2">
        {announcement && (
          <div className="flex items-start gap-3 bg-accent/10 border border-accent/30 rounded-lg px-3 py-2">
            <p className="text-sm text-accent flex-1">{announcement}</p>
            <button
              onClick={handleClear}
              className="text-xs text-secondary hover:text-primary shrink-0 underline"
            >
              Clear
            </button>
          </div>
        )}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Send a message to all participants..."
          rows={3}
          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-primary placeholder:text-secondary resize-none focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <Button
          onClick={handleSend}
          disabled={!message.trim() || sending}
        >
          {sending ? "Sending..." : "Send"}
        </Button>
      </div>
    </details>
  );
}

// ---- Root component ----

export function AdminConsole({
  league,
  participants: initialParticipants,
  matches,
  teamRegistry: initialTeamRegistry,
  initialResults,
  hasPicks,
  templateType,
  categories,
}: Props) {
  const [resultsMap, setResultsMap] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const r of initialResults) {
      if (r.winner_team_id) m.set(r.template_match_id, r.winner_team_id);
    }
    return m;
  });
  const [locked, setLocked] = useState(!!league.locked_at);
  const [lockedAt, setLockedAt] = useState<string | null>(league.locked_at);
  const [participants, setParticipants] = useState(initialParticipants);
  const [announcement, setAnnouncement] = useState<string | null>(league.announcement_text);
  const [teamRegistry, setTeamRegistry] = useState(initialTeamRegistry);

  function handleResultChange(templateMatchId: string, winnerTeamId: string) {
    setResultsMap((prev) => {
      const next = new Map(prev);
      next.set(templateMatchId, winnerTeamId);
      return next;
    });
  }

  function handleLock(lockedAtTs: string) {
    setLocked(true);
    setLockedAt(lockedAtTs);
  }

  function handleUnlock() {
    setLocked(false);
    setLockedAt(null);
  }

  function handleRename(id: string, name: string) {
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, display_name: name } : p))
    );
  }

  function handleRemove(id: string) {
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  }

  function handleCompetitorRename(teamId: string, newName: string) {
    setTeamRegistry((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, name: newName } : t))
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-primary">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-1">
        <h1 className="text-lg font-bold text-primary mb-1">{league.name}</h1>
        <p className="text-xs text-secondary mb-6">Admin console</p>

        <div className="divide-y divide-border">
          <ResultsSection
            league={league}
            matches={matches}
            teamRegistry={teamRegistry}
            resultsMap={resultsMap}
            onResultChange={handleResultChange}
            hasPicks={hasPicks}
            templateType={templateType}
            categories={categories}
          />
          <LockSection
            league={league}
            locked={locked}
            lockedAt={lockedAt}
            participantCount={participants.length}
            onLock={handleLock}
            onUnlock={handleUnlock}
          />
          <ParticipantsSection
            league={league}
            participants={participants}
            onRename={handleRename}
            onRemove={handleRemove}
          />
          <CompetitorsSection
            league={league}
            teamRegistry={teamRegistry}
            onRename={handleCompetitorRename}
          />
          <BroadcastSection
            league={league}
            announcement={announcement}
            onAnnouncementChange={setAnnouncement}
          />
        </div>
      </div>
    </div>
  );
}
