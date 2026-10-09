import type { NormalizedResult } from "@/lib/ingestion/contracts";
import type {
  ContestLifecycleOrderingInput,
  ContestLifecycleStatus,
  OrderingInput,
  OrderingOutcome,
  ResultOrderingState,
} from "@/lib/ingestion/ordering/types";

export type {
  ContestLifecycleOrderingInput,
  ContestLifecycleStatus,
  OrderingInput,
  OrderingOutcome,
  ResultOrderingState,
} from "@/lib/ingestion/ordering/types";

const terminalResultStatuses = new Set<NormalizedResult["resultStatus"]>([
  "final",
  "awarded",
  "canceled",
  "void",
]);

const resultStatusIsTerminal = (status: NormalizedResult["resultStatus"]): boolean =>
  terminalResultStatuses.has(status);

const trustedTimestamp = (state: ResultOrderingState): number | undefined => {
  const value = state.providerEffectiveAt ?? state.providerUpdatedAt;
  return value ? Date.parse(value) : undefined;
};

const observedTimestamp = (state: ResultOrderingState): number => Date.parse(state.observedAt);

const outcome = (
  decision: OrderingOutcome["decision"],
  reason: string,
  correctionReasonRequired = false,
): OrderingOutcome => ({ decision, reason, correctionReasonRequired });

export function compareResultOrdering(input: OrderingInput): OrderingOutcome {
  if (!input.current) return outcome("project", "No prior result exists");
  if (input.current.semanticKey === input.incoming.semanticKey) {
    return outcome("no_op_duplicate", "Incoming result has the accepted semantic key");
  }

  const currentTrusted = trustedTimestamp(input.current);
  const incomingTrusted = trustedTimestamp(input.incoming);
  if (currentTrusted !== undefined && incomingTrusted !== undefined) {
    if (incomingTrusted < currentTrusted) return outcome("ignore_older", "Incoming trusted timestamp is older");
    if (incomingTrusted === currentTrusted) {
      return outcome(
        resultStatusIsTerminal(input.current.normalizedResult.resultStatus)
          || resultStatusIsTerminal(input.incoming.normalizedResult.resultStatus)
          ? "quarantine_terminal_conflict"
          : "quarantine_stale",
        "Equal trusted timestamps have changed semantics",
        resultStatusIsTerminal(input.current.normalizedResult.resultStatus),
      );
    }
  }

  const currentTerminal = resultStatusIsTerminal(input.current.normalizedResult.resultStatus);
  const incomingTerminal = resultStatusIsTerminal(input.incoming.normalizedResult.resultStatus);
  if (currentTerminal && !incomingTerminal) {
    return outcome("quarantine_regression", "A terminal result cannot regress to a non-terminal result");
  }

  if (currentTerminal && !incomingTrusted) {
    return outcome("quarantine_terminal_conflict", "A missing trusted timestamp cannot replace a terminal result", true);
  }

  if (currentTerminal && incomingTerminal) {
    const correctionReason = input.incoming.normalizedResult.correctionReason;
    if (!input.explicitCorrection || !correctionReason) {
      return outcome("quarantine_terminal_conflict", "Changed terminal result requires an explicit correction", true);
    }
    return outcome("project", "Newer explicit terminal correction is accepted");
  }

  if (currentTrusted !== undefined && incomingTrusted === undefined && observedTimestamp(input.incoming) <= observedTimestamp(input.current)) {
    return outcome("quarantine_stale", "Missing trusted timestamp is not newer by observation time");
  }
  if (currentTrusted === undefined && incomingTrusted === undefined && observedTimestamp(input.incoming) < observedTimestamp(input.current)) {
    return outcome("ignore_older", "Incoming observed time is older");
  }

  return outcome("project", "Incoming non-terminal result is newer or has no competing terminal state");
}

const lifecycleRank: Record<ContestLifecycleStatus, number> = {
  scheduled: 0,
  pregame: 1,
  postponed: 1,
  live: 2,
  suspended: 2,
  final: 3,
  canceled: 3,
  void: 3,
};

export function compareContestLifecycleOrdering(input: ContestLifecycleOrderingInput): OrderingOutcome {
  if (!input.current) return outcome("project", "No prior contest lifecycle exists");

  const currentTime = input.current.providerUpdatedAt
    ? Date.parse(input.current.providerUpdatedAt)
    : Date.parse(input.current.observedAt);
  const incomingTime = input.incoming.providerUpdatedAt
    ? Date.parse(input.incoming.providerUpdatedAt)
    : Date.parse(input.incoming.observedAt);

  if (incomingTime < currentTime) return outcome("ignore_older", "Incoming lifecycle timestamp is older");
  if (incomingTime === currentTime && input.incoming.status === input.current.status) {
    return outcome("no_op_duplicate", "Incoming lifecycle state is unchanged");
  }
  if (lifecycleRank[input.incoming.status] < lifecycleRank[input.current.status]) {
    return outcome("quarantine_regression", "Contest lifecycle status regressed");
  }
  if (incomingTime === currentTime) return outcome("quarantine_stale", "Equal lifecycle timestamps changed state");
  return outcome("project", "Contest lifecycle state advances with newer provenance");
}
