-- ============================================================
-- Bracket.fyi — Migration 002: Row Level Security policies
-- ============================================================
-- All server-side Next.js operations use service_role (bypasses RLS).
-- These policies govern the public anon key — defence-in-depth.
-- Tokens are passed as request headers by Next.js middleware:
--   x-league-token      → join_token holder
--   x-organizer-token   → organizer_token holder
--   x-magic-token       → individual participant magic_token
-- ============================================================

-- Enable RLS on all tables
alter table templates                enable row level security;
alter table leagues                  enable row level security;
alter table participants             enable row level security;
alter table picks                    enable row level security;
alter table template_matches         enable row level security;
alter table template_results         enable row level security;
alter table league_result_overrides  enable row level security;

-- ============================================================
-- Helper: safely extract a UUID token from request headers
-- Returns null on any error (missing header, invalid UUID, etc.)
-- ============================================================
create or replace function get_request_token(header_name text)
returns uuid
language plpgsql stable security definer
as $$
begin
  return (
    nullif(
      (current_setting('request.headers', true)::json) ->> header_name,
      ''
    )
  )::uuid;
exception when others then
  return null;
end;
$$;

-- ============================================================
-- TEMPLATES — public read (tournament catalog is public info)
-- ============================================================
create policy "templates_anon_read"
  on templates for select to anon
  using (true);

-- ============================================================
-- TEMPLATE_MATCHES — public read
-- ============================================================
create policy "template_matches_anon_read"
  on template_matches for select to anon
  using (true);

-- ============================================================
-- TEMPLATE_RESULTS — public read (match results are public)
-- ============================================================
create policy "template_results_anon_read"
  on template_results for select to anon
  using (true);

-- ============================================================
-- LEAGUES — read if join_token or organizer_token matches
-- No anon writes (organizer operations use service_role server-side)
-- ============================================================
create policy "leagues_token_read"
  on leagues for select to anon
  using (
    join_token       = get_request_token('x-league-token')
    or organizer_token = get_request_token('x-organizer-token')
  );

-- ============================================================
-- PARTICIPANTS — read if same league via any valid token
-- Sensitive columns (magic_token, push_subscription) filtered
-- at the application layer; never sent to client
-- ============================================================
create policy "participants_league_read"
  on participants for select to anon
  using (
    -- any league member can see the participant list
    league_id in (
      select id from leagues
      where join_token       = get_request_token('x-league-token')
         or organizer_token  = get_request_token('x-organizer-token')
    )
    -- participant can always read their own row
    or magic_token = get_request_token('x-magic-token')
  );

-- ============================================================
-- PICKS
-- Rule: other participants' picks are hidden until locked_at.
-- Own picks (magic_token) visible any time.
-- Organizer sees all picks any time.
-- Write: only via valid join_token, only before lock.
-- ============================================================

-- Read policy
create policy "picks_read"
  on picks for select to anon
  using (
    -- organizer: all picks in their league, always
    league_id in (
      select id from leagues
      where organizer_token = get_request_token('x-organizer-token')
    )
    or
    -- participant: own picks any time (pre and post lock)
    participant_id in (
      select id from participants
      where magic_token = get_request_token('x-magic-token')
    )
    or
    -- join_token holders: only after lock
    (
      locked = true
      and league_id in (
        select id from leagues
        where join_token = get_request_token('x-league-token')
      )
    )
  );

-- Write policy: join_token, pre-lock only
create policy "picks_insert"
  on picks for insert to anon
  with check (
    league_id in (
      select id from leagues
      where join_token = get_request_token('x-league-token')
        and (locked_at is null or locked_at > now())
    )
  );

-- Update policy: own picks only, pre-lock
create policy "picks_update"
  on picks for update to anon
  using (
    participant_id in (
      select id from participants
      where magic_token = get_request_token('x-magic-token')
    )
    and locked = false
  );

-- ============================================================
-- LEAGUE_RESULT_OVERRIDES — organizer read only
-- No anon writes (uses service_role server-side)
-- ============================================================
create policy "overrides_organizer_read"
  on league_result_overrides for select to anon
  using (
    league_id in (
      select id from leagues
      where organizer_token = get_request_token('x-organizer-token')
    )
  );
