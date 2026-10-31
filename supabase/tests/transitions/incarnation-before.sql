-- Committed at 00004 in every lane. Lost key has a real, deliberately deleted
-- pre-upgrade version/deadline, not an invented post-upgrade ledger entry.
begin;
insert into templates(id,name,type) values(md5('transition-incarnation-template')::uuid,'SYNTHETIC transition incarnation','bracket');
insert into event_template_configs(template_id,version,sealed,manifest)
values(md5('transition-incarnation-template')::uuid,1,true,'{"markets":[{"id":"m","windowId":"w","choices":["a","b"]}]}');
insert into leagues(id,name,template_id)
select md5('transition-incarnation-'||k)::uuid,'SYNTHETIC transition incarnation '||k,md5('transition-incarnation-template')::uuid
from unnest(array['live','lost']) k;
insert into event_league_evaluations(league_id,configuration_version)
select md5('transition-incarnation-'||k)::uuid,1 from unnest(array['live','lost']) k;
insert into participants(id,league_id,display_name,magic_token)
select md5('transition-incarnation-person-'||k)::uuid,md5('transition-incarnation-'||k)::uuid,'Synthetic history '||k,
md5('transition-incarnation-token-'||k)::uuid from unnest(array['live','lost']) k;
set local role service_role;
select configure_event_window(md5('transition-incarnation-'||k)::uuid,'w',0,'open',now()+interval '3 days',true,array['m'])
from unnest(array['live','lost']) k;
select configure_event_window(md5('transition-incarnation-'||k)::uuid,'w',1,'open',now()+interval '2 days',true,array['m'])
from unnest(array['live','lost']) k;
select configure_event_window(md5('transition-incarnation-'||k)::uuid,'w',2,'open',now()+interval '1 day',true,array['m'])
from unnest(array['live','lost']) k;
select configure_event_window(md5('transition-incarnation-lost')::uuid,'w',3,null,null,null,null,true);
commit;
