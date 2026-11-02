"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ApplicationView } from "@/lib/events/application";
import { applicationChoices } from "@/lib/events/application-picks";
export function WindowPicks({data,windowId,busy,command}:{data:ApplicationView;windowId:string;busy:boolean;command:(body:unknown)=>Promise<boolean>}) {
 const w=data.windows.find(w=>w.id===windowId)!;
 const all=data.windows.flatMap(w=>w.markets);
 const [picks,setPicks]=useState<Record<string,string>>(()=>Object.fromEntries(data.picks.filter(p=>p.participantId===data.participantId).map(p=>[p.marketId,p.choice])));
 const label=(id:string)=>data.entrants.find(e=>e.id===id)?.name??id;
 function change(id:string,value:string){
  const next={...picks,[id]:value};
  // Clear dependent stale picks; never silently substitute an entrant.
  for(const market of all)if(next[market.id]&&!applicationChoices(market,all,next).includes(next[market.id]))delete next[market.id];
  setPicks(next);
 }
 return <form onSubmit={e=>{e.preventDefault();command({action:"submit",windowId:w.id,version:w.version,picks:Object.fromEntries(w.markets.filter(m=>m.scored).map(m=>[m.id,picks[m.id]]))});}}>
 <div className="grid gap-5 md:grid-cols-2">{w.markets.filter(m=>m.scored).map(m=><label key={m.id} className="min-w-0 text-sm"><span className="block break-words text-secondary">{m.id.split(":market:")[1]??m.stage}</span>
 <select required disabled={w.state!=="open"||data.frozen||busy} value={picks[m.id]??""} onChange={e=>change(m.id,e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-canvas p-3 text-primary"><option value="">Choose a prediction</option>{applicationChoices(m,all,picks).map(c=><option key={c} value={c}>{label(c)}</option>)}</select></label>)}</div>
 <Button disabled={w.state!=="open"||data.frozen||busy} className="mt-6">Save complete window</Button><p className="mt-2 text-xs text-secondary">All scored picks are required. Changing an earlier prediction clears incompatible later picks, never silently replaces them.</p></form>;
}
