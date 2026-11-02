import type {
  StructuralProjectionCommand,
  StructuralProjectionOutcome,
  StructuralRepository,
} from "@/lib/ingestion/projection/structural-repository";

export type { StructuralProjectionCommand, StructuralProjectionOutcome, StructuralRepository } from "@/lib/ingestion/projection/structural-repository";

export function projectStructuralObservation(
  command: StructuralProjectionCommand,
  repository: StructuralRepository,
): Promise<StructuralProjectionOutcome> {
  if (!command.observationId.trim()) throw new Error("Structural projection requires an observation ID");
  return repository.projectObservation(command);
}
