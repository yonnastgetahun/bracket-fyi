-- Frozen winner-only service-reader projection (baseline columns only).
set role service_role;
select jsonb_build_object(
'leagues',(select jsonb_agg(to_jsonb(x) order by id) from
(select id,template_id,organizer_token,join_token,scoring_config,status,locked_at from leagues) x),
'participants',(select jsonb_agg(to_jsonb(x) order by id) from
(select id,league_id,magic_token,display_name from participants) x),
'picks',(select jsonb_agg(to_jsonb(x) order by id) from
(select id,league_id,participant_id,slot_id,team_id,submitted_at,locked from picks) x),
'results',(select jsonb_agg(to_jsonb(x) order by pick_id) from
(select pick_id,league_id,participant_id,picked_team_id,winner_team_id,points_earned,is_correct,locked from v_pick_results) x),
'leaderboard',(select jsonb_agg(to_jsonb(x) order by participant_id) from
(select participant_id,league_id,points,total_points,rank,correct_picks,wrong_picks,pending_picks from v_leaderboard) x)
);
