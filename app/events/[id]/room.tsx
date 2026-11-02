"use client";
import Link from "next/link";
import { useCallback,useEffect,useState,useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { OwnRecovery } from "./own-recovery";
import { WindowPicks } from "./window-picks";
import { ReviewPairings, ReviewQualifiers, FakeNotifications } from "./review-pairings";
import type { ApplicationView } from "@/lib/events/application";
const field="mt-2 w-full rounded-lg border border-border bg-canvas p-3 text-primary";
export function EventRoom({id}:{id:string}) {
 const [data,setData]=useState<ApplicationView|null>(null),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[invitation,setInvitation]=useState(""),[revision,setRevision]=useState(0);
 const invitationFragment=useRef<{id:string;value:string}|null>(null);
 const load=useCallback(async()=>{
  const response=await fetch("/events/"+id+"/data",{cache:"no-store"}),body=await response.json();
  if(!response.ok)throw new Error(body.error);setData(body);setRevision(r=>r+1);
 },[id]);
 useEffect(()=>{
  const hash=new URLSearchParams(window.location.hash.slice(1)),invite=hash.get("invite")??"";
  // Keep the scrubbed fragment across StrictMode's aborted first effect.
  // Scope it to the room so client navigation never reuses another invitation.
  if(hash.has("invite")||invitationFragment.current?.id!==id)invitationFragment.current={id,value:invite};
  setInvitation(invitationFragment.current.value);
  if(hash.has("invite"))history.replaceState(null,"",window.location.pathname);
  const controller=new AbortController();
  fetch("/events/"+id+"/data",{cache:"no-store",signal:controller.signal}).then(async response=>{
   const body=await response.json();if(!response.ok)throw new Error(body.error);
   setData(body);setRevision(r=>r+1);
  }).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
  return ()=>controller.abort();
 },[id]);
 async function command(body:unknown) {
  setBusy(true);setError("");setMessage("");
  try {const response=await fetch("/events/"+id+"/data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
   const result=await response.json();if(!response.ok)throw new Error(result.error);await load();setMessage("Saved. The current event state is shown below.");return true;
  }catch(e){setError(e instanceof Error?e.message:"Request failed.");return false;}finally{setBusy(false);}
 }
 if(!data)return <main className="mx-auto max-w-4xl p-8"><Link href="/events">← Events</Link><p role="status" className="mt-8">{error||"Opening the event room…"}</p></main>;
 const label=(choice:string)=>data.entrants.find(e=>e.id===choice)?.name??choice;
 return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
 <Link href="/events" className="text-secondary">← Event room</Link>
 <header className="my-8 border-b border-border pb-8"><p className="font-display text-xs uppercase tracking-[.2em] text-accent">{data.label}</p>
 <div className="mt-4 flex flex-wrap items-end justify-between gap-4"><h1 className="font-display text-4xl uppercase sm:text-6xl">{data.name}</h1><span className="rounded-full border border-border px-4 py-2 text-sm">{data.view.state}{data.frozen?" · picks frozen":""}</span></div>
 <p className="mt-4 text-secondary">Manual results · one point per scored unit · deadlines in {data.timeZone}. Automation unavailable.</p></header>
 <div aria-live="polite">{error&&<p role="alert" className="mb-5 rounded-lg border border-wrong p-4 text-wrong">{error}</p>}{message&&<p className="mb-5 text-correct">{message}</p>}</div>
 <div className="mb-8 flex flex-wrap gap-3"><Button variant="secondary" disabled={busy} onClick={()=>load().catch(e=>setError(e.message))}>Refresh state</Button>
 {data.organizer&&<Button variant="secondary" disabled={busy} onClick={()=>command({action:"freeze",frozen:!data.frozen})}>{data.frozen?"Resume open picks":"Freeze open picks"}</Button>}</div>
 {data.organizer&&data.invitation&&<Card className="mb-8"><h2 className="font-display text-xl">Invite the field</h2><p className="mt-2 text-sm text-secondary">Invitation only. New entries close at the first window cutoff. This is not an organizer recovery link.</p>
 <input aria-label="Invitation link" readOnly className={field} value={typeof window==="undefined"?"":window.location.origin+"/events/"+id+"#invite="+data.invitation} onFocus={e=>e.currentTarget.select()}/></Card>}
 {!data.participantId&&<Card className="mb-8"><h2 className="font-display text-xl">Join this league</h2><form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);command({action:"join",invitation,displayName:f.get("displayName")});}}>
 <label>Your name<input name="displayName" required maxLength={80} className={field}/></label><label>Invitation code<input required value={invitation} onChange={e=>setInvitation(e.target.value)} className={field}/></label><Button className="self-end" disabled={busy}>Join & save this device</Button></form><p className="mt-3 text-xs text-secondary">Your private participant session is stored in an HttpOnly cookie on this device.</p></Card>}
 <OwnRecovery id={id} organizer={data.organizer} participant={Boolean(data.participantId)}/>
 <section className="mb-10"><div className="mb-4 flex items-end justify-between"><h2 className="font-display text-2xl uppercase">The standings</h2><span className="text-sm text-secondary">{data.participants.length} entries</span></div>
 {data.view.state==="reconciliation-pending"?<Card>Results are being reconciled. Previous scores are hidden until the current basis is verified.</Card>:data.view.leaderboard.length===0?<Card>Standings appear after the first lock. Open-window picks remain private.</Card>:
 <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-left tabular-nums"><thead className="bg-raised text-sm text-secondary"><tr>{["Rank","Player","Points","Maximum","Wrong"].map(h=><th key={h} className="p-4">{h}</th>)}</tr></thead>
 <tbody>{data.view.leaderboard.map(row=><tr key={row.id} className="border-t border-border"><td className="p-4 font-display text-accent">{row.rank}</td><td className="p-4">{data.participants.find(p=>p.id===row.id)?.name??"Participant"}</td><td className="p-4 font-bold">{row.earned}</td><td className="p-4">{row.maximum??"Temporarily unverified"}</td><td className="p-4">{row.wrong}</td></tr>)}</tbody></table></div>}
 <p className="mt-3 text-xs text-secondary">Maximum is withheld when jointly feasible outcomes have not been established. No optimistic estimate is substituted.</p></section>
 <ReviewQualifiers data={data} busy={busy} command={command}/>
 <section><h2 className="mb-5 font-display text-2xl uppercase">Prediction windows</h2><div className="space-y-4">{data.windows.map(w=><details key={w.id} open={data.windows.length===1} className="rounded-xl border border-border bg-surface">
 <summary className="cursor-pointer p-5"><span className="font-semibold">{w.label}</span><span className="ml-3 text-xs uppercase text-accent">{w.state} · v{w.version}</span><span className="mt-2 block text-sm text-secondary">{w.cutoff?new Intl.DateTimeFormat("en",{dateStyle:"medium",timeStyle:"long",timeZone:data.timeZone}).format(new Date(w.cutoff)):"Schedule awaiting review"} · {w.markets.filter(m=>m.scored).length} scored</span></summary>
 <div className="border-t border-border p-5">{w.state==="unopened"&&<p className="mb-4 text-secondary">Qualification or reviewed pairings are required before this window can open. Synthetic timing is not an official schedule.</p>}
 {data.organizer&&w.state!=="locked"&&<div className="mb-5 flex flex-wrap gap-3">{w.state==="unopened"&&<form className="flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();const value=String(new FormData(e.currentTarget).get("cutoff")??"");command({action:"window",windowId:w.id,version:w.version,operation:"open",...(value?{cutoff:new Date(value).toISOString()}:{})});}}><label className="text-sm">Reviewed rehearsal cutoff (local time)<input type="datetime-local" name="cutoff" required={!w.cutoff} className={field}/></label><Button variant="secondary" disabled={busy}>Open if prerequisites resolved</Button></form>}
 <Button variant="secondary" disabled={busy} onClick={()=>{if(window.confirm("Lock this entire window now? It cannot reopen; missing picks are forfeited."))command({action:"window",windowId:w.id,version:w.version,operation:"lock"});}}>Lock window now</Button></div>}
 <ReviewPairings key={"review-"+revision} data={data} windowId={w.id} busy={busy} command={command}/>
 {data.participantId&&w.markets.some(m=>m.scored)&&<WindowPicks key={"picks-"+revision} data={data} windowId={w.id} busy={busy} command={command}/>}
 {w.state==="locked"&&<details className="mt-5"><summary className="cursor-pointer text-secondary">Revealed picks</summary>{data.participants.map(p=><div key={p.id} className="mt-4"><h3 className="font-semibold">{p.name}</h3><ul className="mt-2 text-xs text-secondary">{data.picks.filter(pick=>pick.participantId===p.id&&w.markets.some(m=>m.id===pick.marketId)).map(pick=><li key={pick.marketId} className="mb-1 break-words">{pick.marketId.split(":market:")[1]??pick.marketId}: {label(pick.choice)}</li>)}</ul></div>)}</details>}
 </div></details>)}</div></section>
 <FakeNotifications data={data} busy={busy} command={command}/>
 {data.organizer&&<ResultEditor data={data} busy={busy} command={command}/>}
 <section className="mt-10"><h2 className="mb-4 font-display text-2xl uppercase">Result provenance</h2><div className="space-y-3">{Object.entries(data.view.effective).map(([mid,r])=><details key={mid} className="rounded-lg border border-border p-4"><summary className="cursor-pointer break-words text-sm">{mid.split(":market:")[1]??mid} · {r.source} · {r.outcome.kind}{r.held?" · held":""}{r.excluded?" · excluded":""}</summary><dl className="mt-4 grid gap-2 text-xs text-secondary">
 <div>Winner: {r.outcome.kind==="winner"?label(r.outcome.entrant):r.outcome.kind==="winner-set"?r.outcome.entrants.map(label).join(", "):r.outcome.kind}</div>
 <div>Canonical: {r.canonicalResultId??"No shared result"} / v{r.canonicalVersion}</div><div>Local revision: {r.overrideRevision} · expires {r.expiresAt??"never"}</div><div>Configuration: {r.configurationVersion}</div>
 <div>Derivation: {r.derivedProvenance.algorithm??"Manual / not derived"} {r.derivedProvenance.algorithmVersion??""}</div>
 {r.derivedProvenance.children?.map(c=><div key={c.id}>Source {c.id} / v{c.version}</div>)}</dl></details>)}</div></section>
 <details className="mt-12 border-t border-border pt-6 text-sm"><summary className="cursor-pointer text-secondary">Recover an existing session</summary><p className="mt-3 text-secondary">Use the credential from your private recovery file for this league and role, not the invitation code. Restoring keeps your existing identity and saved picks. It replaces this device’s session for the selected role.</p><form className="mt-4 flex flex-wrap gap-3" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);command({action:"recover",role:f.get("role"),credential:f.get("credential")});e.currentTarget.reset();}}>
 <select name="role" aria-label="Session role" className={field+" sm:w-auto"}><option value="participant">Participant</option><option value="organizer">Organizer</option></select><input name="credential" aria-label="Your own recovery credential" type="password" required autoComplete="off" className={field+" sm:w-auto"}/><Button disabled={busy}>Recover session</Button></form></details>
 </main>;
}
function ResultEditor({data,busy,command}:{data:ApplicationView;busy:boolean;command:(body:unknown)=>Promise<boolean>}) {
 const markets=data.windows.flatMap(w=>w.markets),[selected,setSelected]=useState(markets[0]?.id??""),[action,setAction]=useState("override"),[kind,setKind]=useState(markets[0]?.domain==="nomination-winner-set"?"winner-set":"winner"),[retryKey,setRetryKey]=useState(()=>crypto.randomUUID());
 const m=markets.find(m=>m.id===selected),effective=data.view.effective[selected];
 if(!m||!effective)return null;
 return <Card className="mt-10"><h2 className="font-display text-2xl uppercase">Organizer result desk</h2><p className="mt-2 text-sm text-secondary">League-local only. Every change requires a reason and current conflict tokens; release reveals the latest shared result. No shared-event operator privileges.</p>
 <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);
 const outcome=kind==="winner"?{kind,entrant:f.get("winner")}:kind==="winner-set"?{kind,entrants:f.getAll("winners")}:{kind};
 const expiry=String(f.get("expiry")??"");
 const payload=action==="override"?{outcome,...(expiry?{expiresAt:new Date(expiry).toISOString()}:{})}:action==="hold"?{held:f.get("enabled")==="on"}:action==="disposition"?{excluded:f.get("enabled")==="on"}:{};
 if(await command({action:"result",command:{action,marketId:selected,payload,reason:f.get("reason"),expectedEffectiveToken:effective.effectiveToken,expectedCanonicalToken:effective.canonicalToken,idempotencyKey:retryKey}}))setRetryKey(crypto.randomUUID());
 }}>
 <label>Market<select className={field} value={selected} onChange={e=>{setSelected(e.target.value);setKind(markets.find(m=>m.id===e.target.value)?.domain==="nomination-winner-set"?"winner-set":"winner");setRetryKey(crypto.randomUUID());}}>{markets.map(m=><option value={m.id} key={m.id}>{m.id.split(":market:")[1]??m.id}</option>)}</select></label>
 <label>Action<select className={field} value={action} onChange={e=>{setAction(e.target.value);setRetryKey(crypto.randomUUID());}}><option value="override">Enter / override result</option><option value="release">Release to latest shared result</option><option value="hold">Hold / clear hold</option><option value="disposition">Exclude / reinstate scored & required unit</option></select></label>
 {action==="override"&&<><label>Outcome<select value={kind} onChange={e=>setKind(e.target.value)} className={field}>{m.domain!=="nomination-winner-set"&&<option value="winner">Winner</option>}{m.domain==="nomination-winner-set"&&<option value="winner-set">Winning nominations (including ties)</option>}{m.domain==="regulation-home-draw-away"&&<option value="draw">Regulation draw</option>}<option value="unresolved">Unresolved / suspended</option><option value="no-contest">No contest (disposition still required)</option></select></label>
 {kind==="winner"&&<label>Winning entrant<select name="winner" className={field}>{m.eligible.map(id=><option value={id} key={id}>{data.entrants.find(e=>e.id===id)?.name??id}</option>)}</select></label>}
 {kind==="winner-set"&&<fieldset><legend>Winning nominations</legend>{m.eligible.map(id=><label key={id} className="mt-2 block text-sm"><input type="checkbox" name="winners" value={id} className="mr-2"/>{data.entrants.find(e=>e.id===id)?.name??id}</label>)}</fieldset>}
 <label>Optional expiry (local time)<input type="datetime-local" name="expiry" className={field}/></label></>}
 {(action==="hold"||action==="disposition")&&<label className="self-center"><input type="checkbox" name="enabled" className="mr-3"/>{action==="hold"?"Hold this market (unchecked clears hold)":"Exclude this market (unchecked reinstates)"}</label>}
 <label>Reason<input name="reason" required maxLength={500} className={field}/></label>
 <div className="self-end"><Button disabled={busy}>Apply audited change</Button><p className="mt-2 text-xs text-secondary">Current local revision {effective.overrideRevision}. Refresh after a conflict.</p></div>
 </form></Card>;
}
