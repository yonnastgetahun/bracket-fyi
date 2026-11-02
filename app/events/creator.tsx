"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
const field="mt-2 block w-full rounded-lg border border-border bg-canvas p-3 text-primary";
export function EventCreator({templates}:{templates:{key:string;label:string;markets:number;windows:number}[]}) {
 const router=useRouter();
 const [selected,setSelected]=useState(templates[0].key),[busy,setBusy]=useState(false),[error,setError]=useState("");
 return <form className="mt-10 grid gap-8 lg:grid-cols-[1.3fr_1fr]" onSubmit={async e=>{
  e.preventDefault();setBusy(true);setError("");const form=new FormData(e.currentTarget);
  try {const res=await fetch("/events/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
   templateKey:selected,name:form.get("name"),startsAt:new Date(String(form.get("startsAt"))).toISOString(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,
   ...(selected==="oscars-2027"?{categories:String(form.get("categories")).split(",").map(s=>s.trim()).filter(Boolean)}:{}),syntheticAcknowledged:true})});
   const data=await res.json();if(!res.ok)throw new Error(data.error);router.push("/events/"+data.id);
  }catch(err){setError(err instanceof Error?err.message:"Could not create event.");setBusy(false);}
 }}>
 <fieldset><legend className="mb-4 font-display uppercase tracking-widest text-secondary">01 / Choose your field</legend>
 <div className="grid gap-3 sm:grid-cols-2">{templates.map(t=><label key={t.key} className={"cursor-pointer rounded-xl border p-5 "+(selected===t.key?"border-accent bg-raised":"border-border bg-surface")}>
  <input type="radio" name="template" value={t.key} checked={selected===t.key} onChange={()=>setSelected(t.key)} className="mr-2 accent-amber-400"/>
  <span className="font-semibold">{t.label}</span><span className="mt-3 block text-xs text-secondary">{t.markets||"Selected categories"} points · {t.windows} window{t.windows===1?"":"s"} · DRAFT</span>
 </label>)}</div></fieldset>
 <section className="h-fit rounded-xl border border-border bg-surface p-6"><h2 className="font-display uppercase tracking-widest text-secondary">02 / Set the room</h2>
 <label className="mt-6 block">League name<input name="name" required maxLength={60} className={field} placeholder="The Friday prediction club"/></label>
 <label className="mt-5 block">Synthetic first cutoff (your local time)<input name="startsAt" type="datetime-local" required className={field}/></label>
 <p className="mt-2 text-xs text-secondary">A rehearsal deadline, not an official schedule. Later rounds with unresolved qualification remain closed.</p>
 {selected==="oscars-2027"&&<label className="mt-5 block">Synthetic category labels<input name="categories" required className={field} defaultValue="Picture, Director"/><span className="text-xs text-secondary">Comma-separated. Four synthetic nominations per category.</span></label>}
 <label className="my-6 flex items-start gap-3 text-sm"><input type="checkbox" required className="mt-1"/>I understand this is a local synthetic rehearsal, not a live official pool.</label>
 {error&&<p role="alert" className="mb-4 text-wrong">{error}</p>}
 <Button disabled={busy} className="w-full">{busy?"Creating…":"Create manual event →"}</Button>
 </section></form>;
}
