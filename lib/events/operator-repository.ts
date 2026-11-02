// Explicit extension supports the server CLI under Node's native TypeScript loader.
// @ts-expect-error Project bundler config does not enable allowImportingTsExtensions.
import { OperatorError, parseOperatorCommand } from "./operator.ts";
import { z } from "zod";
import type { EventRpcClient } from "./repository";

/** Server-only. The DB resolves actor/grants from the injected opaque credential.
 * An infrastructure key is transport configuration, never operator authority.
 * Never retry a failed mutation automatically: its commit may be uncertain.
 */
export function createOperatorRepository(client: EventRpcClient) {
 return {
  async execute(credential: string, input: unknown): Promise<Record<string, unknown>> {
   const command = parseOperatorCommand(input);
   if (typeof credential !== "string" || !credential.trim()) throw new OperatorError("configuration");
   try {
    const { data, error } = await client.rpc("event_operator_command", {
     p_credential: credential, p_environment: "local", p_event_id: command.eventId,
     p_action: command.action, p_expected_version: command.expectedVersion,
     p_reason: command.reason, p_payload: command.payload,
    });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) throw new OperatorError("unavailable");
    // Validate JSON and detach the result; reject credential reflection even on success.
    const parsed = z.record(z.string(), z.json()).safeParse(data);
    if (!parsed.success) throw new OperatorError("unavailable");
    const encoded = JSON.stringify(parsed.data);
    const credentialEncoding = JSON.stringify(credential).slice(1, -1);
    if (!encoded || encoded.includes(credentialEncoding)) throw new OperatorError("unavailable");
    const result: unknown = JSON.parse(encoded);
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new OperatorError("unavailable");
    return result as Record<string, unknown>;
   } catch {
    throw new OperatorError("unavailable");
   }
  },
 };
}
