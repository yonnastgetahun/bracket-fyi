import Link from 'next/link'

interface LeagueHeaderProps {
  leagueName: string
}

export default function LeagueHeader({ leagueName }: LeagueHeaderProps) {
  const truncated =
    leagueName.length > 20 ? leagueName.slice(0, 20) + '…' : leagueName

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-12 flex items-center justify-between px-4 bg-canvas border-b border-border">
      <Link
        href="/"
        className="flex items-center gap-1 text-primary hover:text-accent transition-colors"
        aria-label="Back to home"
      >
        <span className="text-lg leading-none">←</span>
      </Link>

      <span
        className="absolute left-1/2 -translate-x-1/2 text-sm font-medium text-primary truncate max-w-[calc(100%-96px)] text-center"
        title={leagueName}
      >
        {truncated}
      </span>

      <button
        className="text-secondary hover:text-primary transition-colors p-1"
        aria-label="Notifications"
        disabled
      >
        🔔
      </button>
    </header>
  )
}
