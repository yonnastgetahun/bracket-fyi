"use client";

import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/ui";
import { SCORING_PRESETS, perfectScore } from "@/lib/scoring";
import type { ScoringConfig, ScoringPreset, TeamEntry } from "@/lib/types";
import type { PublicTemplate } from "@/lib/league-data";

// ─── Bracket size inference ───────────────────────────────────────────────────
function inferBracketSize(count: number): number {
  if (count <= 4) return 4;
  if (count <= 8) return 8;
  if (count <= 16) return 16;
  if (count <= 32) return 32;
  return 64;
}

// rounds array for a single-elimination bracket of `slots` teams
function bracketRounds(slots: number): [number, number][] {
  const rounds: [number, number][] = [];
  let remaining = slots;
  let round = 1;
  while (remaining > 1) {
    rounds.push([round, remaining / 2]);
    remaining = remaining / 2;
    round++;
  }
  return rounds;
}

// ─── Template kind ────────────────────────────────────────────────────────────
type TemplateKind = "custom" | "sweet16" | "rap-albums" | "oscars";

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-1.5 justify-center mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-1 rounded-full transition-all",
            i === current ? "bg-accent w-6" : "bg-border w-2"
          )}
        />
      ))}
    </div>
  );
}

// ─── Step 1: Choose template ──────────────────────────────────────────────────
function StepTemplate({
  onNext,
  templates,
  templateKind,
  setTemplateKind,
}: {
  onNext: () => void;
  templates: PublicTemplate[];
  templateKind: TemplateKind | null;
  setTemplateKind: (k: TemplateKind) => void;
}) {
  const sweet16 = templates.find((t) => t.name === "March Madness Sweet 16 (2025)");
  const rapAlbums = templates.find((t) => t.name === "Greatest Rap Albums");
  const oscars = templates.find((t) => t.name === "Oscars 2025 (97th Academy Awards)");

  const cards: {
    id: TemplateKind;
    label: string;
    description: string;
    badge: string | null;
    selectable: boolean;
  }[] = [
    {
      id: "custom",
      label: "Custom bracket",
      description: "Build your own from scratch. Any names, any group.",
      badge: null,
      selectable: true,
    },
    {
      id: "sweet16",
      label: sweet16?.name ?? "March Madness Sweet 16 (2025)",
      description:
        "The 2025 Men's NCAA Sweet 16. 15 matches. Enter results as your group plays along.",
      badge: sweet16 ? "Ready" : null,
      selectable: !!sweet16,
    },
    {
      id: "rap-albums",
      label: rapAlbums?.name ?? "Greatest Rap Albums",
      description:
        "Pick 4 or 8 albums from a curated pool of 100. Let the group decide the GOAT.",
      badge: rapAlbums ? "Ready" : null,
      selectable: !!rapAlbums,
    },
    {
      id: "oscars",
      label: oscars?.name ?? "Oscars 2025 (97th Academy Awards)",
      description: "23 categories, one winner each. Pick'em style.",
      badge: "Pick'em launches this week",
      selectable: false,
    },
  ];

  const canContinue = templateKind !== null && templateKind !== "oscars";

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-primary mb-1">
        Choose a template
      </h2>
      <p className="text-secondary text-sm mb-6">Pick what you&apos;re bracketing.</p>

      <div className="grid grid-cols-2 gap-3 mb-8">
        {cards.map((c) => (
          <button
            key={c.id}
            disabled={!c.selectable}
            onClick={() => {
              if (c.selectable) setTemplateKind(c.id);
            }}
            className={cn(
              "rounded-xl border p-4 text-left transition-all focus:outline-none",
              c.selectable
                ? templateKind === c.id
                  ? "border-accent bg-surface"
                  : "border-border bg-surface hover:border-secondary"
                : "border-border bg-surface opacity-40 cursor-not-allowed"
            )}
          >
            <p
              className={cn(
                "font-semibold text-sm",
                c.selectable ? "text-primary" : "text-secondary"
              )}
            >
              {c.label}
            </p>
            {c.description && (
              <p className="mt-1.5 text-xs text-muted font-body leading-relaxed">
                {c.description}
              </p>
            )}
            {c.badge && (
              <span
                className={cn(
                  "mt-2 inline-block text-xs font-body",
                  c.selectable ? "text-accent" : "text-muted"
                )}
              >
                {c.badge}
              </span>
            )}
            {c.selectable && templateKind === c.id && !c.badge && (
              <span className="mt-1.5 inline-block text-xs text-accent font-body">
                Selected
              </span>
            )}
          </button>
        ))}
      </div>

      <Button
        className="w-full py-3"
        disabled={!canContinue}
        onClick={onNext}
      >
        Continue &rarr;
      </Button>
    </div>
  );
}

// ─── Step 2a: Custom — Add competitors ───────────────────────────────────────
function StepCompetitors({
  onNext,
  names,
  setNames,
}: {
  onNext: () => void;
  names: string[];
  setNames: (n: string[]) => void;
}) {
  const [raw, setRaw] = useState(names.join("\n"));

  const parsed = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const slotSize = inferBracketSize(parsed.length);
  const byes = slotSize - parsed.length;
  const valid = parsed.length >= 3;

  const handleContinue = () => {
    setNames(parsed);
    onNext();
  };

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-primary mb-1">
        Add competitors
      </h2>
      <p className="text-secondary text-sm mb-6">One name per line.</p>

      <textarea
        className="w-full rounded-lg border border-border bg-surface text-primary text-sm p-3 font-body resize-none focus:outline-none focus:ring-1 focus:ring-accent"
        rows={10}
        placeholder={"Team A\nTeam B\nTeam C\n..."}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />

      <div className="mt-3 mb-6 text-sm text-secondary">
        {parsed.length === 0 ? (
          <span>Enter at least 3 names to continue.</span>
        ) : (
          <span>
            <span className="text-primary font-semibold">{parsed.length} names</span>
            {" → "}
            <span className="text-primary font-semibold">{slotSize}-slot bracket</span>
            {byes > 0 && (
              <span className="text-muted">
                {" "}
                ({byes} bye{byes > 1 ? "s" : ""} added)
              </span>
            )}
          </span>
        )}
      </div>

      <Button className="w-full py-3" disabled={!valid} onClick={handleContinue}>
        Continue &rarr;
      </Button>
    </div>
  );
}

// ─── Step 2b: Sweet 16 — Preview ─────────────────────────────────────────────
function StepSweet16Preview({
  onNext,
  teams,
}: {
  onNext: () => void;
  teams: TeamEntry[];
}) {
  const preview = teams.slice(0, 4);
  const rest = teams.length - preview.length;

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-primary mb-1">
        Teams loaded
      </h2>
      <p className="text-secondary text-sm mb-6">
        This template comes with {teams.length} teams already loaded.
      </p>

      <Card className="mb-6">
        <ul className="space-y-2">
          {preview.map((t) => (
            <li key={t.id} className="text-sm text-primary">
              {t.name}
            </li>
          ))}
          {rest > 0 && (
            <li className="text-sm text-muted">…and {rest} more</li>
          )}
        </ul>
      </Card>

      <Button className="w-full py-3" onClick={onNext}>
        Continue &rarr;
      </Button>
    </div>
  );
}

// ─── Step 2c: Rap Albums — Curated pool picker ────────────────────────────────
function StepRapAlbumPicker({
  onNext,
  allAlbums,
  selectedIds,
  setSelectedIds,
  bracketSize,
  setBracketSize,
}: {
  onNext: () => void;
  allAlbums: TeamEntry[];
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  bracketSize: 4 | 8;
  setBracketSize: (n: 4 | 8) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return allAlbums;
    return allAlbums.filter((a) => {
      const haystack = `${a.name} ${a.aliases.join(" ")}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [allAlbums, search]);

  const toggleAlbum = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
    } else if (selectedIds.length < bracketSize) {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleSizeChange = (n: 4 | 8) => {
    setBracketSize(n);
    setSelectedIds([]);
  };

  const canContinue = selectedIds.length === bracketSize;

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-primary mb-1">
        Build your bracket
      </h2>
      <p className="text-secondary text-sm mb-4">
        Pick exactly {bracketSize} albums from the pool of {allAlbums.length}.
      </p>

      {/* Size toggle */}
      <div className="flex gap-2 mb-4">
        {([4, 8] as const).map((n) => (
          <button
            key={n}
            onClick={() => handleSizeChange(n)}
            className={cn(
              "flex-1 rounded-lg border py-2 text-sm font-semibold transition-all focus:outline-none",
              bracketSize === n
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-surface text-secondary hover:border-secondary"
            )}
          >
            {n} albums
          </button>
        ))}
      </div>

      {/* Selected count */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-secondary">
          {selectedIds.length} / {bracketSize} selected
        </span>
        {selectedIds.length > 0 && (
          <button
            className="text-xs text-muted hover:text-secondary"
            onClick={() => setSelectedIds([])}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search albums..."
        className="w-full rounded-lg border border-border bg-surface text-primary text-sm p-2.5 font-body focus:outline-none focus:ring-1 focus:ring-accent mb-3"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Album list */}
      <div className="rounded-lg border border-border bg-surface overflow-y-auto max-h-64 mb-6">
        {filtered.length === 0 && (
          <p className="text-sm text-muted p-4 text-center">No albums match.</p>
        )}
        {filtered.map((album) => {
          const isSelected = selectedIds.includes(album.id);
          const isFull = selectedIds.length >= bracketSize && !isSelected;
          return (
            <button
              key={album.id}
              disabled={isFull}
              onClick={() => toggleAlbum(album.id)}
              className={cn(
                "w-full flex items-center justify-between px-4 py-2.5 text-left text-sm border-b border-border last:border-b-0 transition-colors focus:outline-none",
                isSelected
                  ? "bg-accent/10 text-accent"
                  : isFull
                  ? "text-muted cursor-not-allowed"
                  : "text-primary hover:bg-surface"
              )}
            >
              <span>{album.name}</span>
              {isSelected && <span className="text-accent text-xs">✓</span>}
            </button>
          );
        })}
      </div>

      <Button className="w-full py-3" disabled={!canContinue} onClick={onNext}>
        Continue &rarr;
      </Button>
    </div>
  );
}

// ─── Step 3: Name + lock time ─────────────────────────────────────────────────
function StepNameLock({
  onNext,
  leagueName,
  setLeagueName,
  lockedAt,
  setLockedAt,
}: {
  onNext: () => void;
  leagueName: string;
  setLeagueName: (v: string) => void;
  lockedAt: string;
  setLockedAt: (v: string) => void;
}) {
  const valid = leagueName.trim().length > 0;

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-primary mb-1">
        Name your league
      </h2>
      <p className="text-secondary text-sm mb-6">You can update this later.</p>

      <div className="mb-4">
        <label className="block text-sm text-secondary mb-1.5">League name</label>
        <input
          type="text"
          maxLength={60}
          className="w-full rounded-lg border border-border bg-surface text-primary text-sm p-3 font-body focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="e.g. Boyz WC2026"
          value={leagueName}
          onChange={(e) => setLeagueName(e.target.value)}
        />
        <p className="text-xs text-muted mt-1 text-right">{leagueName.length}/60</p>
      </div>

      <div className="mb-8">
        <label className="block text-sm text-secondary mb-1.5">
          Picks lock at <span className="text-muted">(optional)</span>
        </label>
        <input
          type="datetime-local"
          className="w-full rounded-lg border border-border bg-surface text-primary text-sm p-3 font-body focus:outline-none focus:ring-1 focus:ring-accent [color-scheme:dark]"
          value={lockedAt}
          onChange={(e) => setLockedAt(e.target.value)}
        />
        <p className="text-xs text-muted mt-1">
          You can set or change this later from the admin console.
        </p>
      </div>

      <Button className="w-full py-3" disabled={!valid} onClick={onNext}>
        Continue &rarr;
      </Button>
    </div>
  );
}

// ─── Step 4: Scoring ──────────────────────────────────────────────────────────
const PRESET_META: {
  id: Exclude<ScoringPreset, "upset_hunter">;
  label: string;
  desc: string;
  recommended?: boolean;
}[] = [
  { id: "flat", label: "Flat", desc: "1 pt per correct pick, every round" },
  {
    id: "classic_escalating",
    label: "Classic Escalating",
    desc: "1 / 2 / 4 / 8 / 16 / 32",
  },
  {
    id: "late_rounds_matter",
    label: "Late-Rounds-Matter",
    desc: "1 / 1 / 2 / 2, champion +2",
    recommended: true,
  },
  {
    id: "custom",
    label: "Custom",
    desc: "Set your own points per round",
  },
];

function StepScoring({
  onNext,
  scoringConfig,
  setScoringConfig,
  preset,
  setPreset,
  teamCount,
}: {
  onNext: () => void;
  scoringConfig: ScoringConfig;
  setScoringConfig: (c: ScoringConfig) => void;
  preset: ScoringPreset;
  setPreset: (p: ScoringPreset) => void;
  teamCount: number;
}) {
  const slotSize = inferBracketSize(teamCount);
  const rounds = bracketRounds(slotSize);
  const numRounds = rounds.length;

  const selectPreset = (id: Exclude<ScoringPreset, "upset_hunter">) => {
    setPreset(id);
    if (id !== "custom") {
      setScoringConfig(SCORING_PRESETS[id]);
    }
  };

  const updateRoundPts = (round: number, val: string) => {
    const pts = Math.max(0, parseInt(val) || 0);
    setScoringConfig({
      ...scoringConfig,
      round_points: { ...scoringConfig.round_points, [round.toString()]: pts },
    });
  };

  const updateChampionBonus = (val: string) => {
    setScoringConfig({
      ...scoringConfig,
      champion_bonus: Math.max(0, parseInt(val) || 0),
    });
  };

  const perfect = perfectScore(scoringConfig, rounds);

  const breakdown = [
    ...rounds.map(([r, count]) => {
      const pts = scoringConfig.round_points[r.toString()] ?? 0;
      return `Round ${r}: ${pts}pt × ${count} = ${pts * count}`;
    }),
    ...(scoringConfig.champion_bonus > 0
      ? [`Champion: +${scoringConfig.champion_bonus}`]
      : []),
  ].join(" · ");

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-primary mb-1">
        Scoring
      </h2>
      <p className="text-secondary text-sm mb-6">How many points per correct pick?</p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {PRESET_META.map((p) => (
          <button
            key={p.id}
            onClick={() => selectPreset(p.id)}
            className={cn(
              "rounded-xl border p-3 text-left transition-all focus:outline-none",
              preset === p.id
                ? "border-accent bg-accent/10"
                : "border-border bg-surface hover:border-secondary"
            )}
          >
            <div className="flex items-start justify-between gap-1">
              <p className="font-semibold text-sm text-primary">{p.label}</p>
              {p.recommended && (
                <span className="text-xs text-accent shrink-0">Rec.</span>
              )}
            </div>
            <p className="text-xs text-secondary mt-0.5">{p.desc}</p>
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <Card className="mb-4">
          <p className="text-sm text-secondary mb-3">Points per round</p>
          <div className="space-y-2">
            {Array.from({ length: numRounds }, (_, i) => i + 1).map((r) => (
              <div key={r} className="flex items-center justify-between gap-4">
                <label className="text-sm text-primary">
                  Round {r}
                  {r === numRounds ? " (Final)" : ""}
                </label>
                <input
                  type="number"
                  min={0}
                  className="w-16 rounded border border-border bg-canvas text-primary text-sm p-1.5 text-center focus:outline-none focus:ring-1 focus:ring-accent"
                  value={scoringConfig.round_points[r.toString()] ?? 0}
                  onChange={(e) => updateRoundPts(r, e.target.value)}
                />
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-border">
              <label className="text-sm text-primary">Champion bonus</label>
              <input
                type="number"
                min={0}
                className="w-16 rounded border border-border bg-canvas text-primary text-sm p-1.5 text-center focus:outline-none focus:ring-1 focus:ring-accent"
                value={scoringConfig.champion_bonus}
                onChange={(e) => updateChampionBonus(e.target.value)}
              />
            </div>
          </div>
        </Card>
      )}

      <div className="rounded-lg bg-surface border border-border px-4 py-3 mb-8">
        <div className="flex items-center justify-between mb-1">
          <span className="text-secondary text-sm">Perfect score</span>
          <span className="font-display text-xl font-bold text-accent">{perfect} pts</span>
        </div>
        <p className="text-xs text-muted">{breakdown}</p>
        <p className="mt-2 text-xs text-muted">
          Once picks lock, your rules are frozen. Any change after that is
          timestamped and shown to your league.
        </p>
      </div>

      <Button className="w-full py-3" onClick={onNext}>
        Continue &rarr;
      </Button>
    </div>
  );
}

// ─── Step 5: Confirm ──────────────────────────────────────────────────────────
function StepConfirm({
  leagueName,
  teamCount,
  templateKind,
  scoringConfig,
  preset,
  lockedAt,
  onSubmit,
  submitting,
}: {
  leagueName: string;
  teamCount: number;
  templateKind: TemplateKind;
  scoringConfig: ScoringConfig;
  preset: ScoringPreset;
  lockedAt: string;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const slotSize = inferBracketSize(teamCount);
  const rounds = bracketRounds(slotSize);
  const perfect = perfectScore(scoringConfig, rounds);

  const presetLabel =
    PRESET_META.find((p) => p.id === preset)?.label ?? "Custom";

  const lockDisplay = lockedAt
    ? new Date(lockedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not set (configure later)";

  const bracketLabel =
    templateKind === "custom"
      ? `${teamCount} teams / ${slotSize}-slot`
      : templateKind === "sweet16"
      ? "16 teams (Sweet 16)"
      : templateKind === "rap-albums"
      ? `${teamCount} albums / ${slotSize}-slot`
      : `${teamCount} teams`;

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-primary mb-1">
        Confirm
      </h2>
      <p className="text-secondary text-sm mb-6">Looks good? Create your league.</p>

      <Card className="mb-8 space-y-3">
        <Row label="League name" value={leagueName} />
        <Row label="Bracket" value={bracketLabel} />
        <Row label="Scoring" value={`${presetLabel} (${perfect} pts perfect)`} />
        <Row label="Picks lock" value={lockDisplay} />
      </Card>

      <Button className="w-full py-3" onClick={onSubmit} disabled={submitting}>
        {submitting ? "Creating..." : "Create league"}
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-secondary text-sm shrink-0">{label}</span>
      <span className="text-primary text-sm text-right">{value}</span>
    </div>
  );
}

// ─── Success screen ───────────────────────────────────────────────────────────
function SuccessScreen({
  leagueId,
  leagueName,
  organizerToken,
  joinToken,
}: {
  leagueId: string;
  leagueName: string;
  organizerToken: string;
  joinToken: string;
}) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://bracket.fyi";

  const adminUrl = `${origin}/l/${leagueId}/admin?token=${organizerToken}`;
  const joinUrl = `${origin}/l/${leagueId}?join=${joinToken}`;

  const [copiedAdmin, setCopiedAdmin] = useState(false);
  const [copiedJoin, setCopiedJoin] = useState(false);

  const copy = (text: string, which: "admin" | "join") => {
    navigator.clipboard.writeText(text).then(() => {
      if (which === "admin") {
        setCopiedAdmin(true);
        setTimeout(() => setCopiedAdmin(false), 2000);
      } else {
        setCopiedJoin(true);
        setTimeout(() => setCopiedJoin(false), 2000);
      }
    });
  };

  const share = () => {
    if (navigator.share) {
      navigator.share({
        title: leagueName,
        text: `Join my bracket league: ${leagueName}`,
        url: joinUrl,
      });
    } else {
      copy(joinUrl, "join");
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-correct text-xl">&#10003;</span>
        <h2 className="font-display text-2xl font-bold text-primary">League created!</h2>
      </div>
      <p className="text-secondary text-sm mb-8">{leagueName}</p>

      <p className="text-xs text-secondary mb-4">
        Your organizer link is your admin key. Keep it private. The join
        link is safe to share to any group chat.
      </p>

      <div className="space-y-4 mb-8">
        <Card>
          <p className="text-xs text-secondary mb-1">
            Organizer link <span className="text-muted">(your link — keep private)</span>
          </p>
          <p className="text-xs text-muted font-display break-all mb-3">{adminUrl}</p>
          <Button
            variant="secondary"
            className="w-full py-2 text-sm"
            onClick={() => copy(adminUrl, "admin")}
          >
            {copiedAdmin ? "Copied!" : "Copy"}
          </Button>
        </Card>

        <Card>
          <p className="text-xs text-secondary mb-1">
            Join link <span className="text-muted">(share this)</span>
          </p>
          <p className="text-xs text-muted font-display break-all mb-3">{joinUrl}</p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1 py-2 text-sm"
              onClick={() => copy(joinUrl, "join")}
            >
              {copiedJoin ? "Copied!" : "Copy"}
            </Button>
            <Button className="flex-1 py-2 text-sm" onClick={share}>
              Share
            </Button>
          </div>
        </Card>
      </div>

      <a
        href={`/l/${leagueId}/admin?token=${organizerToken}`}
        className="block w-full text-center text-sm text-accent hover:underline py-2"
      >
        &rarr; Go to your league
      </a>
    </div>
  );
}

// ─── Main flow ────────────────────────────────────────────────────────────────
// Step indices per flow:
//   custom:     0=template, 1=competitors, 2=name, 3=scoring, 4=confirm
//   sweet16:    0=template, 1=preview,     2=name, 3=scoring, 4=confirm
//   rap-albums: 0=template, 1=pool-picker, 2=name, 3=scoring, 4=confirm
const TOTAL_STEPS = 5;

export default function CreateFlow({ templates }: { templates: PublicTemplate[] }) {
  const [step, setStep] = useState(0);

  // template selection
  const [templateKind, setTemplateKind] = useState<TemplateKind | null>(null);

  // custom flow
  const [names, setNames] = useState<string[]>([]);

  // rap albums flow
  const [selectedAlbumIds, setSelectedAlbumIds] = useState<string[]>([]);
  const [bracketSize, setBracketSize] = useState<4 | 8>(8);

  // shared
  const [leagueName, setLeagueName] = useState("");
  const [lockedAt, setLockedAt] = useState("");
  const [preset, setPreset] = useState<ScoringPreset>("late_rounds_matter");
  const [scoringConfig, setScoringConfig] = useState<ScoringConfig>(
    SCORING_PRESETS.late_rounds_matter
  );

  // result state
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    leagueId: string;
    organizerToken: string;
    joinToken: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const next = useCallback(() => setStep((s) => s + 1), []);

  // Derived helpers
  const sweet16Template = templates.find((t) => t.name === "March Madness Sweet 16 (2025)");
  const rapAlbumsTemplate = templates.find((t) => t.name === "Greatest Rap Albums");

  const sweet16Teams: TeamEntry[] = (sweet16Template?.team_registry ?? []) as TeamEntry[];
  const allAlbums: TeamEntry[] = (rapAlbumsTemplate?.team_registry ?? []) as TeamEntry[];

  // How many "teams" are in this bracket for scoring preview
  const effectiveTeamCount =
    templateKind === "sweet16"
      ? sweet16Teams.length || 16
      : templateKind === "rap-albums"
      ? bracketSize
      : names.length;

  const handleTemplateSelect = (kind: TemplateKind) => {
    setTemplateKind(kind);
    // Reset per-template state when switching
    setNames([]);
    setSelectedAlbumIds([]);
    // Default scoring: rap-albums → flat; sweet16 → late_rounds_matter; custom → late_rounds_matter
    if (kind === "rap-albums") {
      setPreset("flat");
      setScoringConfig(SCORING_PRESETS.flat);
    } else {
      setPreset("late_rounds_matter");
      setScoringConfig(SCORING_PRESETS.late_rounds_matter);
    }
  };

  const handleCreate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      let body: Record<string, unknown>;

      if (templateKind === "custom") {
        body = {
          templateKind: "custom",
          leagueName,
          competitorNames: names,
          lockedAt: lockedAt ? new Date(lockedAt).toISOString() : null,
          scoringConfig,
        };
      } else if (templateKind === "sweet16") {
        body = {
          templateKind: "seeded",
          templateId: sweet16Template!.id,
          leagueName,
          lockedAt: lockedAt ? new Date(lockedAt).toISOString() : null,
          scoringConfig,
        };
      } else if (templateKind === "rap-albums") {
        body = {
          templateKind: "curated-pool",
          parentTemplateId: rapAlbumsTemplate!.id,
          selectedTeamIds: selectedAlbumIds,
          leagueName,
          lockedAt: lockedAt ? new Date(lockedAt).toISOString() : null,
          scoringConfig,
        };
      } else {
        setError("Unknown template kind.");
        return;
      }

      const res = await fetch("/api/create-league", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create league");
        return;
      }
      setResult(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <SuccessScreen
        leagueId={result.leagueId}
        leagueName={leagueName}
        organizerToken={result.organizerToken}
        joinToken={result.joinToken}
      />
    );
  }

  return (
    <div>
      <StepDots current={step} total={TOTAL_STEPS} />

      {step === 0 && (
        <StepTemplate
          onNext={next}
          templates={templates}
          templateKind={templateKind}
          setTemplateKind={handleTemplateSelect}
        />
      )}

      {step === 1 && templateKind === "custom" && (
        <StepCompetitors onNext={next} names={names} setNames={setNames} />
      )}

      {step === 1 && templateKind === "sweet16" && (
        <StepSweet16Preview onNext={next} teams={sweet16Teams} />
      )}

      {step === 1 && templateKind === "rap-albums" && (
        <StepRapAlbumPicker
          onNext={next}
          allAlbums={allAlbums}
          selectedIds={selectedAlbumIds}
          setSelectedIds={setSelectedAlbumIds}
          bracketSize={bracketSize}
          setBracketSize={setBracketSize}
        />
      )}

      {step === 2 && (
        <StepNameLock
          onNext={next}
          leagueName={leagueName}
          setLeagueName={setLeagueName}
          lockedAt={lockedAt}
          setLockedAt={setLockedAt}
        />
      )}

      {step === 3 && (
        <StepScoring
          onNext={next}
          scoringConfig={scoringConfig}
          setScoringConfig={setScoringConfig}
          preset={preset}
          setPreset={setPreset}
          teamCount={effectiveTeamCount}
        />
      )}

      {step === 4 && templateKind && (
        <StepConfirm
          leagueName={leagueName}
          teamCount={effectiveTeamCount}
          templateKind={templateKind}
          scoringConfig={scoringConfig}
          preset={preset}
          lockedAt={lockedAt}
          onSubmit={handleCreate}
          submitting={submitting}
        />
      )}

      {error && (
        <p className="mt-4 text-sm text-wrong text-center">{error}</p>
      )}
    </div>
  );
}
