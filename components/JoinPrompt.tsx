interface Props {
  leagueName: string;
}

export default function JoinPrompt({ leagueName }: Props) {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="text-5xl">🔐</div>
        <div>
          <h1 className="font-display text-2xl text-primary mb-1">{leagueName}</h1>
          <p className="text-secondary text-sm mt-3">
            This bracket is invite-only.
          </p>
          <p className="text-muted text-sm mt-2">
            Ask the organizer for the join link.
          </p>
        </div>
      </div>
    </div>
  );
}
