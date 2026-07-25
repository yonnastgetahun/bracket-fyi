import Link from "next/link";
import { Button } from "@/components/ui/Button";

interface Props {
  leagueName: string;
  lockedAt: string;
  leagueId: string;
}

export default function LockedState({ leagueName, lockedAt, leagueId }: Props) {
  const lockedDate = new Date(lockedAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="text-5xl">🔒</div>
        <div>
          <h1 className="font-display text-2xl text-primary mb-1">Picks are locked</h1>
          <p className="text-secondary text-sm">{leagueName}</p>
          <p className="text-muted text-xs mt-1">Locked {lockedDate}</p>
        </div>
        <p className="text-secondary text-sm leading-relaxed">
          You missed the pick window, but you can still watch the competition
          unfold on the leaderboard.
        </p>
        <Link href={`/l/${leagueId}`}>
          <Button variant="primary" className="w-full">
            View leaderboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
