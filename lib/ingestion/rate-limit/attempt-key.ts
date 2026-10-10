import { z } from "zod";

export type AttemptKeyInput = Readonly<{
  runId: string;
  retryIndex: number;
  pageKey: string;
}>;

export class AttemptKeyValidationError extends Error {
  constructor() {
    super("Invalid attempt key input");
    this.name = "AttemptKeyValidationError";
  }
}

const canonicalRunIdSchema = z
  .uuid()
  .refine((value) => value === value.toLowerCase());

const attemptKeyInputSchema = z.object({
  runId: canonicalRunIdSchema,
  retryIndex: z.number().int().safe().min(0).max(3),
  pageKey: z.string().regex(/^[0-9a-f]{64}$/),
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

export function createAttemptKey(input: unknown): string {
  try {
    if (!isPlainObject(input)) throw new AttemptKeyValidationError();
    const parsed = attemptKeyInputSchema.safeParse(input);
    if (!parsed.success) throw new AttemptKeyValidationError();
    return `v1:request:${parsed.data.runId}:${parsed.data.retryIndex}:${parsed.data.pageKey}`;
  } catch (error) {
    if (error instanceof AttemptKeyValidationError) throw error;
    throw new AttemptKeyValidationError();
  }
}
