import { z } from "zod";

import { isoDateTimeSchema } from "@/lib/ingestion/contracts";
import type { RateBudgetDecision } from "@/lib/ingestion/orchestrator/types";

export type ProviderBudgetReservationInput = Readonly<{
  runId: string;
  leaseToken: string;
  attemptKey: string;
  cost: number;
}>;

export type ProviderBudgetRpcError = Readonly<{
  code?: string;
  message?: string;
}>;

export type ProviderBudgetRpcClient = Readonly<{
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: ProviderBudgetRpcError | null;
  }>;
}>;

export type ProviderBudgetRepositoryErrorKind =
  | "invalid_input"
  | "invalid_budget"
  | "lease_lost"
  | "attempt_conflict"
  | "rpc";

export class ProviderBudgetRepositoryError extends Error {
  readonly kind: ProviderBudgetRepositoryErrorKind;
  readonly sqlState?: string;

  constructor(kind: ProviderBudgetRepositoryErrorKind, message: string, sqlState?: string) {
    super(message);
    this.name = "ProviderBudgetRepositoryError";
    this.kind = kind;
    this.sqlState = sqlState;
  }
}

const inputSchema = z.object({
  runId: z.uuid().refine((value) => value === value.toLowerCase()),
  leaseToken: z.string().min(1).max(1024),
  attemptKey: z.string().min(1).max(1024),
  cost: z.number().int().positive().safe(),
}).strict();

const responseSchema = z.object({
  outcome: z.enum(["reserved", "replayed", "exhausted", "configuration_missing"]),
  reservation_id: z.uuid().nullable(),
  remaining_count: z.number().int().nonnegative().safe().nullable(),
  retry_at: isoDateTimeSchema.nullable(),
}).strict();

const rpcEnvelopeSchema = z.object({
  data: z.unknown(),
  error: z.object({
    code: z.string().optional(),
    message: z.string().optional(),
  }).passthrough().nullable(),
}).strict();

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  try {
    if (typeof value !== "object" || value === null) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
};

const firstRow = (data: unknown): unknown => (Array.isArray(data) ? data[0] : data);

const invalidInput = () => new ProviderBudgetRepositoryError("invalid_input", "Invalid provider budget request");
const invalidBudget = () => new ProviderBudgetRepositoryError("invalid_budget", "Invalid provider budget response");

const mapRpcError = (error: ProviderBudgetRpcError): ProviderBudgetRepositoryError => {
  const message = typeof error.message === "string" ? error.message : "";
  if (error.code === "P0001" || message.includes("lease_lost")) {
    return new ProviderBudgetRepositoryError("lease_lost", "Provider budget lease lost", error.code);
  }
  if (error.code === "P0005" || message.includes("attempt_key_conflict")) {
    return new ProviderBudgetRepositoryError("attempt_conflict", "Provider budget attempt conflict", error.code);
  }
  return new ProviderBudgetRepositoryError("rpc", "Provider budget RPC failed", error.code);
};

const parseInput = (input: unknown): ProviderBudgetReservationInput => {
  try {
    if (!isPlainObject(input)) throw invalidInput();
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) throw invalidInput();
    return parsed.data;
  } catch (error) {
    if (error instanceof ProviderBudgetRepositoryError) throw error;
    throw invalidInput();
  }
};

const mapResponse = (input: ProviderBudgetReservationInput, data: unknown): RateBudgetDecision => {
  try {
    const parsed = responseSchema.safeParse(firstRow(data));
    if (!parsed.success) throw invalidBudget();
    const row = parsed.data;
    if (row.outcome === "configuration_missing") {
      if (row.reservation_id !== null || row.remaining_count !== null || row.retry_at !== null) throw invalidBudget();
      return { allowed: false, cost: input.cost, reason: "unknown_budget" };
    }
    if (row.outcome === "exhausted") {
      if (row.reservation_id !== null || row.remaining_count === null || row.retry_at === null) throw invalidBudget();
      return { allowed: false, cost: input.cost, reason: "exhausted", retryAt: new Date(Date.parse(row.retry_at)).toISOString() };
    }
    if (row.reservation_id === null || row.remaining_count === null || row.retry_at !== null) throw invalidBudget();
    return { allowed: true, cost: input.cost, reason: "available" };
  } catch (error) {
    if (error instanceof ProviderBudgetRepositoryError) throw error;
    throw invalidBudget();
  }
};

export function createProviderBudgetRepository(client: ProviderBudgetRpcClient) {
  return {
    async reserve(input: unknown): Promise<RateBudgetDecision> {
      const validated = parseInput(input);
      let response: Awaited<ReturnType<ProviderBudgetRpcClient["rpc"]>>;
      try {
        response = await client.rpc("reserve_provider_budget", {
          p_run_id: validated.runId,
          p_lease_token: validated.leaseToken,
          p_attempt_key: validated.attemptKey,
          p_cost: validated.cost,
        });
      } catch {
        throw new ProviderBudgetRepositoryError("rpc", "Provider budget RPC failed");
      }
      try {
        const parsed = rpcEnvelopeSchema.safeParse(response);
        if (!parsed.success) throw new ProviderBudgetRepositoryError("rpc", "Provider budget RPC failed");
        if (parsed.data.error) throw mapRpcError(parsed.data.error);
        return mapResponse(validated, parsed.data.data);
      } catch (error) {
        if (error instanceof ProviderBudgetRepositoryError) throw error;
        throw new ProviderBudgetRepositoryError("rpc", "Provider budget RPC failed");
      }
    },
  };
}

export type ProviderBudgetRepository = ReturnType<typeof createProviderBudgetRepository>;
