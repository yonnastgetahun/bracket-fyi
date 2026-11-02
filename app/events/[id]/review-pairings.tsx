"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ApplicationView } from "@/lib/events/application";
const field="mt-2 w-full rounded-lg border border-border bg-canvas p-3 text-primary";
export function ReviewPairings({data,windowId,busy,command}:{data:ApplicationView;windowId:string;busy:boolean;command:(body:unknown)=>Promise<boolean>}) {
 const w=data.windows.find(w=>w.id===windowId)!;
 if(!data.organizer||!data.pairingReviewSupported||w.state!=="unopened"||!w.markets.some(m=>m.sources.some(s=>s.kind!=="entrant")))return null;
 return <details className="mb-5 border-l-2 border-accent pl-4"><summary className="cursor-pointer font-semibold">Review synthetic placements & home/away order</summary>
 <p className="my-4 text-sm text-secondary">Explicit rehearsal assignments only, never official entrants or standings. Resolve prior results first. All slots must be reviewed together; a second leg reverses the first leg. Picks and previous scoring definitions are retained. Open the window separately after review.</p>
 <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const pairings=Object.fromEntries(w.markets.map(m=>[m.id,[f.get(m.id+":0"),f.get(m.id+":1")]]));command({action:"pairings",windowId:w.id,version:w.version,configurationVersion:data.configurationVersion,basisToken:data.basisToken,pairings,reason:f.get("reason"),syntheticAcknowledged:true});}}>
 <div className="grid gap-4">{w.markets.map(m=><fieldset key={m.id} className="rounded-lg border border-border p-3"><legend className="text-xs">{m.id.split(":market:")[1]??m.id}</legend><div className="grid gap-3 sm:grid-cols-2">{[0,1].map(i=><label key={i} className="text-sm">{i===0?"First slot / home":"Second slot / away"}<select required defaultValue={m.actualPairing?.[i]??""} name={m.id+":"+i} className={field}><option value="" disabled>Choose reviewed entrant</option>{m.eligible.map(id=><option key={id} value={id}>{data.entrants.find(e=>e.id===id)?.name??id}</option>)}</select></label>)}</div></fieldset>)}</div>
 <label className="mt-4 block">Review reason<input name="reason" required maxLength={500} className={field}/></label>
 <label className="my-4 block text-sm"><input type="checkbox" required className="mr-2"/>I reviewed every synthetic placement and orientation. This is not official qualification evidence.</label>
 <Button disabled={busy}>Save versioned review</Button></form></details>;
}
export function FakeNotifications({data,busy,command}:{data:ApplicationView;busy:boolean;command:(body:unknown)=>Promise<boolean>}) {
 if(!data.participantId&&!data.organizer)return null;
 return <section className="my-10 rounded-xl border border-border p-5"><h2 className="font-display text-2xl uppercase">Rehearsal notices</h2><p className="my-3 text-sm text-secondary">Fake queue only. No browser push permission, real endpoint, delivery or sending controls. Consent applies only to your own role in this league.</p>
 <form className="space-y-4" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const role=String(f.get("role"));command({action:"consent",role,enabled:f.get("enabled")==="on",kinds:role==="organizer"?["provider_stale"]:["result_final","score_change","result_correction","league_complete","broadcast"],fakeAcknowledged:true});}}>
 <label>Role<select name="role" className={field}>{data.participantId&&<option value="participant">Participant — results, corrections, scores, completion & broadcasts</option>}{data.organizer&&<option value="organizer">Organizer — provider-stale notices</option>}</select></label>
 <label className="block"><input name="enabled" type="checkbox" className="mr-2"/>Enable these fake notices (unchecked revokes consent)</label>
 <label className="block text-sm"><input type="checkbox" required className="mr-2"/>I explicitly consent to updating this fake subscription.</label><Button disabled={busy} variant="secondary">Save fake consent</Button></form>
 {data.organizer&&<form className="mt-6 border-t border-border pt-4" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);command({action:"broadcast",message:f.get("message"),idempotencyKey:crypto.randomUUID(),fakeAcknowledged:true});}}><label>Organizer announcement<textarea name="message" required maxLength={500} className={field}/></label><p className="my-3 text-xs text-secondary">Updates the league announcement and queues fake notices for subscribed participants only.</p><Button disabled={busy}>Queue fake broadcast</Button></form>}
 </section>;
}

export function ReviewQualifiers({data,busy,command}:{data:ApplicationView;busy:boolean;command:(body:unknown)=>Promise<boolean>}) {
 const [retryKey,setRetryKey]=useState(()=>crypto.randomUUID());
 if(!data.organizer||!data.structuralQualifierReviewSupported)return null;
 const external=data.windows.some(w=>w.markets.some(m=>m.domain==="series-winner"));
 return <section className="my-8 rounded-xl border border-border p-5"><h2 className="font-display text-2xl uppercase">Review actual qualification</h2>
 <p className="my-3 text-sm text-secondary">{external?"Use the separate Play-In league’s actual results to fill playoff seeds 7 and 8. Entries, picks and points stay separate.":"Resolve all 12 Opening Round results, then review the Round-of-64 qualifiers."} Corrections refresh pairings before lock. After lock, incompatible changes are held; saved predictions never change.</p>
 <form className="space-y-4" onChange={()=>setRetryKey(crypto.randomUUID())} onSubmit={async e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form);
 const saved=await command({action:"qualifiers",configurationVersion:data.configurationVersion,basisToken:data.basisToken,
 idempotencyKey:retryKey,reason:f.get("reason"),syntheticAcknowledged:true,
 ...(external?{sourceLeagueId:f.get("sourceLeagueId"),sourceOrganizerToken:f.get("sourceOrganizerToken")}: {})});
 if(saved){form.reset();setRetryKey(crypto.randomUUID());}}}>
 {external&&<><label className="block">Play-In league ID<input name="sourceLeagueId" required className={field}/></label>
 <label className="block">Play-In organizer recovery credential<input name="sourceOrganizerToken" type="password" autoComplete="off" required className={field}/></label>
 <p className="text-xs text-secondary">Used only to authorize this handoff. It is not saved in the playoff league or returned to participants.</p></>}
 <label className="block">Review reason<input name="reason" required maxLength={500} className={field}/></label>
 <label className="block text-sm"><input type="checkbox" required className="mr-2"/>I reviewed the latest actual synthetic qualification results.</label>
 <Button disabled={busy}>Review latest qualifiers</Button></form></section>;
}
