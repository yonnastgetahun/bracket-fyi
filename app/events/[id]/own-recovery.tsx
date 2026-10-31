"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export function OwnRecovery({id,organizer,participant}:{id:string;organizer:boolean;participant:boolean}) {
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 async function download(role:"organizer"|"participant") {
  setBusy(true);setError("");setMessage("");
  try {
   const response=await fetch(`/events/${id}/recovery`,{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({role})});
   if(!response.ok){const body=await response.json();throw new Error(body.error);}
   const url=URL.createObjectURL(await response.blob());
   const link=document.createElement("a");link.href=url;link.download=`bracket-${id}-${role}-recovery.txt`;
   document.body.appendChild(link);link.click();link.remove();
   // Let the browser consume the download before discarding the temporary blob.
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   setMessage("Download requested. Check your downloads and store the file privately before leaving this device.");
  }catch(e){setError(e instanceof Error?e.message:"Recovery file unavailable. Try again.");}finally{setBusy(false);}
 }
 if(!organizer&&!participant)return null;
 return <Card className="mb-8"><h2 className="font-display text-xl">Save your recovery access</h2>
 <p className="mt-2 text-sm text-secondary">This browser remembers you for up to 30 days. Before clearing cookies or switching devices, download your own recovery file and keep it in a password manager. Anyone with the file can use your access. It is not an invitation.</p>
 <div className="mt-4 flex flex-wrap gap-3">{participant&&<Button variant="secondary" disabled={busy} onClick={()=>download("participant")}>Download my participant recovery file</Button>}{organizer&&<Button variant="secondary" disabled={busy} onClick={()=>download("organizer")}>Download my organizer recovery file</Button>}</div>
 <p className="mt-3 text-xs text-secondary">Each role has its own file. Restore from “Recover an existing session” on the league page; your saved picks stay with the same participant. Without a saved credential or a still-signed-in device, this page cannot restore access. Revoked credentials cannot be restored.</p>
 {message&&<p role="status" className="mt-3 text-sm text-correct">{message}</p>}{error&&<p role="alert" className="mt-3 text-sm text-wrong">{error}</p>}</Card>;
}
