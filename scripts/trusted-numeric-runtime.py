"""Sole-owner runner: reuse isolated HTTP runtime, keep diagnostics private."""
import argparse, hashlib, json, os, subprocess, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"tmp/trusted-numeric"
OUT.mkdir(exist_ok=True)
def hashes():
    paths=[]
    for folder in ("lib/events","lib/ingestion","app","components","supabase/migrations"):
        paths.extend(p for p in (ROOT/folder).rglob("*") if p.is_file())
    paths.extend((ROOT/"tests/events").glob("trusted-numeric*"))
    paths.extend((ROOT/"scripts/browser").glob("trusted-numeric*"))
    paths.extend([ROOT/"scripts/verify-trusted-numeric.mjs",Path(__file__),ROOT/"scripts/trusted-numeric-browser-runtime.mjs"])
    return {str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}
def main():
    parser=argparse.ArgumentParser();parser.add_argument("mode",choices=["sql","browser"]);args=parser.parse_args()
    state=json.loads((ROOT/"tmp/local-event-http/state.json").read_text())
    assert state["database"]=="bracket_http_439610679a15"
    assert state["database_container"]=="bracket-p11-db-9bd170c85c0f"
    assert state["through"]=="20261027000015"
    env=os.environ.copy()
    env.update(BRACKET_NUMERIC_DATABASE=state["database"],BRACKET_NUMERIC_DISPOSABLE=state["database"],BRACKET_NUMERIC_CONTAINER=state["database_container"],BRACKET_NUMERIC_BROWSER_URL="http://127.0.0.1:9222")
    stamp=str(time.time_ns());before=hashes()
    command=["node","scripts/trusted-numeric-browser-runtime.mjs"] if args.mode=="browser" else ["node","--import","./scripts/event-runtime-register.mjs","scripts/verify-trusted-numeric.mjs","sql"]
    p=subprocess.run(command,cwd=ROOT,env=env,capture_output=True,text=True,timeout=1800)
    private=OUT/(stamp+"-private.log");private.write_text(p.stdout+p.stderr);private.chmod(0o600)
    evidence={"mode":args.mode,"exit":p.returncode,"before":before,"after":hashes()}
    out=OUT/(stamp+"-source.json");out.write_text(json.dumps(evidence,indent=2))
    print(json.dumps({"mode":args.mode,"exit":p.returncode,"sourceEvidence":str(out),"sourceStable":evidence["before"]==evidence["after"]}))
    return p.returncode
if __name__=="__main__":
    raise SystemExit(main())
