# STRUCTURAL-QUALIFIERS reviewed synthetic handoff
project: BRACKET-FYI
done when:
  - [x] NCAA actual Opening Round winners resolve scored pairings idempotently before cutoff.
  - [x] NBA reviewed actual Play-In qualifiers fill seeds; postlock corrections hold without transfer.
  - [x] Focused application tests pass; SQL tests executable on parent-owned disposable database.
evidence: structural-qualifiers-report.md; tests/events/structural-qualifiers*.test.ts
