import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { getAdminClient } from '@/lib/supabase/admin'
import LeagueHeader from '@/components/LeagueHeader'
import TabBar from '@/components/TabBar'
import InstallPrompt from '@/components/InstallPrompt'

interface LeagueLayoutProps {
  children: React.ReactNode
  params: { league_id: string }
}

export default async function LeagueLayout({
  children,
  params,
}: LeagueLayoutProps) {
  const leagueId = params.league_id

  const { data: league } = await getAdminClient()
    .from('leagues')
    .select('name')
    .eq('id', leagueId)
    .single()

  if (!league) notFound()

  const cookieStore = cookies()
  const participantCookie = cookieStore.get('bfyi_participant')
  const magicToken =
    participantCookie?.value?.startsWith(`${leagueId}:`)
      ? participantCookie.value.split(':').slice(1).join(':')
      : null

  return (
    <div className="min-h-screen bg-canvas">
      <LeagueHeader
        leagueName={league.name}
        leagueId={leagueId}
        magicToken={magicToken}
      />
      {/* pt-12 = header height (48px), pb-14 = tab bar height (56px) */}
      <main className="pt-12 pb-14 min-h-screen">
        {children}
      </main>
      <TabBar leagueId={leagueId} magicToken={magicToken} />
      <InstallPrompt leagueId={leagueId} />
    </div>
  )
}
