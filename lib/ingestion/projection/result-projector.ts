import type {
  ResultProjectionCommand,
  ResultProjectionOutcome,
  ResultRepository,
} from "@/lib/ingestion/projection/result-repository";

export type { ResultProjectionCommand, ResultProjectionOutcome, ResultRepository } from "@/lib/ingestion/projection/result-repository";

export function projectProviderResult(
  command: ResultProjectionCommand,
  repository: ResultRepository,
): Promise<ResultProjectionOutcome> {
  if (!command.observationId.trim()) throw new Error("Result projection requires an observation ID");
  return repository.project(command);
}
