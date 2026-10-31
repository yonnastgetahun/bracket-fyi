import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {localRoom,fixtureFile,legacyPicks,assertLegacyScore,installFakePush} from '../verify-legacy-browser.mjs';
import {parseRecovery,preserved,validateRecoveryFixture,otherParticipantPreserved} from '../verify-event-recovery-browser.mjs';
const url='http://127.0.0.1:3137/events/00000000-0000-4000-8000-000000000001';
const token='00000000-0000-4000-8000-000000000002';
test('loopback clean-room boundary rejects external and secret-bearing input',()=>{
 assert.equal(localRoom(url,'events'),url);
 for(const value of [url.replace('127.0.0.1','example.com'),url+'?token=secret',url+'#secret',url+'/data'])
  assert.throws(()=>localRoom(value,'events'));
});
test('fixture cannot silently pass without synthetic marker or private permissions',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'browser-contract-'));
 try{
  const file=path.join(dir,'fixture.json');
  fs.writeFileSync(file,JSON.stringify({schemaVersion:1,synthetic:true,origin:'http://127.0.0.1:3137'}),{mode:0o600});
  assert(fixtureFile(file).synthetic);
  fs.chmodSync(file,0o644);assert.throws(()=>fixtureFile(file));fs.chmodSync(file,0o600);
  fs.writeFileSync(file,'{"schemaVersion":1,"synthetic":false}');assert.throws(()=>fixtureFile(file));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('attachment binds exact league/role and rejects missing/duplicate credential',()=>{
 const text='Header\nLeague: '+url+'\nRole: participant\nCredential: '+token+'\n';
 assert.equal(parseRecovery(text,url,'participant'),token);
 assert.throws(()=>parseRecovery(text,url,'organizer'));
 assert.throws(()=>parseRecovery(text,url+'x','participant'));
 assert.throws(()=>parseRecovery(text+'Credential: '+token+'\n',url,'participant'));
 assert.throws(()=>parseRecovery(text.replace(token,''),url,'participant'));
});
test('recovery oracle rejects new roster entry, changed picks, swapped identity and role escalation',()=>{
 const before={participantId:'a',organizer:false,participants:[{id:'a'},{id:'b'}],picks:[{participantId:'a',marketId:'m',choice:'x'}]};
 preserved(before,structuredClone(before));
 for(const change of [
  {...before,participantId:'b'},
  {...before,organizer:true},
  {...before,participants:[...before.participants,{id:'c'}]},
  {...before,picks:[{participantId:'a',marketId:'m',choice:'y'}]},
  {...before,picks:[...before.picks,{participantId:'b',marketId:'m',choice:'x'}]},
 ])assert.throws(()=>preserved(before,change));
});
test('legacy score oracle is exact and pick identity detects altered choice',()=>{
 const picks=[{participant_id:'p',slot_id:'m',picked_team_id:'x'}];
 const data={rows:[{rank:1,total_points:3,wrong_picks:0,correct_picks:3}],picks};
 const oracle={rank:1,points:3,wrong:0,correct:3};
 assertLegacyScore(data,oracle);
 for(const key of ['rank','points','wrong','correct'])assert.throws(()=>assertLegacyScore(data,{...oracle,[key]:99}));
 assert.throws(()=>assertLegacyScore({...data,rows:[]},oracle));
 assert.throws(()=>legacyPicks([]));
 assert.notDeepEqual(legacyPicks(picks),legacyPicks([{...picks[0],picked_team_id:'y'}]));
});
test('fake browser push is reversible and cannot invoke a real transport',async()=>{
 const sandbox={window:{},navigator:{}};
 vm.runInNewContext('('+installFakePush.toString()+')()',sandbox);
 const reg=await sandbox.navigator.serviceWorker.ready;
 assert.equal(await reg.pushManager.getSubscription(),null);
 const sub=await reg.pushManager.subscribe();
 assert.equal(sub.toJSON().endpoint,'https://fake.invalid/no-send');
 assert.equal(await reg.pushManager.getSubscription(),sub);
 assert.equal(await sub.unsubscribe(),true);assert.equal(await reg.pushManager.getSubscription(),null);
 sandbox.window.__fakePush.reject=true;
 await assert.rejects(reg.pushManager.subscribe());
 assert.equal(sandbox.window.__fakePush.subscribe,2);assert.equal(sandbox.window.__fakePush.unsubscribe,1);
});
test('recovery fixtures require independent revoked credentials and second league',()=>{
 const cookie=(role,id,value=token)=>({name:'event_'+role+'_'+id,value});
 const id=url.split('/').at(-1),other='00000000-0000-4000-8000-000000000003';
 const f={league:{url,participantCookie:cookie('participant',id),organizerCookie:cookie('organizer',id)},
 otherLeague:{url:url.replace(id,other),participantCookie:cookie('participant',other,'foreign-p'),organizerCookie:cookie('organizer',other,'foreign-o')},
 otherParticipant:{participantCookie:cookie('participant',id,'separate-b'),expectedParticipantId:'b',expectedOwnPicks:[{marketId:'m',choice:'y'}]},
 expectedParticipantId:'a',expectedOwnPicks:[{marketId:'m',choice:'x'}],revoked:{participant:'old-p',organizer:'old-o'}};
 validateRecoveryFixture(f);
 assert.throws(()=>validateRecoveryFixture({...f,expectedOwnPicks:[]}));
 for(const change of [
  undefined,
  {...f.otherParticipant,expectedOwnPicks:[]},
  {...f.otherParticipant,expectedParticipantId:'a'},
  {...f.otherParticipant,participantCookie:f.league.participantCookie},
 ])assert.throws(()=>validateRecoveryFixture({...f,otherParticipant:change}));
 assert.throws(()=>validateRecoveryFixture({...f,otherLeague:f.league}));
 assert.throws(()=>validateRecoveryFixture({...f,revoked:{...f.revoked,participant:token}}));
});

test('B-only deletion fails independent private-pick oracle while A remains unchanged',()=>{
 const a={participantId:'a',organizer:false,participants:[{id:'a'},{id:'b'}],picks:[{participantId:'a',marketId:'m',choice:'home'}]};
 const b={...a,participantId:'b',picks:[{participantId:'b',marketId:'m',choice:'away'}]};
 const f={otherParticipant:{expectedParticipantId:'b',expectedOwnPicks:[{marketId:'m',choice:'away'}]}};
 otherParticipantPreserved(f,b);
 otherParticipantPreserved(f,structuredClone(b),b);
 preserved(a,structuredClone(a)); // Old A-only oracle still passes after deleting B's rows.
 assert.throws(()=>otherParticipantPreserved(f,{...b,picks:[]},b));
 assert.throws(()=>otherParticipantPreserved(f,{...b,picks:[]}));
 assert.throws(()=>otherParticipantPreserved(f,{...b,picks:a.picks},b));
 assert.throws(()=>otherParticipantPreserved(f,{...b,participantId:'a'},b));
 assert.throws(()=>otherParticipantPreserved(f,{...b,picks:[{...b.picks[0],choice:'home'}]},b));
});

test('CLI fixture validation errors never print raw private input or assertion diagnostics',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'recovery-private-error-'));
 try{
  const file=path.join(dir,'fixture.json');
  const marker='private-credential-canary-not-a-real-secret';
  fs.writeFileSync(file,JSON.stringify({schemaVersion:1,synthetic:true,origin:'http://127.0.0.1:3137',
   league:{url:'https://'+marker+'.invalid/events/00000000-0000-4000-8000-000000000001'}}),{mode:0o600});
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../verify-event-recovery-browser.mjs',import.meta.url)),file],{encoding:'utf8'});
  assert.equal(result.status,1);
  assert.equal(result.stdout,'');
  assert.equal(result.stderr,'Recovery verification failed; private details suppressed.\n');
  assert(!result.stderr.includes(marker));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
