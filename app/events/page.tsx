import Link from "next/link";
import { notFound } from "next/navigation";
import { localEventApplicationEnabled } from "@/lib/events/application";
import { listEventDefinitions } from "@/lib/events/catalog";
import { EventCreator } from "./creator";
export const dynamic="force-dynamic";
export default function EventsPage() {
 if(!localEventApplicationEnabled())notFound();
 return <main className="mx-auto max-w-6xl px-5 py-12"><Link href="/" className="text-secondary">← Bracket.fyi</Link>
  <p className="mt-10 font-display text-sm uppercase tracking-[.25em] text-accent">The event room / local rehearsal</p>
  <h1 className="my-5 font-display text-5xl uppercase sm:text-7xl">One field.<br/>Your predictions.</h1>
  <p className="max-w-2xl text-secondary">Nine manual templates. One point per scored result. Synthetic entrants and your chosen rehearsal deadline—not official fixtures. Automation and public activation are unavailable.</p>
  <EventCreator templates={listEventDefinitions().map(d=>({key:d.key,label:d.label,markets:d.markets.filter(m=>m.scored).length,windows:d.windows.length}))}/>
 </main>;
}
