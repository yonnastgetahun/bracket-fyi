import { describe, expect, it } from "vitest";
import { parseOperatorCommand } from "../../lib/events/operator";

describe("operator input", () => {
 it("accepts an explicit versioned global stop without caller identity", () => {
  const command = { action: "global.stop", eventId: null, expectedVersion: 0, reason: "incident", payload: { stopped: true } };
  expect(parseOperatorCommand(command)).toEqual(command);
  expect(() => parseOperatorCommand({ ...command, actor: "admin" })).toThrow("Invalid operator command");
 });
});

const id = "00000000-0000-4000-8000-000000000001";
const base = { eventId: id, expectedVersion: 0, reason: "review" };
const commands = [
 { ...base, action: "binding.mode", payload: { bindingId: id, mode: "shadow", fetchEnabled: false } },
 { ...base, action: "health.read", payload: { bindingId: id } },
 { ...base, action: "mapping.review", payload: { bindingId: id, entityKind: "contest", externalId: "upstream", canonicalId: id, status: "reviewed" } },
 { ...base, action: "result.record", payload: { contestId: id, status: "final", outcome: "winner", winnerEntryId: id, winningNominationIds: [] } },
 { ...base, action: "manifest.review", payload: { manifestKey: "reviewed-source", manifest: { nested: [1, true, null] } } },
 { ...base, action: "replay.project", payload: { bindingId: id, observationId: id, kind: "structural" } },
];
describe("action contracts", () => {
 it.each(commands)("accepts $action and rejects unknown payload authority", command => {
  expect(parseOperatorCommand(command)).toEqual(command);
  expect(() => parseOperatorCommand({ ...command, payload: { ...command.payload, actor: "admin" } })).toThrow("Invalid operator command");
 });
 it.each([
  { ...base, action: "health.read", payload: { bindingId: id }, eventId: null },
  { ...base, action: "global.stop", payload: { stopped: true } },
  { ...commands[0], expectedVersion: -1 }, { ...commands[0], expectedVersion: 1.5 },
  { ...commands[0], expectedVersion: Number.MAX_SAFE_INTEGER + 1 },
  { ...commands[0], reason: " " }, { ...commands[0], environment: "production" },
  { ...commands[0], payload: { bindingId: "x", mode: "shadow", fetchEnabled: false } },
  { ...commands[0], payload: { bindingId: id, mode: "shadow", fetchEnabled: "false" } },
  { ...commands[2], payload: { ...commands[2].payload, entityKind: "unknown" } },
  { ...commands[4], payload: { manifestKey: "x", manifest: [] } },
  { ...commands[5], payload: { ...commands[5].payload, kind: "execute" } },
 ])("rejects malformed commands", command => {
  expect(() => parseOperatorCommand(command)).toThrow("Invalid operator command");
 });
});

import { createOperatorRepository } from "../../lib/events/operator-repository";
import { vi } from "vitest";
describe("credential-scoped RPC boundary", () => {
 it("forwards exact local RPC arguments, not an actor or infrastructure authority", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
  const command = parseOperatorCommand(commands[0]);
  expect(await createOperatorRepository({ rpc }).execute("opaque-secret", command)).toEqual({ ok: true });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("event_operator_command", {
   p_credential: "opaque-secret", p_environment: "local", p_event_id: id,
   p_action: "binding.mode", p_expected_version: 0, p_reason: "review", p_payload: command.payload,
  });
 });
 it.each([
  { data: null, error: { message: "opaque-secret", code: "opaque-secret" } },
  { data: ["opaque-secret"], error: null },
  { data: "opaque-secret", error: null },
  { data: null, error: null },
  { data: { leaked: "opaque-secret" }, error: null },
 ])("sanitizes errors and malformed or credential-reflecting responses", async response => {
  const rpc = vi.fn().mockResolvedValue(response);
  await expect(createOperatorRepository({ rpc }).execute("opaque-secret", commands[0])).rejects.toThrow("Operator command failed");
 });
 it("sanitizes transport exceptions and never dispatches invalid input or missing credential", async () => {
  const rpc = vi.fn().mockRejectedValue(new Error("opaque-secret"));
  await expect(createOperatorRepository({ rpc }).execute("opaque-secret", commands[0])).rejects.toThrow("Operator command failed");
  rpc.mockClear();
  await expect(createOperatorRepository({ rpc }).execute("", commands[0])).rejects.toThrow();
  await expect(createOperatorRepository({ rpc }).execute("opaque-secret", { ...commands[0], actor: "admin" })).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
 });
});

import { runOperatorCli } from "../../scripts/event-operator";
const env = { BRACKET_OPERATOR_CREDENTIAL: "opaque-secret", SUPABASE_SERVICE_ROLE_KEY: "infrastructure-secret" };
function harness(overrides: Record<string, unknown> = {}) {
 const readFile = vi.fn().mockResolvedValue(JSON.stringify(commands[0]));
 const rpc = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
 const createClient = vi.fn().mockReturnValue({ rpc });
 const stdout = vi.fn(), stderr = vi.fn();
 return { readFile, rpc, createClient, stdout, stderr, ...overrides };
}
describe("local file-only CLI", () => {
 it("reads exactly one file and uses env-only operator authority with a local default", async () => {
  const deps = harness();
  expect(await runOperatorCli(["command.json"], env, deps)).toBe(0);
  expect(deps.readFile).toHaveBeenCalledWith("command.json");
  expect(deps.createClient).toHaveBeenCalledWith("http://127.0.0.1:54321", "infrastructure-secret");
  expect(deps.stdout).toHaveBeenCalledWith('{"ok":true}\n');
  expect(deps.stderr).not.toHaveBeenCalled();
 });
 it.each([[], ["a", "b"], ["--credential=secret"], ["--allow-hosted"], ['{"action":"global.stop"}'], ["-"], ["https://host/file"], ["a\nsecret"]].map(argv => ({ argv })))("rejects non-path argv without reading or connecting", async ({ argv }) => {
  const deps = harness();
  expect(await runOperatorCli(argv, env, deps)).toBe(1);
  expect(deps.readFile).not.toHaveBeenCalled();
  expect(deps.createClient).not.toHaveBeenCalled();
 });
 it.each(["https://host.supabase.co", "http://localhost.evil", "http://127.1", "http://2130706433", "http://user@localhost", "http://localhost/path", "http://localhost?override=x", "http://[::1]", "ftp://localhost"])("rejects nonlocal/ambiguous target %s", async url => {
  const deps = harness();
  expect(await runOperatorCli(["command.json"], { ...env, SUPABASE_URL: url }, deps)).toBe(1);
  expect(deps.createClient).not.toHaveBeenCalled();
 });
 it.each(["http://localhost:54321", "http://127.0.0.1:54321/"])("accepts explicit local targets", async url => {
  expect(await runOperatorCli(["command.json"], { ...env, SUPABASE_URL: url }, harness())).toBe(0);
 });
 it("never uses a service role key as operator authority", async () => {
  const deps = harness();
  expect(await runOperatorCli(["command.json"], { SUPABASE_SERVICE_ROLE_KEY: "infrastructure-secret" }, deps)).toBe(1);
  expect(deps.createClient).not.toHaveBeenCalled();
 });
 it.each(["file", "json", "rpc", "factory", "reflected"])("never emits secrets on %s failure", async where => {
  const deps = harness();
  if (where === "file") deps.readFile.mockRejectedValue(new Error("opaque-secret infrastructure-secret"));
  if (where === "json") deps.readFile.mockResolvedValue('{"opaque-secret":');
  if (where === "rpc") deps.rpc.mockRejectedValue(new Error("opaque-secret infrastructure-secret"));
  if (where === "factory") deps.createClient.mockImplementation(() => { throw new Error("opaque-secret infrastructure-secret"); });
  if (where === "reflected") deps.rpc.mockResolvedValue({ data: { secret: "infrastructure-secret" }, error: null });
  expect(await runOperatorCli(["command.json"], env, deps)).toBe(1);
  expect(JSON.stringify([deps.stdout.mock.calls, deps.stderr.mock.calls])).not.toMatch(/opaque-secret|infrastructure-secret/);
 });
});

describe("untrusted RPC JSON", () => {
 it.each([{ count: NaN }, { count: Infinity }, { value: undefined }, { nested: { callable: () => "secret" } }])("rejects non-JSON values instead of silently rewriting them", async data => {
  const rpc = vi.fn().mockResolvedValue({ data, error: null });
  await expect(createOperatorRepository({ rpc }).execute("opaque-secret", commands[0])).rejects.toThrow("Operator command failed");
 });
});

it("supports notification control through the scoped gateway, not a service-only toggle",()=>{
 const command={action:"notification.control",eventId:null,expectedVersion:2,reason:"Synthetic test",payload:{enabled:false}};
 expect(parseOperatorCommand(command)).toEqual(command);
 expect(()=>parseOperatorCommand({...command,eventId:id})).toThrow("Invalid operator command");
});
