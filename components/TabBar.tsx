'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/ui'

interface TabBarProps {
  leagueId: string
  magicToken: string | null
}

export default function TabBar({ leagueId, magicToken }: TabBarProps) {
  const pathname = usePathname()

  type Tab = { label: string; href: string }

  const tabs: Tab[] = [
    { label: 'Board',   href: `/l/${leagueId}` },
    ...(magicToken ? [{ label: 'Bracket', href: `/l/${leagueId}/p/${magicToken}` }] : []),
    { label: 'Matches', href: `/l/${leagueId}/matches` },
    { label: 'Compare', href: `/l/${leagueId}/compare` },
  ]

  function isActive(tab: { label: string; href: string }) {
    if (tab.label === 'Board') {
      // Board is only active on the exact league root
      return pathname === `/l/${leagueId}`
    }
    return pathname === tab.href || pathname.startsWith(tab.href + '/')
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-14 flex bg-canvas border-t border-border">
      {tabs.map((tab) => {
        const active = isActive(tab)
        return (
          <Link
            key={tab.label}
            href={tab.href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5',
              'text-[11px] uppercase tracking-widest font-medium',
              'border-b-2 transition-colors',
              active
                ? 'border-accent text-accent'
                : 'border-transparent text-secondary hover:text-primary'
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
