#!/usr/bin/env python3
"""Local-only PostgREST and Next; disposable DB, no hosted env reads."""
import argparse, base64, hashlib, hmac, http.client, http.server, json, os
from pathlib import Path
import re, secrets, socket, subprocess, sys, threading, time, urllib.request, shutil

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / "tmp/local-event-http"
DEFAULT_DB_CONTAINER = "supabase_db_bracket-fyi"
OWNED_DB_CONTAINER = "bracket-p11-db-9bd170c85c0f"
OWNED_RUNTIME_NETWORK = "bracket-p11-http-9bd170c85c0f"
PIN = "20261027000008"

def run(argv, data=None):
    p = subprocess.run(argv, input=data, text=True, capture_output=True, timeout=180)
    if p.returncode:
        raise RuntimeError("Local command failed: " + argv[0] + " exit=" + str(p.returncode))
    return p.stdout.strip()

def validate_database_container(container):
    if container not in (DEFAULT_DB_CONTAINER, OWNED_DB_CONTAINER):
        raise ValueError("Unsupported database container; use the default or the explicitly owned P11 container")
    return container


def database_network(container):
    """Return PostgREST's DB host and Docker network specification."""
    validate_database_container(container)
    if container == OWNED_DB_CONTAINER:
        return container, ["--network", OWNED_RUNTIME_NETWORK]
    return container, ["--network", "supabase_network_bracket-fyi"]


def ensure_owned_runtime_network(container):
    """Create/connect only the uniquely owned bridge needed by P11 HTTP."""
    validate_database_container(container)
    if container != OWNED_DB_CONTAINER:
        return None
    try:
        inspected = json.loads(run(["docker", "network", "inspect", OWNED_RUNTIME_NETWORK]))
    except RuntimeError:
        run(["docker", "network", "create", "--driver", "bridge",
             "--label", "bracket.p11-owned=true", "--label", "bracket.local-http=true",
             OWNED_RUNTIME_NETWORK])
        inspected = json.loads(run(["docker", "network", "inspect", OWNED_RUNTIME_NETWORK]))
    network = inspected[0]
    labels = network.get("Labels") or {}
    if labels.get("bracket.p11-owned") != "true" or labels.get("bracket.local-http") != "true":
        raise RuntimeError("Owned P11 HTTP network has unexpected labels")
    containers = network.get("Containers") or {}
    unexpected = [item.get("Name") for item in containers.values()
                  if item.get("Name") not in (OWNED_DB_CONTAINER,)]
    if unexpected:
        raise RuntimeError("Owned P11 HTTP network contains unexpected containers")
    if OWNED_DB_CONTAINER not in {item.get("Name") for item in containers.values()}:
        run(["docker", "network", "connect", "--alias", OWNED_DB_CONTAINER,
             OWNED_RUNTIME_NETWORK, OWNED_DB_CONTAINER])
    return OWNED_RUNTIME_NETWORK


def sql(db, source, container=DEFAULT_DB_CONTAINER):
    validate_database_container(container)
    if not re.fullmatch(r"bracket_http_[a-f0-9]{12}", db):
        raise RuntimeError("Not an owned disposable database")
    return run(["docker", "exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", db,
                "-v", "ON_ERROR_STOP=1", "-Atq"], source)

def private(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")
    path.chmod(0o600)

def token(secret, role):
    def enc(x):
        return base64.urlsafe_b64encode(x).rstrip(b"=").decode()
    body = enc(b'{"alg":"HS256","typ":"JWT"}') + "." + enc(json.dumps(
        {"role": role, "iss": "bracket-local-http", "iat": int(time.time()),
         "exp": int(time.time()) + 86400}).encode())
    return body + "." + enc(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())

def start(through, database_container=DEFAULT_DB_CONTAINER):
    validate_database_container(database_container)
    ensure_owned_runtime_network(database_container)
    if not re.fullmatch(r"[0-9]{14}", through) or through < PIN:
        raise RuntimeError("Invalid migration pin")
    migrations = [p for p in sorted((ROOT / "supabase/migrations").glob("*.sql")) if p.name[:14] <= through]
    if not migrations or migrations[-1].name[:14] != through:
        raise RuntimeError("Exact migration pin missing")
    if (STATE / "state.json").exists():
        raise RuntimeError("Existing runtime state; use status/serve, never silently replace")
    for port in (3137, 54331, 54332):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", port))
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    STATE.chmod(0o700)
    suffix = secrets.token_hex(6)
    db, role = "bracket_http_" + suffix, "bracket_http_auth_" + suffix
    password, secret = secrets.token_hex(32), secrets.token_hex(32)
    state = {"database": db, "database_container": database_container,
             "authenticator": role, "container": "bracket-http-rest-" + suffix,
             "through": through, "api": "http://127.0.0.1:54331", "app": "http://127.0.0.1:3137",
             "created_at": int(time.time()), "migrations": []}
    private(STATE / "state.json", state)
    run(["docker", "exec", database_container, "createdb", "-U", "postgres", "--template=template0", db])
    sql(db, """create schema extensions;
create extension pgcrypto with schema extensions;
create extension pgtap with schema extensions;
create extension supabase_vault;
grant usage on schema public,extensions to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant all on functions to anon,authenticated,service_role;
alter database """ + db + """ set search_path=public,extensions;
create role """ + role + " login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '" + password + """';
grant anon,authenticated,service_role to """ + role + ";", database_container)
    for path in migrations:
        sql(db, path.read_text(), database_container)
        state["migrations"].append({"name": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        private(STATE / "state.json", state)
    state["role_check"] = sql(db, "select rolname||':'||rolsuper||':'||rolinherit||':'||rolbypassrls from pg_roles where rolname='" + role + "';", database_container)
    db_host, network = database_network(database_container)
    config = STATE / "postgrest.env"
    config.write_text("\n".join([
        "PGRST_DB_URI=postgresql://" + role + ":" + password + "@" + db_host + ":5432/" + db,
        "PGRST_DB_SCHEMAS=public", "PGRST_DB_ANON_ROLE=anon", "PGRST_DB_EXTRA_SEARCH_PATH=public,extensions",
        "PGRST_JWT_SECRET=" + secret, "PGRST_SERVER_PORT=3000", "PGRST_DB_POOL=2", "PGRST_LOG_LEVEL=warn", "GHCRTS=-N1 -M256m"]) + "\n")
    config.chmod(0o600)
    private(STATE / "credentials.json", {"NEXT_PUBLIC_SUPABASE_URL": state["api"],
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": token(secret, "anon"), "SUPABASE_SERVICE_ROLE_KEY": token(secret, "service_role")})
    run(["docker", "run", "-d", "--pull=never", "--name", state["container"], "--label", "bracket.local-http=true",
         "--memory=512m", "--memory-swap=512m", "--cpus=1",
         *network, "-p", "127.0.0.1:54332:3000", "--env-file", str(config),
         "public.ecr.aws/supabase/postgrest:v14.5"])
    private(STATE / "state.json", state)
    for _ in range(60):
        try:
            with urllib.request.urlopen("http://127.0.0.1:54332/", timeout=2) as response:
                if response.status == 200:
                    break
        except Exception:
            time.sleep(1)
    else:
        raise RuntimeError("PostgREST readiness timeout")
    appdir = STATE / "app"
    appdir.mkdir()
    # Separate cwd excludes repo .env.local. Next route discovery needs real app directories.
    # Recopy app routes before final-candidate verification if their source changes.
    shutil.copytree(ROOT / "app", appdir / "app")
    for name in ("components", "lib", "public", "node_modules", "proxy.ts"):
        (appdir / name).symlink_to(ROOT / name, target_is_directory=(ROOT / name).is_dir())
    for name in ("package.json", "package-lock.json", "tsconfig.json", "next-env.d.ts",
                 "next.config.mjs", "postcss.config.mjs", "tailwind.config.ts"):
        (appdir / name).write_bytes((ROOT / name).read_bytes())
    with open(STATE / "runtime.log", "ab", buffering=0) as log:
        child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "serve"],
            stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    state["supervisor_pid"] = child.pid
    private(STATE / "state.json", state)
    status()

class Proxy(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def forward(self):
        if not (self.path == "/rest/v1" or self.path.startswith("/rest/v1/")):
            self.send_error(404)
            return
        conn = http.client.HTTPConnection("127.0.0.1", 54332, timeout=60)
        headers = {k: v for k, v in self.headers.items() if k.lower() not in ("host", "connection", "transfer-encoding")}
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        try:
            conn.request(self.command, self.path[len("/rest/v1"):] or "/", body, headers)
            response = conn.getresponse()
            data = response.read()
            self.send_response(response.status)
            for k, v in response.getheaders():
                if k.lower() not in ("transfer-encoding", "connection", "content-length"):
                    self.send_header(k, v)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        finally:
            conn.close()
    do_GET = do_POST = do_PATCH = do_DELETE = do_PUT = do_HEAD = do_OPTIONS = forward

def serve():
    state = json.loads((STATE / "state.json").read_text())
    validate_database_container(state.get("database_container", DEFAULT_DB_CONTAINER))
    creds = json.loads((STATE / "credentials.json").read_text())
    if creds["NEXT_PUBLIC_SUPABASE_URL"] != "http://127.0.0.1:54331":
        raise RuntimeError("Non-local API refused")
    if time.time() - state["created_at"] > 86400:
        raise RuntimeError("Ephemeral JWT expired")
    env = {k: os.environ[k] for k in ("PATH", "HOME", "TMPDIR", "LANG") if k in os.environ}
    env.update(creds)
    env.update(BRACKET_LOCAL_EVENT_PREVIEW="1", BRACKET_NOTIFICATION_TRANSPORT="fake", NEXT_TELEMETRY_DISABLED="1")
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 54331), Proxy)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    child = subprocess.Popen(["node", str(ROOT / "node_modules/next/dist/bin/next"), "dev", "--webpack",
        "--hostname", "127.0.0.1", "--port", "3137"], cwd=STATE / "app", env=env)
    private(STATE / "pids.json", {"supervisor": os.getpid(), "next": child.pid})
    sys.exit(child.wait())

def status():
    state = json.loads((STATE / "state.json").read_text())
    print(json.dumps({k: state.get(k) for k in ("database", "database_container", "container", "through", "api", "app", "role_check", "supervisor_pid")}, indent=2))
    if (STATE / "pids.json").exists():
        print((STATE / "pids.json").read_text().strip())

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("start", "serve", "status"))
    parser.add_argument("--through", default=PIN)
    parser.add_argument("--database-container", default=DEFAULT_DB_CONTAINER)
    args = parser.parse_args()
    try:
        {"start": lambda: start(args.through, args.database_container), "serve": serve, "status": status}[args.action]()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)

