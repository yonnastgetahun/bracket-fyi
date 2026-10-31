#!/usr/bin/env python3
"""Regression test: command timeout must not retain descendant pipe holders."""
import pathlib
import os
import subprocess
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from transition_command import run_command


started = time.monotonic()
try:
    run_command(["sh", "-c", "sleep 30"], timeout=0.1)
except subprocess.TimeoutExpired:
    elapsed = time.monotonic() - started
    assert elapsed < 2, elapsed
else:
    raise AssertionError("timeout command unexpectedly succeeded")

# The detached child is intentionally outside the local process group.  It
# proves cleanup does not wait for an inherited pipe that local kill cannot
# control.  Its pid is handed back only so this test can clean up its fixture.
pid_file = pathlib.Path("/tmp/transition-command-detached-pid")
pid_file.unlink(missing_ok=True)
helper = (
    "import os, pathlib, subprocess, sys, time; "
    "child = subprocess.Popen(['sleep', '30'], start_new_session=True); "
    "pathlib.Path(sys.argv[1]).write_text(str(child.pid)); time.sleep(30)"
)
started = time.monotonic()
timed_out = False
try:
    run_command([sys.executable, "-c", helper, str(pid_file)], timeout=0.1)
except subprocess.TimeoutExpired:
    timed_out = True
    elapsed = time.monotonic() - started
    assert elapsed < 2, elapsed
finally:
    if pid_file.exists():
        detached_pid = int(pid_file.read_text())
        try:
            import os
            os.kill(detached_pid, 9)
        except ProcessLookupError:
            pass
        pid_file.unlink(missing_ok=True)
if not timed_out:
    raise AssertionError("detached timeout command unexpectedly succeeded")

# A direct child can exit between timeout detection and killpg.  The race is
# a timeout, not a leaked ProcessLookupError.
class _ExitedProcess:
    pid = 1
    stdout = None
    stderr = None

    def communicate(self, input=None, timeout=None):
        raise subprocess.TimeoutExpired(["race"], timeout)

    def kill(self):
        raise ProcessLookupError

    def wait(self, timeout=None):
        return 0


original_popen = subprocess.Popen
original_killpg = os.killpg
try:
    subprocess.Popen = lambda *args, **kwargs: _ExitedProcess()
    os.killpg = lambda *args: (_ for _ in ()).throw(ProcessLookupError())
    try:
        run_command(["race"], timeout=0.1)
    except subprocess.TimeoutExpired:
        pass
    else:
        raise AssertionError("exit race unexpectedly succeeded")
finally:
    subprocess.Popen = original_popen
    os.killpg = original_killpg

print("PASS bounded descendant cleanup and exit-race regressions")
