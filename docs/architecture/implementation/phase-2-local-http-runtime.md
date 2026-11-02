# Phase 2 local HTTP runtime

## Acceptance criteria (before implementation)
- [ ] New disposable database through 00008; existing DB never restarted/reset.
- [ ] Real PostgREST uses non-owner authenticator and existing application grants.
- [ ] Loopback Next :3137 uses preview=1 and transport=fake; no hosted env reads/changes.
- [ ] Guarded reproducible launcher and HTTP integration outcome recorded.

Evidence: launcher health probes, role checks, RUN_EVENT_APPLICATION_HTTP=1 harness.

## Local architecture / guardrails
- Shared Supabase DB container is never stopped/restarted/reset. Each start creates a fresh template0 database and unique NOINHERIT, NOSUPERUSER, NOBYPASSRLS authenticator.
- Platform bootstrap matches existing disposable SQL harnesses; migrations define application permissions. HTTP connects as authenticator, then switches to anon/authenticated/service_role per signed JWT; never postgres/owner.
- Cached PostgREST v14.5 only; no pulls. Loopback direct REST :54332; loopback /rest/v1 proxy :54331; Next :3137.
- Next working directory is tmp/local-event-http/app, with live source symlinks and separate .next. No .env file is copied/read; child environment uses an allowlist plus generated local credentials, preview=1 and transport=fake.
- JWT lifetime 24 hours; state directory 0700, credential files 0600, ignored by Git. Do not print credentials or Docker environment.
- Existing state and occupied ports fail closed. No automatic cleanup/destructive reset or hosted fallback.
- Missing service diagnosis: Supabase's existing-DB shortcut returned success without PostgREST/Kong; the DB alone cannot serve application HTTP.

## Commands
Start once from any directory (wrapper resets cwd):
~~~sh
/Users/yonnasgetahun/clawd/bin/exec -- 'python3 /Users/yonnasgetahun/bracket-fyi/scripts/local-event-runtime.py start'
~~~
Status without secrets:
~~~sh
/Users/yonnasgetahun/clawd/bin/exec -- 'python3 /Users/yonnasgetahun/bracket-fyi/scripts/local-event-runtime.py status'
~~~
HTTP harness:
~~~sh
/Users/yonnasgetahun/clawd/bin/exec -- 'cd /Users/yonnasgetahun/bracket-fyi && RUN_EVENT_APPLICATION_HTTP=1 npm test -- tests/events/application-http.test.ts'
~~~
Use explicit --through YYYYMMDDHHMMSS for a fresh run after later migrations arrive. Existing runtimes must not be silently re-provisioned. The helper's serve command resumes an existing runtime only when its ports are free and local JWTs remain valid.

## Provisioning notes
First attempt failed in Docker database creation while concurrent workers were active. Direct retry created empty disposable bracket_http_bf900b3242a4; retained unused, with failed-first-state.json. Shared DB stayed running/healthy, restartcount=1. A fresh run follows; no existing DB was modified.
