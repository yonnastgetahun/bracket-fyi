import { NextRequest, NextResponse } from "next/server";
import { applicationClient,createApplicationLeague } from "@/lib/events/application";
import { applicationBody,applicationError,privateHeaders } from "@/lib/events/application-http";
import { credentialCookie,credentialOptions } from "@/lib/events/application-contract";
export async function POST(request:NextRequest) {
 try {
  const body=await applicationBody(request);
  const result=await createApplicationLeague(applicationClient(),body);
  const response=NextResponse.json({id:result.id},{status:201,headers:privateHeaders});
  response.cookies.set(credentialCookie(result.id,"organizer"),result.organizerCredential,credentialOptions(result.id));
  return response;
 }catch(error){return applicationError(error);}
}
