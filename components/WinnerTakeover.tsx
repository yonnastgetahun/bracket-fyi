"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui";

const CONFETTI = ["🎉", "🏆", "⭐", "🎊", "✨", "🥇"];

interface Props {
  leagueName: string;
  winners: Array<{ display_name: string; emoji: string | null }>;
  totalPoints: number;
  onDismiss: () => void;
}

export default function WinnerTakeover({ leagueName, winners, totalPoints, onDismiss }: Props) {
  // Escape key dismissal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onDismiss]);

  const isCoChampions = winners.length > 1;

  return (
    <div
      className="fixed inset-0 z-50 bg-canvas/95 backdrop-blur flex flex-col items-center justify-center"
      onClick={onDismiss}
    >
      {/* Floating confetti */}
      {Array.from({ length: 14 }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute text-2xl"
          style={{
            left: `${(i * 7 + 3) % 100}%`,
            top: `${(i * 13 + 5) % 85}%`,
            animation: `bfyi-float ${3 + (i % 4)}s ease-in-out ${(i % 7) * 0.4}s infinite alternate`,
            opacity: 0.6,
          }}
        >
          {CONFETTI[i % CONFETTI.length]}
        </span>
      ))}

      {/* Content card — stop click propagation so only backdrop click dismisses */}
      <div
        className="relative z-10 flex flex-col items-center gap-4 px-8 py-10 text-center max-w-sm"
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: "bfyi-enter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        }}
      >
        {/* Trophy */}
        <span className="text-6xl" role="img" aria-label="trophy">
          🏆
        </span>

        {/* Label */}
        <p className="text-xs uppercase tracking-widest text-secondary">
          {isCoChampions ? "Co-Champions" : "Champion"}
        </p>

        {/* Winner name(s) */}
        <div className="flex flex-col items-center gap-1">
          {winners.map((w) => (
            <span
              key={w.display_name}
              className={cn(
                "font-display text-5xl font-bold text-accent leading-tight"
              )}
            >
              {w.emoji ? `${w.emoji} ` : ""}
              {w.display_name}
            </span>
          ))}
        </div>

        {/* Score */}
        <p className="font-display text-2xl text-primary tabular-nums">
          {totalPoints} pts
        </p>

        {/* League name */}
        <p className="text-sm text-secondary">— {leagueName} —</p>

        {/* Dismiss button */}
        <Button className="mt-2 px-8 py-2.5" onClick={onDismiss}>
          View leaderboard
        </Button>
      </div>

      {/* Keyframe styles injected inline so no globals.css change needed */}
      <style>{`
        @keyframes bfyi-float {
          from { transform: translateY(0px) rotate(-5deg); }
          to   { transform: translateY(-18px) rotate(5deg); }
        }
        @keyframes bfyi-enter {
          from { opacity: 0; transform: scale(0.9); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
