-- Bracket.fyi seed: Oscars 2025 (97th Academy Awards)
--
-- This seed is NOT run automatically. Run once per environment:
--
--   psql "$DATABASE_URL" -f supabase/seeds/oscars_2025.sql
--
-- Or via Supabase CLI:
--   supabase db execute --file supabase/seeds/oscars_2025.sql
--
-- Creates 1 pickem template with 23 categories + all nominees.
-- Winners are pre-populated from the March 2, 2025 ceremony.
-- Organizer can delete from template_results to run "blind" (pre-ceremony)
-- or leave as-is for a historical trivia format.
--
-- Nominee IDs use prefix conventions:
--   movie-*   : films (Best Picture nominees + films competing in craft categories)
--   person-*  : named individuals (directors, actors, songwriters, etc.)
--   song-*    : specific song nominations
--
-- NOTE: Best Picture nominees include all 10 films nominated.
-- Craft category nominees are the 5 films/teams nominated per category.

do $$
declare
  tid  uuid;
  mid  uuid;  -- reusable variable for template_match id
begin
  insert into templates (name, type, team_registry, scoring_defaults, topology, results_provider)
  values (
    'Oscars 2025 (97th Academy Awards)',
    'pickem',
    '[
      {"id":"movie-anora",               "name":"Anora",                              "type":"movie"},
      {"id":"movie-brutalist",           "name":"The Brutalist",                      "type":"movie"},
      {"id":"movie-conclave",            "name":"Conclave",                           "type":"movie"},
      {"id":"movie-dune2",               "name":"Dune: Part Two",                     "type":"movie"},
      {"id":"movie-emilia-perez",        "name":"Emilia Pérez",                       "type":"movie"},
      {"id":"movie-ive-seen-it-all",     "name":"I''m Still Here",                   "type":"movie"},
      {"id":"movie-nickel-boys",         "name":"Nickel Boys",                        "type":"movie"},
      {"id":"movie-substance",           "name":"The Substance",                      "type":"movie"},
      {"id":"movie-wicked",              "name":"Wicked",                             "type":"movie"},
      {"id":"movie-complete-unknown",    "name":"A Complete Unknown",                 "type":"movie"},
      {"id":"movie-flow",                "name":"Flow",                               "type":"movie"},
      {"id":"movie-inside-out-2",        "name":"Inside Out 2",                       "type":"movie"},
      {"id":"movie-memoir-snail",        "name":"The Wild Robot",                     "type":"movie"},
      {"id":"movie-wallace-gromit",      "name":"Wallace & Gromit: Vengeance Most Fowl","type":"movie"},
      {"id":"movie-mechanism",           "name":"The Seed of the Sacred Fig",         "type":"movie"},
      {"id":"movie-grand-tour",          "name":"The Grand Tour",                     "type":"movie"},
      {"id":"movie-flow-intl",           "name":"Flow",                               "type":"movie"},
      {"id":"movie-real-pain",           "name":"A Real Pain",                        "type":"movie"},
      {"id":"movie-sing-sing",           "name":"Sing Sing",                          "type":"movie"},
      {"id":"movie-no-other-land",       "name":"No Other Land",                      "type":"movie"},
      {"id":"movie-porcelain-war",       "name":"Porcelain War",                      "type":"movie"},
      {"id":"movie-sugarcane",           "name":"Sugarcane",                          "type":"movie"},
      {"id":"movie-soundtrack-coup",     "name":"Soundtrack to a Coup d''Etat",      "type":"movie"},
      {"id":"movie-only-girl",           "name":"The Only Girl in the Orchestra",     "type":"movie"},
      {"id":"movie-im-ready-warden",     "name":"I Am Ready, Warden",                "type":"movie"},
      {"id":"movie-incident",            "name":"Incident",                           "type":"movie"},
      {"id":"movie-instruments-beating", "name":"Instruments of a Beating Heart",    "type":"movie"},
      {"id":"movie-im-not-robot",        "name":"I''m Not a Robot",                  "type":"movie"},
      {"id":"movie-a-lien",              "name":"A Lien",                             "type":"movie"},
      {"id":"movie-last-ranger",         "name":"The Last Ranger",                    "type":"movie"},
      {"id":"movie-man-not-remain",      "name":"The Man Who Could Not Remain Silent","type":"movie"},
      {"id":"movie-anuja",               "name":"Anuja",                              "type":"movie"},
      {"id":"movie-in-the-shadow",       "name":"In the Shadow of the Cypress",      "type":"movie"},
      {"id":"movie-magic-candies",       "name":"Magic Candies",                      "type":"movie"},
      {"id":"movie-beautiful-men",       "name":"Beautiful Men",                      "type":"movie"},
      {"id":"movie-wander-to-wonder",    "name":"Wander to Wonder",                  "type":"movie"},
      {"id":"movie-yuck",                "name":"Yuck!",                              "type":"movie"},
      {"id":"person-sean-baker",         "name":"Sean Baker",                         "type":"person", "role":"director"},
      {"id":"person-brady-corbet",       "name":"Brady Corbet",                       "type":"person", "role":"director"},
      {"id":"person-james-mangold",      "name":"James Mangold",                      "type":"person", "role":"director"},
      {"id":"person-coralie-fargeat",    "name":"Coralie Fargeat",                    "type":"person", "role":"director"},
      {"id":"person-jacques-audiard",    "name":"Jacques Audiard",                    "type":"person", "role":"director"},
      {"id":"person-adrien-brody",       "name":"Adrien Brody",                       "type":"person", "role":"actor"},
      {"id":"person-timothee-chalamet",  "name":"Timothée Chalamet",                 "type":"person", "role":"actor"},
      {"id":"person-colman-domingo",     "name":"Colman Domingo",                     "type":"person", "role":"actor"},
      {"id":"person-ralph-fiennes",      "name":"Ralph Fiennes",                      "type":"person", "role":"actor"},
      {"id":"person-sebastian-stan",     "name":"Sebastian Stan",                     "type":"person", "role":"actor"},
      {"id":"person-mikey-madison",      "name":"Mikey Madison",                      "type":"person", "role":"actress"},
      {"id":"person-cynthia-erivo",      "name":"Cynthia Erivo",                      "type":"person", "role":"actress"},
      {"id":"person-karla-sofia-gascon", "name":"Karla Sofía Gascón",               "type":"person", "role":"actress"},
      {"id":"person-demi-moore",         "name":"Demi Moore",                         "type":"person", "role":"actress"},
      {"id":"person-fernanda-torres",    "name":"Fernanda Torres",                    "type":"person", "role":"actress"},
      {"id":"person-kieran-culkin",      "name":"Kieran Culkin",                      "type":"person", "role":"supporting-actor"},
      {"id":"person-yura-borisov",       "name":"Yura Borisov",                       "type":"person", "role":"supporting-actor"},
      {"id":"person-edward-norton",      "name":"Edward Norton",                      "type":"person", "role":"supporting-actor"},
      {"id":"person-jeremy-strong",      "name":"Jeremy Strong",                      "type":"person", "role":"supporting-actor"},
      {"id":"person-zach-galifianakis",  "name":"Zach Galifianakis",                 "type":"person", "role":"supporting-actor"},
      {"id":"person-zoe-saldana",        "name":"Zoe Saldaña",                       "type":"person", "role":"supporting-actress"},
      {"id":"person-monica-barbaro",     "name":"Monica Barbaro",                     "type":"person", "role":"supporting-actress"},
      {"id":"person-ariana-grande",      "name":"Ariana Grande",                      "type":"person", "role":"supporting-actress"},
      {"id":"person-felicity-jones",     "name":"Felicity Jones",                     "type":"person", "role":"supporting-actress"},
      {"id":"person-isabella-rossellini","name":"Isabella Rossellini",               "type":"person", "role":"supporting-actress"},
      {"id":"person-daniel-blumberg",    "name":"Daniel Blumberg",                    "type":"person", "role":"composer"},
      {"id":"person-volker-bertelmann",  "name":"Volker Bertelmann",                  "type":"person", "role":"composer"},
      {"id":"person-kris-bowers",        "name":"Kris Bowers",                        "type":"person", "role":"composer"},
      {"id":"person-clement-ducol",      "name":"Clément Ducol & Camille",           "type":"person", "role":"composer"},
      {"id":"person-john-powell",        "name":"John Powell",                        "type":"person", "role":"composer"},
      {"id":"song-el-mal",               "name":"\"El Mal\" (Emilia Pérez)",         "type":"song"},
      {"id":"song-never-too-late",       "name":"\"Never Too Late\" (Elton John: Never Too Late)", "type":"song"},
      {"id":"song-like-a-bird",          "name":"\"Like a Bird\" (Sing Sing)",       "type":"song"},
      {"id":"song-mi-camino",            "name":"\"Mi Camino\" (Emilia Pérez)",      "type":"song"},
      {"id":"song-im-just-ken-too",      "name":"\"The Journey\" (The Six Triple Eight)", "type":"song"},
      {"id":"movie-nosferatu",           "name":"Nosferatu",                          "type":"movie"},
      {"id":"movie-alien-romulus",       "name":"Alien: Romulus",                     "type":"movie"},
      {"id":"movie-better-man",          "name":"Better Man",                         "type":"movie"},
      {"id":"movie-kingdom-apes",        "name":"Kingdom of the Planet of the Apes",  "type":"movie"}
    ]'::jsonb,
    '{"scheme":"pickem_weighted","major_categories":["best-picture","best-director","best-actor","best-actress","best-supporting-actor","best-supporting-actress"],"major_points":3,"other_points":1,"tiebreakers":["fewest_wrong"]}'::jsonb,
    '{"type":"pickem","categories":[
      {
        "id":"best-picture",
        "name":"Best Picture",
        "nominees":["movie-anora","movie-brutalist","movie-conclave","movie-dune2","movie-emilia-perez","movie-ive-seen-it-all","movie-nickel-boys","movie-substance","movie-wicked","movie-complete-unknown"],
        "winner":"movie-anora"
      },
      {
        "id":"best-director",
        "name":"Best Director",
        "nominees":["person-sean-baker","person-brady-corbet","person-james-mangold","person-coralie-fargeat","person-jacques-audiard"],
        "winner":"person-sean-baker"
      },
      {
        "id":"best-actor",
        "name":"Best Actor",
        "nominees":["person-adrien-brody","person-timothee-chalamet","person-colman-domingo","person-ralph-fiennes","person-sebastian-stan"],
        "winner":"person-adrien-brody"
      },
      {
        "id":"best-actress",
        "name":"Best Actress",
        "nominees":["person-mikey-madison","person-cynthia-erivo","person-karla-sofia-gascon","person-demi-moore","person-fernanda-torres"],
        "winner":"person-mikey-madison"
      },
      {
        "id":"best-supporting-actor",
        "name":"Best Supporting Actor",
        "nominees":["person-kieran-culkin","person-yura-borisov","person-edward-norton","person-jeremy-strong","person-zach-galifianakis"],
        "winner":"person-kieran-culkin"
      },
      {
        "id":"best-supporting-actress",
        "name":"Best Supporting Actress",
        "nominees":["person-zoe-saldana","person-monica-barbaro","person-ariana-grande","person-felicity-jones","person-isabella-rossellini"],
        "winner":"person-zoe-saldana"
      },
      {
        "id":"best-original-screenplay",
        "name":"Best Original Screenplay",
        "nominees":["movie-anora","movie-brutalist","movie-substance","movie-real-pain","movie-emilia-perez"],
        "winner":"movie-anora"
      },
      {
        "id":"best-adapted-screenplay",
        "name":"Best Adapted Screenplay",
        "nominees":["movie-conclave","movie-anora","movie-complete-unknown","movie-nickel-boys","movie-sing-sing"],
        "winner":"movie-conclave"
      },
      {
        "id":"best-animated-feature",
        "name":"Best Animated Feature",
        "nominees":["movie-flow","movie-inside-out-2","movie-memoir-snail","movie-wallace-gromit","movie-mechanism"],
        "winner":"movie-flow"
      },
      {
        "id":"best-international-feature",
        "name":"Best International Feature Film",
        "nominees":["movie-ive-seen-it-all","movie-flow-intl","movie-emilia-perez","movie-grand-tour","movie-mechanism"],
        "winner":"movie-ive-seen-it-all"
      },
      {
        "id":"best-documentary-feature",
        "name":"Best Documentary Feature Film",
        "nominees":["movie-no-other-land","movie-porcelain-war","movie-sugarcane","movie-soundtrack-coup","movie-only-girl"],
        "winner":"movie-no-other-land"
      },
      {
        "id":"best-documentary-short",
        "name":"Best Documentary Short Film",
        "nominees":["movie-only-girl","movie-im-ready-warden","movie-incident","movie-instruments-beating","movie-sugarcane"],
        "winner":"movie-only-girl"
      },
      {
        "id":"best-live-action-short",
        "name":"Best Live Action Short Film",
        "nominees":["movie-im-not-robot","movie-a-lien","movie-last-ranger","movie-man-not-remain","movie-anuja"],
        "winner":"movie-im-not-robot"
      },
      {
        "id":"best-animated-short",
        "name":"Best Animated Short Film",
        "nominees":["movie-in-the-shadow","movie-beautiful-men","movie-magic-candies","movie-wander-to-wonder","movie-yuck"],
        "winner":"movie-in-the-shadow"
      },
      {
        "id":"best-cinematography",
        "name":"Best Cinematography",
        "nominees":["movie-brutalist","movie-conclave","movie-dune2","movie-emilia-perez","movie-wicked"],
        "winner":"movie-brutalist"
      },
      {
        "id":"best-film-editing",
        "name":"Best Film Editing",
        "nominees":["movie-anora","movie-brutalist","movie-conclave","movie-emilia-perez","movie-wicked"],
        "winner":"movie-anora"
      },
      {
        "id":"best-production-design",
        "name":"Best Production Design",
        "nominees":["movie-wicked","movie-brutalist","movie-conclave","movie-dune2","movie-nosferatu"],
        "winner":"movie-wicked"
      },
      {
        "id":"best-costume-design",
        "name":"Best Costume Design",
        "nominees":["movie-wicked","movie-anora","movie-conclave","movie-nosferatu","movie-complete-unknown"],
        "winner":"movie-wicked"
      },
      {
        "id":"best-makeup-hairstyling",
        "name":"Best Makeup and Hairstyling",
        "nominees":["movie-substance","movie-brutalist","movie-conclave","movie-emilia-perez","movie-wicked"],
        "winner":"movie-substance"
      },
      {
        "id":"best-sound",
        "name":"Best Sound",
        "nominees":["movie-dune2","movie-brutalist","movie-complete-unknown","movie-emilia-perez","movie-wicked"],
        "winner":"movie-dune2"
      },
      {
        "id":"best-visual-effects",
        "name":"Best Visual Effects",
        "nominees":["movie-dune2","movie-alien-romulus","movie-better-man","movie-kingdom-apes","movie-wicked"],
        "winner":"movie-dune2"
      },
      {
        "id":"best-original-score",
        "name":"Best Original Score",
        "nominees":["person-daniel-blumberg","person-volker-bertelmann","person-kris-bowers","person-clement-ducol","person-john-powell"],
        "winner":"person-daniel-blumberg"
      },
      {
        "id":"best-original-song",
        "name":"Best Original Song",
        "nominees":["song-el-mal","song-never-too-late","song-like-a-bird","song-mi-camino","song-im-just-ken-too"],
        "winner":"song-el-mal"
      }
    ]}'::jsonb,
    null
  )
  returning id into tid;

  -- One template_match row per category. home_slot carries the category id for
  -- the pickem UI to resolve which category this match row represents.
  -- away_slot is a fixed sentinel value ('nominees').
  insert into template_matches (template_id, round, match_number, home_slot, away_slot) values
    (tid, 1,  1,  'category:best-picture',             'nominees'),
    (tid, 1,  2,  'category:best-director',            'nominees'),
    (tid, 1,  3,  'category:best-actor',               'nominees'),
    (tid, 1,  4,  'category:best-actress',             'nominees'),
    (tid, 1,  5,  'category:best-supporting-actor',    'nominees'),
    (tid, 1,  6,  'category:best-supporting-actress',  'nominees'),
    (tid, 1,  7,  'category:best-original-screenplay', 'nominees'),
    (tid, 1,  8,  'category:best-adapted-screenplay',  'nominees'),
    (tid, 1,  9,  'category:best-animated-feature',    'nominees'),
    (tid, 1,  10, 'category:best-international-feature','nominees'),
    (tid, 1,  11, 'category:best-documentary-feature', 'nominees'),
    (tid, 1,  12, 'category:best-documentary-short',   'nominees'),
    (tid, 1,  13, 'category:best-live-action-short',   'nominees'),
    (tid, 1,  14, 'category:best-animated-short',      'nominees'),
    (tid, 1,  15, 'category:best-cinematography',      'nominees'),
    (tid, 1,  16, 'category:best-film-editing',        'nominees'),
    (tid, 1,  17, 'category:best-production-design',   'nominees'),
    (tid, 1,  18, 'category:best-costume-design',      'nominees'),
    (tid, 1,  19, 'category:best-makeup-hairstyling',  'nominees'),
    (tid, 1,  20, 'category:best-sound',               'nominees'),
    (tid, 1,  21, 'category:best-visual-effects',      'nominees'),
    (tid, 1,  22, 'category:best-original-score',      'nominees'),
    (tid, 1,  23, 'category:best-original-song',       'nominees');

  -- Pre-populate results from the March 2, 2025 ceremony.
  -- winner_team_id corresponds to team_registry ids above.
  insert into template_results (template_id, template_match_id, winner_team_id, entered_by)
  select tid, id, 'movie-anora',               'organizer' from template_matches where template_id = tid and match_number = 1
  union all
  select tid, id, 'person-sean-baker',         'organizer' from template_matches where template_id = tid and match_number = 2
  union all
  select tid, id, 'person-adrien-brody',       'organizer' from template_matches where template_id = tid and match_number = 3
  union all
  select tid, id, 'person-mikey-madison',      'organizer' from template_matches where template_id = tid and match_number = 4
  union all
  select tid, id, 'person-kieran-culkin',      'organizer' from template_matches where template_id = tid and match_number = 5
  union all
  select tid, id, 'person-zoe-saldana',        'organizer' from template_matches where template_id = tid and match_number = 6
  union all
  select tid, id, 'movie-anora',               'organizer' from template_matches where template_id = tid and match_number = 7
  union all
  select tid, id, 'movie-conclave',            'organizer' from template_matches where template_id = tid and match_number = 8
  union all
  select tid, id, 'movie-flow',                'organizer' from template_matches where template_id = tid and match_number = 9
  union all
  select tid, id, 'movie-ive-seen-it-all',     'organizer' from template_matches where template_id = tid and match_number = 10
  union all
  select tid, id, 'movie-no-other-land',       'organizer' from template_matches where template_id = tid and match_number = 11
  union all
  select tid, id, 'movie-only-girl',           'organizer' from template_matches where template_id = tid and match_number = 12
  union all
  select tid, id, 'movie-im-not-robot',        'organizer' from template_matches where template_id = tid and match_number = 13
  union all
  select tid, id, 'movie-in-the-shadow',       'organizer' from template_matches where template_id = tid and match_number = 14
  union all
  select tid, id, 'movie-brutalist',           'organizer' from template_matches where template_id = tid and match_number = 15
  union all
  select tid, id, 'movie-anora',               'organizer' from template_matches where template_id = tid and match_number = 16
  union all
  select tid, id, 'movie-wicked',              'organizer' from template_matches where template_id = tid and match_number = 17
  union all
  select tid, id, 'movie-wicked',              'organizer' from template_matches where template_id = tid and match_number = 18
  union all
  select tid, id, 'movie-substance',           'organizer' from template_matches where template_id = tid and match_number = 19
  union all
  select tid, id, 'movie-dune2',               'organizer' from template_matches where template_id = tid and match_number = 20
  union all
  select tid, id, 'movie-dune2',               'organizer' from template_matches where template_id = tid and match_number = 21
  union all
  select tid, id, 'person-daniel-blumberg',    'organizer' from template_matches where template_id = tid and match_number = 22
  union all
  select tid, id, 'song-el-mal',               'organizer' from template_matches where template_id = tid and match_number = 23;

end $$;
