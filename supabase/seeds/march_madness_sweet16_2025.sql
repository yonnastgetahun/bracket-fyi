-- Bracket.fyi seed: 2025 Men's NCAA Sweet 16
--
-- This seed is NOT run automatically. Run once per environment:
--
--   psql "$DATABASE_URL" -f supabase/seeds/march_madness_sweet16_2025.sql
--
-- Or via Supabase CLI:
--   supabase db execute --file supabase/seeds/march_madness_sweet16_2025.sql
--
-- Creates 1 template + 16 teams + 15 matches. No results pre-populated —
-- organizer enters historical results as their group plays along.
--
-- 2025 Sweet 16 field (Men's NCAA Tournament):
--   South:   Auburn (1) vs Michigan (5), Ole Miss (6) vs Michigan State (2)
--   West:    Florida (1) vs Maryland (4), Texas Tech (3) vs Arkansas (10)
--   Midwest: Houston (1) vs Purdue (4), Tennessee (2) vs Kentucky (3)
--   East:    Duke (1) vs Arizona (4), Alabama (2) vs BYU (6)

do $$
declare
  tid uuid;
begin
  insert into templates (name, type, team_registry, scoring_defaults, topology, results_provider)
  values (
    'March Madness Sweet 16 (2025)',
    'bracket',
    '[
      {"id":"seed-0", "name":"Auburn",        "aliases":["AUB"],  "seed":1,  "region":"South"},
      {"id":"seed-1", "name":"Michigan",       "aliases":["MICH"], "seed":5,  "region":"South"},
      {"id":"seed-2", "name":"Ole Miss",       "aliases":["OM"],   "seed":6,  "region":"South"},
      {"id":"seed-3", "name":"Michigan State", "aliases":["MSU"],  "seed":2,  "region":"South"},
      {"id":"seed-4", "name":"Florida",        "aliases":["FLA"],  "seed":1,  "region":"West"},
      {"id":"seed-5", "name":"Maryland",       "aliases":["MD"],   "seed":4,  "region":"West"},
      {"id":"seed-6", "name":"Texas Tech",     "aliases":["TTU"],  "seed":3,  "region":"West"},
      {"id":"seed-7", "name":"Arkansas",       "aliases":["ARK"],  "seed":10, "region":"West"},
      {"id":"seed-8", "name":"Houston",        "aliases":["HOU"],  "seed":1,  "region":"Midwest"},
      {"id":"seed-9", "name":"Purdue",         "aliases":["PUR"],  "seed":4,  "region":"Midwest"},
      {"id":"seed-10","name":"Tennessee",      "aliases":["TENN"], "seed":2,  "region":"Midwest"},
      {"id":"seed-11","name":"Kentucky",       "aliases":["UK"],   "seed":3,  "region":"Midwest"},
      {"id":"seed-12","name":"Duke",           "aliases":["DUKE"], "seed":1,  "region":"East"},
      {"id":"seed-13","name":"Arizona",        "aliases":["ARIZ"], "seed":4,  "region":"East"},
      {"id":"seed-14","name":"Alabama",        "aliases":["ALA"],  "seed":2,  "region":"East"},
      {"id":"seed-15","name":"BYU",            "aliases":["BYU"],  "seed":6,  "region":"East"}
    ]'::jsonb,
    '{"round_points":{"1":1,"2":1,"3":2,"4":4},"champion_bonus":0,"has_third_place":false,"tiebreakers":["fewest_wrong"]}'::jsonb,
    '{"rounds":4,"slots_per_round":[8,4,2,1],"has_third_place":false}'::jsonb,
    null
  )
  returning id into tid;

  -- Round 1 (Sweet 16): 8 matches
  -- South region
  insert into template_matches (template_id, round, match_number, home_slot, away_slot) values
    (tid, 1, 1, 'seed-0',  'seed-1'),   -- Auburn vs Michigan
    (tid, 1, 2, 'seed-2',  'seed-3');   -- Ole Miss vs Michigan State

  -- West region
  insert into template_matches (template_id, round, match_number, home_slot, away_slot) values
    (tid, 1, 3, 'seed-4',  'seed-5'),   -- Florida vs Maryland
    (tid, 1, 4, 'seed-6',  'seed-7');   -- Texas Tech vs Arkansas

  -- Midwest region
  insert into template_matches (template_id, round, match_number, home_slot, away_slot) values
    (tid, 1, 5, 'seed-8',  'seed-9'),   -- Houston vs Purdue
    (tid, 1, 6, 'seed-10', 'seed-11');  -- Tennessee vs Kentucky

  -- East region
  insert into template_matches (template_id, round, match_number, home_slot, away_slot) values
    (tid, 1, 7, 'seed-12', 'seed-13'),  -- Duke vs Arizona
    (tid, 1, 8, 'seed-14', 'seed-15');  -- Alabama vs BYU

  -- Round 2 (Elite 8): 4 matches
  -- South champ, West champ, Midwest champ, East champ
  insert into template_matches (template_id, round, match_number, home_slot, away_slot) values
    (tid, 2, 1, 'w-r1m1', 'w-r1m2'),   -- South: R1M1 winner vs R1M2 winner
    (tid, 2, 2, 'w-r1m3', 'w-r1m4'),   -- West:  R1M3 winner vs R1M4 winner
    (tid, 2, 3, 'w-r1m5', 'w-r1m6'),   -- Midwest: R1M5 winner vs R1M6 winner
    (tid, 2, 4, 'w-r1m7', 'w-r1m8');   -- East: R1M7 winner vs R1M8 winner

  -- Round 3 (Final Four): 2 matches
  -- South champ vs West champ; Midwest champ vs East champ
  insert into template_matches (template_id, round, match_number, home_slot, away_slot) values
    (tid, 3, 1, 'w-r2m1', 'w-r2m2'),   -- South champ vs West champ
    (tid, 3, 2, 'w-r2m3', 'w-r2m4');   -- Midwest champ vs East champ

  -- Round 4 (Championship): 1 match
  insert into template_matches (template_id, round, match_number, home_slot, away_slot) values
    (tid, 4, 1, 'w-r3m1', 'w-r3m2');   -- Final Four winner vs Final Four winner

end $$;
