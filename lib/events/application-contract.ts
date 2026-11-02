import { z } from "zod";
export const eventId=z.string().uuid();
const key=z.string().min(1).max(240);
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const outcome=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("unresolved")}).strict(),z.object({kind:z.literal("draw")}).strict(),
 z.object({kind:z.literal("no-contest")}).strict(),z.object({kind:z.literal("winner"),entrant:key}).strict(),
 z.object({kind:z.literal("winner-set"),entrants:z.array(key).min(1).max(100)}).strict(),
]);
export const createApplicationInput=z.object({
 templateKey:z.string().min(1).max(80),name:z.string().trim().min(1).max(60),
 startsAt:z.string().datetime({offset:true}),timeZone:z.string().min(1).max(80),
 categories:z.array(z.string().trim().min(1).max(80)).min(1).max(30).optional(),
 syntheticAcknowledged:z.literal(true),
}).strict();
const commandBase={marketId:key,reason:z.string().trim().min(1).max(500),
 expectedEffectiveToken:hash,expectedCanonicalToken:hash.optional(),idempotencyKey:z.string().min(1).max(200)};
export const lifecycleCommandInput=z.discriminatedUnion("action",[
 z.object({...commandBase,action:z.literal("override"),payload:z.object({outcome,expiresAt:z.string().datetime({offset:true}).nullable().optional()}).strict()}).strict(),
 z.object({...commandBase,action:z.literal("release"),expectedCanonicalToken:hash,payload:z.object({}).strict()}).strict(),
 z.object({...commandBase,action:z.literal("hold"),payload:z.object({held:z.boolean()}).strict()}).strict(),
 z.object({...commandBase,action:z.literal("disposition"),payload:z.object({excluded:z.boolean()}).strict()}).strict(),
]);
export const applicationCommand=z.discriminatedUnion("action",[
 z.object({action:z.literal("join"),invitation:eventId,displayName:z.string().trim().min(1).max(80)}).strict(),
 z.object({action:z.literal("recover"),role:z.enum(["organizer","participant"]),credential:eventId}).strict(),
 z.object({action:z.literal("submit"),windowId:key,version:z.number().int().positive().max(2147483647),picks:z.record(key,key)}).strict(),
 z.object({action:z.literal("pairings"),windowId:key,version:z.number().int().positive(),configurationVersion:z.number().int().positive(),basisToken:hash,pairings:z.record(key,z.tuple([key,key])),reason:z.string().trim().min(1).max(500),syntheticAcknowledged:z.literal(true)}).strict(),
 z.object({action:z.literal("qualifiers"),configurationVersion:z.number().int().positive(),basisToken:hash,
  idempotencyKey:z.string().min(1).max(200),reason:z.string().trim().min(1).max(500),
  sourceLeagueId:eventId.optional(),sourceOrganizerToken:eventId.optional(),syntheticAcknowledged:z.literal(true)}).strict(),
 z.object({action:z.literal("consent"),role:z.enum(["organizer","participant"]),enabled:z.boolean(),kinds:z.array(z.enum(["lock_reminder","contest_live","result_final","score_change","schedule_change","result_correction","provider_stale","league_complete","broadcast"])).max(9),fakeAcknowledged:z.literal(true)}).strict(),
 z.object({action:z.literal("broadcast"),message:z.string().trim().min(1).max(500),idempotencyKey:key,fakeAcknowledged:z.literal(true)}).strict(),
 z.object({action:z.literal("freeze"),frozen:z.boolean()}).strict(),
 z.object({action:z.literal("window"),windowId:key,version:z.number().int().positive(),operation:z.enum(["open","lock"]),cutoff:z.string().datetime({offset:true}).optional()}).strict(),
 z.object({action:z.literal("result"),command:lifecycleCommandInput}).strict(),
]);
/** Separate handoff service contract; no browser-supplied entrants, graph or point transfer. */
export const structuralQualifierReviewInput=z.object({
 configurationVersion:z.number().int().positive().max(2147483647),basisToken:hash,
 idempotencyKey:z.string().min(1).max(200),reason:z.string().trim().min(1).max(500),
 sourceLeagueId:eventId.optional(),sourceOrganizerToken:eventId.optional(),sourceBasisToken:hash.optional(),
 syntheticAcknowledged:z.literal(true),
}).strict().superRefine((v,ctx)=>{
 if(Boolean(v.sourceLeagueId)!==Boolean(v.sourceOrganizerToken) || (v.sourceBasisToken!==undefined && !v.sourceLeagueId))
  ctx.addIssue({code:"custom",message:"Complete authenticated source required"});
});
export const credentialCookie=(id:string,role:"organizer"|"participant")=>`event_${role}_${eventId.parse(id)}`;
export const credentialOptions=(id:string)=>({httpOnly:true,sameSite:"strict" as const,secure:process.env.NODE_ENV==="production",path:`/events/${eventId.parse(id)}`,maxAge:60*60*24*30});

// Export accepts only a role: identity always comes from the scoped HttpOnly cookie.
export const ownRecoveryExportInput=z.object({role:z.enum(["organizer","participant"])}).strict();
