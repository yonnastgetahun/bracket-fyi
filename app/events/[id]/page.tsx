import { notFound } from "next/navigation";
import { localEventApplicationEnabled } from "@/lib/events/application";
import { eventId } from "@/lib/events/application-contract";
import { EventRoom } from "./room";
export const dynamic="force-dynamic";
export default async function EventPage({params}:{params:Promise<{id:string}>}) {
 const {id}=await params;
 if(!localEventApplicationEnabled()||!eventId.safeParse(id).success)notFound();
 return <EventRoom id={id}/>;
}
