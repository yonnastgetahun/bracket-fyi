-- Populated new-format state before safety repair. Not a product/scoring oracle.
begin;
insert into contests(id,event_edition_id,stage_id,contest_key,name,kind)
values
(md5('transition-category')::uuid,md5('transition-edition')::uuid,md5('transition-stage')::uuid,'category','Synthetic category','category'),
(md5('transition-draw')::uuid,md5('transition-edition')::uuid,md5('transition-stage')::uuid,'draw','Synthetic draw','match');
insert into award_nominations(id,event_edition_id,contest_id,nomination_key,name)
select md5('transition-nomination-'||n)::uuid,md5('transition-edition')::uuid,md5('transition-category')::uuid,n,'Synthetic '||n from unnest(array['n1','n2']) n;
insert into contest_results(id,contest_id,event_edition_id,version,result_status,outcome_type,winner_nomination_ids,source_type,idempotency_key)
values(md5('transition-set-result')::uuid,md5('transition-category')::uuid,md5('transition-edition')::uuid,1,'awarded','winner_set',
array[md5('transition-nomination-n1')::uuid,md5('transition-nomination-n2')::uuid],'operator','transition-set-result'),
(md5('transition-draw-result')::uuid,md5('transition-draw')::uuid,md5('transition-edition')::uuid,1,'final','draw',null,'operator','transition-draw-result');
insert into templates(id,name,type) values(md5('transition-typed-template')::uuid,'Synthetic typed repair','bracket');
insert into leagues(id,name,template_id,organizer_token,join_token)
values(md5('transition-typed-league')::uuid,'Synthetic typed repair',md5('transition-typed-template')::uuid,
md5('transition-typed-organizer')::uuid,md5('transition-typed-join')::uuid);
insert into event_template_configs(template_id,version,sealed,manifest)
values(md5('transition-typed-template')::uuid,1,true,'{"markets":[{"id":"m1","windowId":"w1","choices":["home","draw","away"]}]}');
insert into event_league_evaluations(league_id,configuration_version) values(md5('transition-typed-league')::uuid,1);
insert into event_league_windows(league_id,window_key,state,cutoff,pairings_reviewed,market_ids)
values(md5('transition-typed-league')::uuid,'w1','open',now()+interval '1 day',true,array['m1']);
insert into participants(id,league_id,display_name,magic_token)
values(md5('transition-typed-person')::uuid,md5('transition-typed-league')::uuid,'Synthetic typed person',md5('transition-typed-magic')::uuid);
select submit_event_window(md5('transition-typed-league')::uuid,md5('transition-typed-magic')::uuid,'w1',1,'{"m1":"draw"}');
commit;
