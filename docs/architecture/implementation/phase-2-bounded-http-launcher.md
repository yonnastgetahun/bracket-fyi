# Bounded HTTP launcher — implementation evidence

## Criteria recorded before implementation
- [x] `--database-container` accepts the unchanged shared default and the explicitly owned P11 container only.
- [x] Every database command and generated PostgREST connection targets the selected container.
- [x] New databases remain unique `bracket_http_<12 hex>` databases; arbitrary existing databases are rejected.
- [x] Owned-container PostgREST uses a uniquely labeled private bridge containing only the owned DB and PostgREST; published service ports remain loopback-only.
- [x] Invalid targets fail before subprocess execution and notification transport remains fake.

Evidence: `scripts/local-event-http.py`; `scripts/test-local-event-http.py`.

The isolated P11 database began in `network=none`. Docker container-network
mode would give PostgREST PostgreSQL loopback access but discards `-p`
publication, so the launcher now creates the uniquely labeled private bridge
`bracket-p11-http-9bd170c85c0f` and connects only the owned database to it.
PostgREST joins that bridge, resolves the database by its owned container name,
and still publishes only `127.0.0.1:54332`. Existing networks with unexpected
labels or containers fail closed; the shared Supabase network is unchanged.

## Supported resume commands

Shared compatibility target:

```sh
/Users/yonnasgetahun/clawd/bin/exec -- 'python3 /Users/yonnasgetahun/bracket-fyi/scripts/local-event-runtime.py start'
```

Explicit owned P11 target:

```sh
/Users/yonnasgetahun/clawd/bin/exec -- 'python3 /Users/yonnasgetahun/bracket-fyi/scripts/local-event-runtime.py start --database-container bracket-p11-db-9bd170c85c0f --through 20261027000013'
```

The P11 target is now runnable through the bounded bridge. A prior runtime in
`tmp/local-event-http` is historical state; archive it privately before a fresh
start rather than silently replacing it.

Status/resume remains:

```sh
/Users/yonnasgetahun/clawd/bin/exec -- 'python3 /Users/yonnasgetahun/bracket-fyi/scripts/local-event-runtime.py status'
```

## Verification evidence — 2026-10-30

- Launcher routing tests: `7/7` passed.
- Fresh owned runtime: database `bracket_http_439610679a15`, container
  `bracket-http-rest-439610679a15`, migration pin `20261027000013`, role
  check `false:false:false`; PostgREST and Next are loopback-published at
  `54332` and `3137`.
- `RUN_EVENT_APPLICATION_HTTP=1 npm test -- tests/events/application-http.test.ts`:
  `1` file and `2` tests passed.
- `node scripts/verify-event-browser.mjs`: the harness reached the first
  journey but stopped before its first check because the existing accessibility
  helper sends Puppeteer `Control+Home`, which Puppeteer 24 rejects as
  `Unknown key: "Control+Home"`. This is a harness compatibility failure, not
  a runtime/network failure; after the helper changes that keypress to separate
  `Control`/`Home` presses, rerun the command serially against the status
  runtime above.
