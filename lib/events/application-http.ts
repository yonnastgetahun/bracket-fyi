import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { EventCommandError } from "./repository";
export const privateHeaders={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"};
export async function applicationBody(request:NextRequest):Promise<unknown> {
 const expectedOrigin=request.nextUrl.protocol+"//"+(request.headers.get("host")??request.nextUrl.host);
 if(request.headers.get("origin")!==expectedOrigin || request.headers.get("sec-fetch-site")==="cross-site") throw new EventCommandError("unauthorized");
 if(!request.headers.get("content-type")?.startsWith("application/json")) throw new EventCommandError("invalid");
 const reader=request.body?.getReader();if(!reader) throw new EventCommandError("invalid");
 const parts:Uint8Array[]=[];let length=0;
 for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>65536){await reader.cancel();throw new EventCommandError("invalid");}parts.push(value);}
 try{return JSON.parse(Buffer.concat(parts).toString("utf8"));}catch{throw new EventCommandError("invalid");}
}
export function applicationError(error:unknown) {
 const code=error instanceof EventCommandError?error.code:error instanceof ZodError?"invalid":"unavailable";
 return NextResponse.json({error:code==="invalid"?"Check the fields and eligible choices.":code==="unauthorized"?"This session is not authorized.":code==="conflict"?"The event changed or this window is not ready. Refresh before retrying.":"Event temporarily unavailable."},
  {status:code==="invalid"?400:code==="unauthorized"?403:code==="conflict"?409:503,headers:privateHeaders});
}
