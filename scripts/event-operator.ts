#!/usr/bin/env -S node --experimental-strip-types
/** Local-only server CLI: node --experimental-strip-types scripts/event-operator.ts command.json
 * Inject BRACKET_OPERATOR_CREDENTIAL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)
 * through the server environment, never command arguments. No dotenv loading or hosted override.
 * expectedVersion means global control / binding / latest result / manifest revision, by action.
 */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
// @ts-expect-error Explicit extensions are required by Node's native TypeScript loader.
import { OperatorError, parseOperatorCommand } from "../lib/events/operator.ts";
// @ts-expect-error Explicit extensions are required by Node's native TypeScript loader.
import { createOperatorRepository } from "../lib/events/operator-repository.ts";
import type { EventRpcClient } from "../lib/events/repository";

export interface OperatorCliDependencies {
 readFile(path: string): Promise<string>;
 createClient(url: string, infrastructureKey: string): EventRpcClient;
 stdout(text: string): void;
 stderr(text: string): void;
}
function localUrl(value: string): string {
 // Check the raw spelling too: URL normalizes alternate IP encodings to loopback.
 if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?\/?$/.test(value)) throw new OperatorError("configuration");
 try { return new URL(value).origin; } catch { throw new OperatorError("configuration"); }
}
const defaults: OperatorCliDependencies = {
 readFile: path => readFile(path, "utf8"),
 createClient: (url, key) => ({
  async rpc(name, args) {
   const response = await fetch(url + "/rest/v1/rpc/" + name, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
    headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify(args),
   });
   // Never read/log an error response body; RPC errors may reflect credentials.
   if (!response.ok) return { data: null, error: { message: "Operator RPC failed" } };
   return { data: await response.json(), error: null };
  },
 }),
 stdout: text => { process.stdout.write(text); },
 stderr: text => { process.stderr.write(text); },
};
export async function runOperatorCli(
 argv: readonly string[], env: Readonly<Record<string, string | undefined>>, deps: OperatorCliDependencies = defaults,
): Promise<number> {
 try {
  const path = argv[0];
  if (argv.length !== 1 || !path || path.trim() !== path || path.startsWith("-") ||
   /[\x00-\x1f\x7f{}\[\]]/.test(path) || path.includes("://")) throw new OperatorError("invalid");
  const credential = env.BRACKET_OPERATOR_CREDENTIAL;
  const infrastructureKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!credential?.trim() || !infrastructureKey?.trim()) throw new OperatorError("configuration");
  const url = localUrl(env.SUPABASE_URL ?? "http://127.0.0.1:54321");
  const source = await deps.readFile(path);
  if (Buffer.byteLength(source, "utf8") > 1_048_576) throw new OperatorError("invalid");
  const command = parseOperatorCommand(JSON.parse(source));
  const result = await createOperatorRepository(deps.createClient(url, infrastructureKey)).execute(credential, command);
  const output = JSON.stringify(result);
  if ([credential, infrastructureKey].some(secret => output.includes(JSON.stringify(secret).slice(1, -1)))) throw new OperatorError("unavailable");
  deps.stdout(output + "\n");
  return 0;
 } catch {
  // Do not echo argv, env, input, validation details, exceptions or remote bodies.
  deps.stderr("Operator command failed; verify local configuration/input and inspect audit state before retrying.\n");
  return 1;
 }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 process.exitCode = await runOperatorCli(process.argv.slice(2), process.env);
}
