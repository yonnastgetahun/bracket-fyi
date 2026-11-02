import { z } from "zod";

export class OperatorError extends Error {
 readonly code: "invalid" | "configuration" | "unavailable";
 constructor(code: "invalid" | "configuration" | "unavailable") {
  super(code === "invalid" ? "Invalid operator command" : code === "configuration" ? "Invalid local operator configuration" : "Operator command failed; inspect local audit state before retrying");
  this.code = code;
 }
}
const common = { expectedVersion: z.number().int().nonnegative().safe(), reason: z.string().trim().min(1).max(500) };
const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(2000);
const event = { ...common, eventId: uuid };
const bindingId = uuid;
const commandSchema = z.discriminatedUnion("action", [
 z.object({ ...common, action: z.literal("notification.control"), eventId: z.null(), payload: z.object({ enabled: z.boolean() }).strict() }).strict(),
 z.object({ ...common, action: z.literal("global.stop"), eventId: z.null(), payload: z.object({ stopped: z.boolean() }).strict() }).strict(),
 z.object({ ...event, action: z.literal("binding.mode"), payload: z.object({ bindingId, mode: z.enum(["disabled", "shadow", "write"]), fetchEnabled: z.boolean() }).strict() }).strict(),
 z.object({ ...event, action: z.literal("health.read"), payload: z.object({ bindingId }).strict() }).strict(),
 z.object({ ...event, action: z.literal("mapping.review"), payload: z.object({
  bindingId, entityKind: z.enum(["organization", "competition", "event_edition", "competitor", "event_entry", "stage", "round", "contest", "bracket"]),
  externalId: text, canonicalId: uuid.nullable(), status: z.enum(["reviewed", "rejected"]),
 }).strict() }).strict(),
 z.object({ ...event, action: z.literal("result.record"), payload: z.object({
  contestId: uuid, status: z.enum(["final", "void", "pending"]), outcome: z.enum(["winner", "draw", "winner-set", "no-contest", "pending"]),
  winnerEntryId: uuid.nullable(), winningNominationIds: z.array(uuid).max(1000),
 }).strict() }).strict(),
 // Reviewed source artifact only; this command never materializes a template.
 z.object({ ...event, action: z.literal("manifest.review"), payload: z.object({
  manifestKey: z.string().regex(/^[a-z0-9._-]{1,100}$/), manifest: z.record(z.string(), z.json()),
 }).strict() }).strict(),
 z.object({ ...event, action: z.literal("replay.project"), payload: z.object({
  bindingId, observationId: uuid, kind: z.enum(["structural", "result"]),
 }).strict() }).strict(),
]);
export type OperatorCommand = z.infer<typeof commandSchema>;
export function parseOperatorCommand(value: unknown): OperatorCommand {
 const parsed = commandSchema.safeParse(value);
 if (!parsed.success) throw new OperatorError("invalid");
 return parsed.data;
}
