# HTTP business conflict retry diagnosis — 2026-10-28
project: BRACKET-FYI
done when:
- [ ] Stale result, locked submit, and other business conflicts promptly return HTTP409 without automatic database replay.
- [ ] Existing authorization, atomic rollback, stale-token and history-preservation semantics remain verified.
- [ ] Additive migration/forward repair and focused SQL/HTTP regressions pass with independent review.
evidence: minimal error oracle; actual nine-template HTTP test; final SQL and transition suite.

## Observed reproduction
Existing PostgREST14.5 on isolated loopback preview, non-owner authenticator, pool2, memory512MiB, GHCRTS -N1 -M256m.
- Direct SQL same stale mutate_event_lifecycle request rejects in0.285s with "effective result changed".
- REST same request times out10s. pg_stat_activity shows repeated short transactions on one prior request backend, another waiting on that backend transaction.
- Minimal service-only bracket_error_oracle(p_code) on disposable bracket_http_3ff79a5ca427 does nothing except RAISE using supplied SQLSTATE:
  - PT409 returns HTTP409 / codePT409 in0.010s.
  - 40001 times out4.001s.
- Restarted ONLY owned bracket-http-rest-3ff79a5ca427-bounded before/after oracle to clear the stuck request. Shared DB unchanged; unrelated containers untouched.
- Diagnostic scripts /tmp/bracket-http-layer-probe.py and /tmp/bracket-http-error-oracle.py load local preview credential file in memory, never print bearer values.
- Source evidence: PostgREST v14.5 src/PostgREST/MainTx.hs selects Hasql.Transaction.Sessions.transaction; app has explicit business RAISE SQLSTATE40001 throughout event window/lifecycle/notification/operator functions.
- Root defect supported: retryable serialization SQLSTATE used for non-retryable business conflicts. OOM was observed on the original container but is not independently proven caused solely by the retry loop.
- Independent design reviewer0afc1429 active. No schema/business-guard change yet; no timeout workaround claimed as repair.
