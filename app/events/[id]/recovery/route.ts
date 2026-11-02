import { NextRequest, NextResponse } from "next/server";
import { applicationClient, verifyApplicationCredential } from "@/lib/events/application";
import { credentialCookie, eventId, ownRecoveryExportInput } from "@/lib/events/application-contract";
import { applicationBody, applicationError, privateHeaders } from "@/lib/events/application-http";

/** Explicit own-secret handoff only; never included in room DTOs or page rendering. */
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}) {
 try {
  const id=eventId.parse((await context.params).id);
  const {role}=ownRecoveryExportInput.parse(await applicationBody(request));
  const token=request.cookies.get(credentialCookie(id,role))?.value;
  const own=await verifyApplicationCredential(applicationClient(),id,role,token);
  // applicationBody already validated Origin against the actual request host.
  const browserOrigin=request.headers.get("origin")!;
  const content=["bracket.fyi — private recovery credential", "",
   "Keep this file private. Anyone with this credential can act as you in this league.",
   "Save it in a password manager. Do not share it as an invitation.",
   "League: "+browserOrigin+"/events/"+id,
   "Role: "+role, "Credential: "+own.credential, "",
   "To restore: open the league, choose Recover an existing session, select the role, and paste the credential.",
   "Recovery restores the same identity and saved picks; it does not create another entry.",
   "A rotated or revoked credential will no longer work.", ""].join("\n");
  return new NextResponse(content,{headers:{...privateHeaders,
   "Content-Type":"text/plain; charset=utf-8",
   "Content-Disposition":`attachment; filename="bracket-${id}-${role}-recovery.txt"`,
   "X-Content-Type-Options":"nosniff"}});
 }catch(error){return applicationError(error);}
}
