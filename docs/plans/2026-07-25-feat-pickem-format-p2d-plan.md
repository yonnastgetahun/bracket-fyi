---
title: "feat: Pick'em format (P2-D) — PickEmEntry, PickEmBracket, admin, Oscars enabled"
type: feat
date: 2026-07-25
---

# Pick'em Format (P2-D) — F12/F13

## Enhancement Summary

**Deepened on:** 2026-07-25
**Research performed:** DB view SQL verified against live data, create-league API audited, all component prop chains traced, LeaderboardLive crash vector found

### Key Improvements Over Initial Plan

1. **SQL operator verified** — `jsonb_array @> to_jsonb(text)` confirmed working in Postgres; migration SQL tested against live Oscars data and returns correct values (6 majors = 3pt, 17 others = 1pt)
2. **CRITICAL LeaderboardLive crash found** — line 219 does `league.scoring_config.round_points` directly with no guard; will throw for pickem leagues. Must add pickem-aware `ScoringExplainer` branch.
3. **create-league `seeded` path confirmed** — passes `scoringConfig` straight to `leagues.scoring_config` with no validation of shape; pickem config flows through without any server change
4. **`create-league` TypeScript type issue** — `ScoringConfig` typed as bracket-only in the API route; needs union type update to accept `PickemScoringConfig`
5. **`MatchesLive`/`CompareLive` use `seedMap`** — these use bracket-specific slot parsing (`s{N}`, `w-r{R}m{M}`); placeholder is correct approach, but routing must bypass them for pickem (check `LeaderboardLive` tab navigation)

---

## Overview

Add pick'em format support alongside the existing bracket format. The Oscars 2025 template already exists in production as `type='pickem'` with 23 categories and pre-seeded winners. This plan ships all the UI + wiring to make it fully usable end-to-end.

---

## Key DB Finding (Critical)

`v_pick_results` computes `points_value` via `l.scoring_config -> 'round_points' ->> tm.round::text`. Pickem leagues store `scoring_config` as `{ scheme: 'pickem_weighted', major_points: 3, other_points: 1, ... }` — no `round_points` key. **Points will be 0 for all pickem picks without a fix.**

`is_correct` works correctly as-is (`wr.winner_team_id = p.team_id`). `still_possible` (`wr.winner_team_id IS NULL`) also works since Oscars winners are pre-seeded.

**Decision:** Add migration `20260725000004_pickem_views.sql` to patch `v_pick_results`. This is cleaner than app-layer overrides since `v_leaderboard` derives from `v_pick_results` — fixing the view fixes the entire scoring chain (leaderboard, correct_picks count, max_possible).

### Migration SQL (verified against live Oscars data)

The `@> to_jsonb(text)` containment check works correctly in Postgres:
- `'["best-picture","best-director"]'::jsonb @> to_jsonb('best-picture'::text)` → `true`
- `substring('category:best-picture' from 10)` → `'best-picture'`
- Live test: best-picture=3, best-director=3, best-original-screenplay=1 ✓

Full view replacement for `v_pick_results`:

```sql
create or replace view v_pick_results as
select
  p.id               as pick_id,
  p.league_id,
  p.participant_id,
  p.slot_id,
  p.team_id          as picked_team_id,
  p.locked,
  tm.round,
  tm.template_id,
  tm.scheduled_at,
  -- Point value: pickem-aware
  case
    when (l.scoring_config->>'scheme') in ('pickem_flat', 'pickem_weighted') then
      case
        when (l.scoring_config->>'scheme') = 'pickem_flat' then
          coalesce((l.scoring_config->>'other_points')::int, 1)
        else -- pickem_weighted
          case
            when (l.scoring_config->'major_categories') @> to_jsonb(substring(tm.home_slot from 10))
            then coalesce((l.scoring_config->>'major_points')::int, 3)
            else coalesce((l.scoring_config->>'other_points')::int, 1)
          end
      end
    else
      coalesce((l.scoring_config->'round_points'->>tm.round::text)::int, 0)
  end                as points_value,
  wr.winner_team_id,
  case
    when wr.winner_team_id is null then null
    else wr.winner_team_id = p.team_id
  end                as is_correct,
  case
    when wr.winner_team_id = p.team_id then
      case
        when (l.scoring_config->>'scheme') in ('pickem_flat', 'pickem_weighted') then
          case
            when (l.scoring_config->>'scheme') = 'pickem_flat' then
              coalesce((l.scoring_config->>'other_points')::int, 1)
            else
              case
                when (l.scoring_config->'major_categories') @> to_jsonb(substring(tm.home_slot from 10))
                then coalesce((l.scoring_config->>'major_points')::int, 3)
                else coalesce((l.scoring_config->>'other_points')::int, 1)
              end
          end
        else
          coalesce((l.scoring_config->'round_points'->>tm.round::text)::int, 0)
      end
    else 0
  end                as points_earned,
  wr.winner_team_id is null as still_possible
from picks p
join leagues l  on l.id = p.league_id
join template_matches tm on tm.id::text = p.slot_id
left join lateral (
  select coalesce(
    ( select lro.winner_team_id
      from   league_result_overrides lro
      where  lro.league_id         = p.league_id
        and  lro.template_match_id = tm.id
      limit  1 ),
    ( select tr.winner_team_id
      from   template_results tr
      where  tr.template_match_id = tm.id
      limit  1 )
  ) as winner_team_id
) wr on true
where p.slot_id <> 'champion';
```

**Note on DRY:** `points_value` and `points_earned` share logic. Postgres views cannot use CTEs to factor this. The duplication is acceptable since it's a thin view; alternative is wrapping in another view but that adds complexity.

---

## Data Shape Confirmed

From DB:
- Template ID: `43505d9b-ec46-44ca-baed-9009e2b3276e`
- 23 categories, `scoring_defaults.scheme = 'pickem_weighted'`
- `template_matches.home_slot` = `category:{id}`, `away_slot` = `nominees`
- Match IDs are UUIDs — `slot_id` in picks will be the template_match UUID (same as bracket)
- Winners are pre-seeded in `template_results` — `is_correct` works as-is
- `create-league` seeded path: inserts `{ name, template_id, scoring_config, locked_at }` directly — **no server change needed for Oscars league creation**

---

## Types (`lib/types.ts`)

```typescript
// Rename existing ScoringConfig → BracketScoringConfig
export interface BracketScoringConfig {
  round_points: Record<string, number>;
  champion_bonus: number;
  has_third_place: boolean;
  tiebreakers: TiebreakerKey[];
}

export interface PickemCategory {
  id: string
  name: string
  nominees: string[]   // team_registry IDs
  winner?: string      // team_registry ID if resolved
}

export interface PickemTopology {
  type: 'pickem'
  categories: PickemCategory[]
}

export interface PickemScoringConfig {
  scheme: 'pickem_flat' | 'pickem_weighted'
  major_categories?: string[]
  major_points?: number
  other_points?: number
  tiebreakers?: TiebreakerKey[]
}

// Union
export type ScoringConfig = BracketScoringConfig | PickemScoringConfig

// Type guards
export function isPickemConfig(c: ScoringConfig): c is PickemScoringConfig {
  return 'scheme' in c
}
export function isBracketConfig(c: ScoringConfig): c is BracketScoringConfig {
  return 'round_points' in c
}

// Update Template.topology
export interface Template {
  // ...
  topology: BracketTopology | PickemTopology | null
  scoring_defaults: ScoringConfig
}
```

**Audit of `config.round_points` callers (ALL must be guarded):**

| File | Location | Action |
|------|----------|--------|
| `lib/scoring.ts` | `pointsForRound`, `perfectScore` | Update param type to `BracketScoringConfig` |
| `components/CreateFlow.tsx` | `StepScoring` uses `SCORING_PRESETS` (bracket) | Already isolated to bracket flow — no change needed |
| `components/CreateFlow.tsx` | `StepConfirm` calls `perfectScore` | Guard: only call when `templateKind !== 'oscars'` |
| `components/LeaderboardLive.tsx` | Line 219: `league.scoring_config.round_points` | **CRITICAL: Add pickem guard** (see below) |
| `app/api/create-league/route.ts` | TypeScript `ScoringConfig` import | Update to accept union type |

---

## Scoring (`lib/scoring.ts`)

```typescript
// Guard existing functions
export function pointsForRound(config: BracketScoringConfig, round: number): number {
  return config.round_points[round.toString()] ?? 0
}

export function perfectScore(
  config: BracketScoringConfig,
  rounds: [number, number][]
): number { /* unchanged */ }

// New pickem additions
export const PICKEM_PRESETS: Record<'pickem_flat' | 'pickem_weighted', PickemScoringConfig> = {
  pickem_flat: {
    scheme: 'pickem_flat',
    other_points: 1,
    tiebreakers: ['fewest_wrong'],
  },
  pickem_weighted: {
    scheme: 'pickem_weighted',
    major_categories: [
      'best-picture', 'best-director', 'best-actor', 'best-actress',
      'best-supporting-actor', 'best-supporting-actress'
    ],
    major_points: 3,
    other_points: 1,
    tiebreakers: ['fewest_wrong'],
  },
}

export function pointsForCategory(config: PickemScoringConfig, categoryId: string): number {
  if (config.scheme === 'pickem_flat') return config.other_points ?? 1
  return config.major_categories?.includes(categoryId)
    ? (config.major_points ?? 3)
    : (config.other_points ?? 1)
}

// Perfect score for pickem (used in CreateFlow confirm preview)
export function pickemPerfectScore(
  config: PickemScoringConfig,
  categories: PickemCategory[]
): number {
  return categories.reduce((sum, cat) => sum + pointsForCategory(config, cat.id), 0)
}
```

---

## Files to Create

### `components/PickEmEntry.tsx` — NEW

**Props:**
```typescript
interface Props {
  league: League
  categories: PickemCategory[]
  teamRegistry: TeamEntry[]
  templateMatches: TemplateMatch[]
}
```

**State machine:** `'entry' | 'identity' | 'confirm'`

**Category → match UUID mapping** (computed once, memoized):
```typescript
const categoryMatchId = useMemo(() => {
  const map: Record<string, string> = {}
  for (const cat of categories) {
    const match = templateMatches.find(m => m.home_slot === `category:${cat.id}`)
    if (match) map[cat.id] = match.id
  }
  return map
}, [categories, templateMatches])
```

**picks shape:** `Record<string, string>` — key = matchUUID, value = teamId
When selecting a nominee: `picks[categoryMatchId[cat.id]] = teamId`

**Entry view:**

Sticky header (position: sticky, top-0, z-10, backdrop-blur):
```
{league.name} · {pickedCount}/{total} categories picked
```

Scrollable category list. Each card:
```tsx
<div className="rounded-xl border border-border bg-surface p-4 mb-3">
  <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
    {category.name}
  </p>
  <div className="space-y-2">
    {category.nominees.map(nomineeId => {
      const team = teamRegistry.find(t => t.id === nomineeId)
      const matchId = categoryMatchId[category.id]
      const isSelected = picks[matchId] === nomineeId
      return (
        <button key={nomineeId}
          onClick={() => setPicks(p => ({...p, [matchId]: nomineeId}))}
          className={cn(
            "w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
            isSelected
              ? "bg-accent text-canvas font-semibold border-accent"
              : "border-border bg-surface text-primary hover:border-accent/50"
          )}
        >
          {team?.name ?? nomineeId}
        </button>
      )
    })}
  </div>
</div>
```

Fixed bottom CTA (position: sticky, bottom-0):
```tsx
<div className="sticky bottom-0 bg-canvas/90 backdrop-blur pt-3 pb-6 px-4 border-t border-border">
  <Button
    className="w-full py-3"
    disabled={pickedCount < categories.length}
    onClick={() => setView('identity')}
  >
    Submit picks ({pickedCount}/{categories.length})
  </Button>
</div>
```

**Identity view:** Copy from `PickEntry` — display name input + emoji picker grid
Back button goes to `'entry'`

**Submit handler:** Same `/api/submit-picks` call — picks as `[{slotId: matchUUID, teamId}]`. No champion pick for pickem.

**Confirm view:** Copy from `PickEntry` — magic link card + copy + share + "Go to leaderboard"

**Locked state check:** At top of render, before views:
```typescript
const isLocked = !!league.locked_at && new Date(league.locked_at) <= new Date()
if (isLocked) return <LockedState leagueName={league.name} lockedAt={league.locked_at!} leagueId={league.id} />
```

### `components/PickEmBracket.tsx` — NEW

Analogous to `BracketLive`. Same `useLiveRefresh` pattern.

**Props:**
```typescript
interface Props {
  participant: { id: string; display_name: string; emoji: string | null; league_id: string }
  initialPicks: PickResultRow[]
  teamMap: Record<string, string>
  league: League
  categories: PickemCategory[]
  templateMatches: TemplateMatch[]
}
```

**Category name lookup** (memoized):
```typescript
const categoryByMatchId = useMemo(() => {
  const map: Record<string, PickemCategory> = {}
  for (const match of templateMatches) {
    if (match.home_slot.startsWith('category:')) {
      const catId = match.home_slot.replace('category:', '')
      const cat = categories.find(c => c.id === catId)
      if (cat) map[match.id] = cat
    }
  }
  return map
}, [categories, templateMatches])
```

**Pick card per category:**
```tsx
function PickemPickCard({ pick, teamMap, category }: { ... }) {
  const state = getPickState(pick)  // reuse from BracketLive
  const pickedName = teamMap[pick.picked_team_id] ?? pick.picked_team_id
  const winnerName = pick.winner_team_id ? teamMap[pick.winner_team_id] : null
  
  return (
    <div className={cn("rounded-lg border px-3 py-2.5 space-y-1", STATE_CARD[state])}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted">
          {STATE_ICON[state]} {category?.name ?? pick.slot_id}
        </span>
        <span className="text-xs text-muted">
          +{pick.points_earned} / {pick.points_value} pts
        </span>
      </div>
      <div className="text-sm">
        <span className={cn("font-medium", STATE_TEXT[state])}>{pickedName}</span>
        {winnerName && winnerName !== pickedName && (
          <span className="text-muted"> → {winnerName}</span>
        )}
        {!winnerName && (
          <span className="text-muted text-xs"> · pending</span>
        )}
      </div>
    </div>
  )
}
```

**Live refresh:** Same `v_pick_results` refetch pattern from `BracketLive`.

**Header:**
```
{emoji} {display_name}'s picks · {totalPoints} pts
```

### DB Migration: `supabase/migrations/20260725000004_pickem_views.sql`

Contains the full `create or replace view v_pick_results` replacement (see SQL above).

Also need `supabase/migrations/20260725000004_pickem_views_down.sql` — restore original `v_pick_results` from migration 003.

---

## Files to Modify

### `lib/types.ts`

Per the types section above. Key changes:
- Rename `ScoringConfig` → `BracketScoringConfig`, export union `ScoringConfig`
- Add `PickemCategory`, `PickemTopology`, `PickemScoringConfig`
- Update `Template.topology` union
- Add type guards `isPickemConfig`, `isBracketConfig`

### `lib/scoring.ts`

- Update `pointsForRound`/`perfectScore` param to `BracketScoringConfig`
- Add `PICKEM_PRESETS`, `pointsForCategory`, `pickemPerfectScore`

### `lib/league-data.ts`

**Add `LeagueWithTemplate` type and update `getLeagueWithTemplate`:**

```typescript
export interface LeagueWithTemplate extends League {
  template_type: TemplateType | null
  template_topology: BracketTopology | PickemTopology | null
}

export async function getLeagueWithTemplate(leagueId: string): Promise<LeagueWithTemplate | null> {
  const { data } = await getAdminClient()
    .from("leagues")
    .select("*, templates!template_id(type, topology)")
    .eq("id", leagueId)
    .single()
  if (!data) return null
  const template = (data as any).templates
  return {
    ...data,
    template_type: template?.type ?? null,
    template_topology: template?.topology ?? null,
  } as LeagueWithTemplate
}
```

**Alternative (simpler, avoids join complexity):** Add a separate helper:
```typescript
export async function getTemplateInfo(templateId: string): Promise<{ type: TemplateType; topology: BracketTopology | PickemTopology | null } | null> {
  const { data } = await getAdminClient()
    .from("templates")
    .select("type, topology")
    .eq("id", templateId)
    .single()
  return data as any ?? null
}
```

Use the join approach — it's one query vs two, and avoids race conditions. Return `LeagueWithTemplate` everywhere `League` was returned from `getLeagueWithTemplate`.

Update all callers of `getLeagueWithTemplate` to use `LeagueWithTemplate` type.

### `components/LeaderboardLive.tsx`

**CRITICAL FIX — Line 219 crash for pickem leagues:**

```typescript
// BEFORE (crashes for pickem):
const roundKeys = Object.keys(league.scoring_config.round_points).sort(...)

// AFTER:
const roundKeys = isBracketConfig(league.scoring_config)
  ? Object.keys(league.scoring_config.round_points).sort((a, b) => Number(a) - Number(b))
  : []
```

**`ScoringExplainer` — add pickem branch:**
```typescript
function ScoringExplainer({ config }: { config: ScoringConfig }) {
  if (isPickemConfig(config)) {
    return (
      <details className="rounded-xl border border-border bg-surface">
        <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold text-primary">
          How scoring works
        </summary>
        <div className="border-t border-border px-3 py-3 space-y-2 text-sm text-secondary">
          {config.scheme === 'pickem_weighted' ? (
            <>
              <p><span className="text-primary font-semibold">Major categories</span>: {config.major_points ?? 3} pts each</p>
              <p><span className="text-primary font-semibold">Other categories</span>: {config.other_points ?? 1} pt each</p>
            </>
          ) : (
            <p><span className="text-primary font-semibold">1 pt</span> per correct category pick</p>
          )}
        </div>
      </details>
    )
  }
  // existing bracket branch unchanged
}
```

**Sparkline fix:** For pickem, `roundKeys` is `[]` so `Sparkline` renders nothing — that's fine. The sparkline is cosmetic.

**Champion chips:** Pickem has no champion pick — `champions` array will be empty, so the chip strip won't render. No change needed.

### `components/CreateFlow.tsx`

**Template step:**
- Oscars card: `selectable: !!oscars` (not `false`)
- Badge: `oscars ? "Ready" : null` (remove "Pick'em launches this week" teaser)
- `canContinue`: remove `&& templateKind !== 'oscars'`

**State additions:**
```typescript
const [pickemPreset, setPickemPreset] = useState<'pickem_flat' | 'pickem_weighted'>('pickem_weighted')
const oscarsTemplate = templates.find(t => t.name === 'Oscars 2025 (97th Academy Awards)')
```

**`handleTemplateSelect` for oscars:**
```typescript
case 'oscars':
  setPickemPreset('pickem_weighted')
  setScoringConfig(PICKEM_PRESETS.pickem_weighted as unknown as ScoringConfig)
  break
```

**Step 1 for oscars — `StepOscarsPreview`:**
```typescript
function StepOscarsPreview({ onNext, categories }: { onNext: () => void; categories: PickemCategory[] }) {
  const preview = categories.slice(0, 4)
  const rest = categories.length - preview.length
  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-primary mb-1">Categories loaded</h2>
      <p className="text-secondary text-sm mb-6">
        This template comes with {categories.length} Oscar categories.
      </p>
      <Card className="mb-6">
        <ul className="space-y-2">
          {preview.map(c => (
            <li key={c.id} className="text-sm text-primary">{c.name}</li>
          ))}
          {rest > 0 && <li className="text-sm text-muted">…and {rest} more</li>}
        </ul>
      </Card>
      <Button className="w-full py-3" onClick={onNext}>Continue &rarr;</Button>
    </div>
  )
}
```

Pass `categories` from `(oscarsTemplate?.topology as PickemTopology)?.categories ?? []`.

**Step 3 for oscars — `StepPickemScoring`:**
```typescript
const PICKEM_PRESET_META = [
  { id: 'pickem_flat', label: 'Flat', desc: '1 pt per correct pick' },
  { id: 'pickem_weighted', label: 'Weighted', desc: '3pt for majors, 1pt for others', recommended: true },
] as const

function StepPickemScoring({ onNext, preset, setPreset, categories }) {
  const perfect = preset === 'pickem_weighted'
    ? pickemPerfectScore(PICKEM_PRESETS.pickem_weighted, categories)
    : categories.length  // flat: 1pt each

  return (
    <div>
      <h2 ...>Scoring</h2>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {PICKEM_PRESET_META.map(p => (
          <button key={p.id} onClick={() => setPreset(p.id)} className={...}>
            {p.label} {p.recommended && <span>Rec.</span>}
            <p>{p.desc}</p>
          </button>
        ))}
      </div>
      <div className="rounded-lg bg-surface border border-border px-4 py-3 mb-8">
        <span>Perfect score</span>
        <span>{perfect} pts</span>
      </div>
      <Button className="w-full py-3" onClick={onNext}>Continue &rarr;</Button>
    </div>
  )
}
```

When `pickemPreset` changes, also update `scoringConfig`:
```typescript
const handlePickemPreset = (id: 'pickem_flat' | 'pickem_weighted') => {
  setPickemPreset(id)
  setScoringConfig(PICKEM_PRESETS[id] as unknown as ScoringConfig)
}
```

**Step 4 (Confirm) for oscars:**
```typescript
const bracketLabel = templateKind === 'oscars'
  ? `${oscarsCategories.length} categories / pick'em`
  : /* existing bracket label */

// Don't call perfectScore for oscars — it's bracket-only
const perfect = templateKind === 'oscars'
  ? pickemPerfectScore(scoringConfig as unknown as PickemScoringConfig, oscarsCategories)
  : perfectScore(scoringConfig as BracketScoringConfig, rounds)
```

**`handleCreate` for oscars:**
```typescript
} else if (templateKind === 'oscars') {
  body = {
    templateKind: 'seeded',
    templateId: oscarsTemplate!.id,
    leagueName,
    lockedAt: lockedAt ? new Date(lockedAt).toISOString() : null,
    scoringConfig,
  }
}
```

**`TOTAL_STEPS`:** Oscars flow has same 5 steps as sweet16 (template → preview → name → scoring → confirm). Step count unchanged.

**Routing within steps:** Add to step 1:
```tsx
{step === 1 && templateKind === 'oscars' && (
  <StepOscarsPreview onNext={next} categories={oscarsCategories} />
)}
```
Add to step 3:
```tsx
{step === 3 && templateKind === 'oscars' && (
  <StepPickemScoring onNext={next} preset={pickemPreset} setPreset={handlePickemPreset} categories={oscarsCategories} />
)}
{step === 3 && templateKind !== 'oscars' && (
  <StepScoring ... />
)}
```

### `app/l/[league_id]/page.tsx`

In `hasLeagueToken` path, after fetching matches + teamRegistry:
```typescript
if (league.template_type === 'pickem') {
  const categories = (league.template_topology as PickemTopology)?.categories ?? []
  return (
    <PickEmEntry
      league={league}
      categories={categories}
      teamRegistry={teamRegistry}
      templateMatches={matches}
    />
  )
}
return <PickEntry league={league} matches={matches} teamRegistry={teamRegistry} />
```

No change needed for `hasParticipant` path (leaderboard) — `LeaderboardLive` is format-agnostic after the crash fix above. The public post-lock leaderboard path is also unchanged.

### `app/l/[league_id]/p/[magic_token]/page.tsx`

```typescript
if (league.template_type === 'pickem') {
  const categories = (league.template_topology as PickemTopology)?.categories ?? []
  return (
    <PickEmBracket
      participant={participant}
      initialPicks={picks}
      teamMap={teamMap}
      league={league}
      categories={categories}
      templateMatches={matches}
    />
  )
}
return <BracketLive participant={participant} initialPicks={picks} teamMap={teamMap} league={league} matches={matches} />
```

### `app/l/[league_id]/admin/page.tsx`

Fetch `categories` and `templateType`:
```typescript
const templateType = league.template_type ?? null
const categories = league.template_type === 'pickem'
  ? ((league.template_topology as PickemTopology)?.categories ?? [])
  : []

return (
  <AdminConsole
    league={league}
    participants={participants.data ?? []}
    matches={matches}
    teamRegistry={teamRegistry}
    initialResults={results}
    hasPicks={(pickCount ?? 0) > 0}
    templateType={templateType}
    categories={categories}
  />
)
```

### `components/AdminConsole.tsx`

Add to `Props`:
```typescript
templateType?: string | null
categories?: PickemCategory[]
```

In `ResultsSection`, branch on `templateType === 'pickem'`:

```typescript
function PickemResultsSection({ league, matches, teamRegistry, resultsMap, onResultChange, categories, hasPicks }) {
  if (!hasPicks) return <WaitingForParticipants />
  
  return (
    <div className="space-y-6 pt-2">
      {categories.map(cat => {
        const match = matches.find(m => m.home_slot === `category:${cat.id}`)
        if (!match) return null
        const winner = resultsMap.get(match.id)
        
        return (
          <div key={cat.id}>
            <p className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">
              {cat.name}
            </p>
            <div className="flex flex-wrap gap-2">
              {cat.nominees.map(nomineeId => {
                const team = teamRegistry.find(t => t.id === nomineeId)
                const name = team?.name ?? nomineeId
                const isWinner = winner === nomineeId
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
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

In `ResultsSection` render:
```typescript
if (templateType === 'pickem') {
  return (
    <details open className="group">
      <summary ...>Enter results</summary>
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
  )
}
// existing bracket ResultsSection...
```

### `app/api/create-league/route.ts`

Update TypeScript import:
```typescript
import type { ScoringConfig, BracketScoringConfig, TeamEntry } from "@/lib/types";
```

The `CreateLeagueBody` union already uses `scoringConfig: ScoringConfig` — update to accept the union type. No runtime logic changes needed; the `seeded` path just inserts `scoringConfig` into the DB as JSON.

Note: The `curated-pool` handler accesses `scoringConfig.has_third_place` — this needs guarding:
```typescript
has_third_place: isBracketConfig(scoringConfig) ? (scoringConfig.has_third_place ?? false) : false,
```

### `components/MatchesLive.tsx` / `components/CompareLive.tsx`

These components receive data via `LeaderboardLive` tab navigation. Check how they're invoked — if the leaderboard page passes `templateType`, add a guard. If not, the placeholder can be added inside each component when `seedMap` is empty (which it will be for pickem since there are no seed-based slots).

**Simplest approach:** In the page that renders these (likely `LeaderboardLive` has tabs), add a pickem check. Or add at the top of each component:

```typescript
// In MatchesLive and CompareLive — add near top:
if (!seedMap || Object.keys(seedMap).length === 0) {
  return (
    <div className="px-4 py-8 text-center text-secondary text-sm">
      This view is optimized for bracket format — full pick'em support coming soon.
    </div>
  )
}
```

**Note:** Need to check how `MatchesLive`/`CompareLive` are mounted in the app. If they're tabs within `LeaderboardLive`, add template-type prop drilling.

---

## Acceptance Criteria

- [ ] `npm run build` passes clean with no TypeScript errors
- [ ] `ScoringExplainer` in `LeaderboardLive` does not crash for pickem leagues
- [ ] Oscars card in CreateFlow is selectable (not grayed out)
- [ ] Selecting Oscars → `StepOscarsPreview` → `StepPickemScoring` → `StepNameLock` → `StepConfirm`
- [ ] Confirm screen shows "Weighted (35 pts perfect)" for default weighted preset
- [ ] Creating Oscars league inserts `scoring_config = {scheme: 'pickem_weighted', ...}` on leagues row
- [ ] Opening pickem league join link renders `PickEmEntry` with 23 category cards
- [ ] Each category card shows all nominees as full-width buttons
- [ ] Progress header shows "0/23 categories picked" → "23/23 categories picked"
- [ ] Submit button disabled until all 23 picked
- [ ] Submitting picks creates `picks` rows with `slot_id` = template_match UUIDs
- [ ] `/l/{id}/p/{token}` renders `PickEmBracket` with correct/wrong/pending per category
- [ ] Leaderboard shows correct scores: majors = 3pt, others = 1pt (weighted)
- [ ] Admin console shows radio-style category winner selectors for pickem leagues
- [ ] All existing bracket leagues (Sweet 16, Custom) work identically to before
- [ ] Mobile-first at 375px — no horizontal scroll on category buttons

---

## Implementation Order

1. **Migration** — `v_pick_results` pickem fix (unblocks all DB scoring)
2. **Types** — `lib/types.ts` union types, type guards
3. **Scoring** — `lib/scoring.ts` additions + guard existing functions
4. **`lib/league-data.ts`** — `getLeagueWithTemplate` join → `LeagueWithTemplate`
5. **`components/LeaderboardLive.tsx`** — fix `round_points` crash + `ScoringExplainer` pickem branch
6. **`components/PickEmEntry.tsx`** — new component
7. **`components/PickEmBracket.tsx`** — new component
8. **`components/AdminConsole.tsx`** — `PickemResultsSection` + prop additions
9. **`components/CreateFlow.tsx`** — enable Oscars, `StepOscarsPreview`, `StepPickemScoring`
10. **`app/api/create-league/route.ts`** — update types, guard `has_third_place`
11. **Router pages** — `app/l/[league_id]/page.tsx` + `p/[magic_token]/page.tsx` + `admin/page.tsx`
12. **Placeholder** — `MatchesLive`/`CompareLive` pickem guard
13. **`npm run build`** — verify clean

---

## TODOs / Future Work

- Compare + Matches views for pickem (out of scope P2)
- Custom pickem scoring in CreateFlow (out of scope P2)
- Oscars 2026 template
- `Sparkline` for pickem leaderboard rows (currently hidden — consider pick-count bars instead of round bars)

---

## References

- `components/PickEntry.tsx` — identity + confirm + submit pattern to replicate
- `components/BracketLive.tsx` — live refresh + pick state pattern to replicate
- `components/AdminConsole.tsx` — results section to extend
- `components/LeaderboardLive.tsx` — **lines 139-181 `ScoringExplainer`, line 219 `round_points` crash**
- `supabase/migrations/20260724000003_scoring_views.sql` — current `v_pick_results` to patch
- `app/api/create-league/route.ts` — seeded path (lines ~116-140); `curated-pool` `has_third_place` guard (line ~172)
- Oscars template ID: `43505d9b-ec46-44ca-baed-9009e2b3276e`
