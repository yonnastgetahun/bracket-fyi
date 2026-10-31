#!/usr/bin/env python3
"""Subprocess-only readiness regressions: no Docker or database calls."""
import importlib.util
import os
import pathlib
import signal
import subprocess
import sys
import unittest

TARGET = pathlib.Path(__file__).with_name("verify-notification-operator-authority-races.py")

def load():
    spec = importlib.util.spec_from_file_location("oracle", TARGET)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def scenario(source, success):
    oracle = load()
    if success:
        process = subprocess.Popen([sys.executable, "-u", "-c", source],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            assert oracle.blocker_ready(process, seconds=.3) == 123
            assert os.get_blocking(process.stdout.fileno())
            assert os.get_blocking(process.stderr.fileno())
        finally:
            process.kill()
            process.wait(timeout=1)
            process.stdout.close()
            process.stderr.close()
        return
    spawned = []
    real_popen = subprocess.Popen
    def tracked(*args, **kwargs):
        process = real_popen(*args, **kwargs)
        spawned.append(process)
        return process
    oracle.subprocess.Popen = tracked
    oracle.BASE = [sys.executable, "-u", "-c", source]
    if hasattr(oracle, "blocker_ready"):
        real_ready = oracle.blocker_ready
        oracle.blocker_ready = lambda process: real_ready(process, seconds=.3)
    # Shorten only the initial wait in the pre-fix implementation.
    real_until = oracle.until
    oracle.until = lambda predicate, message: real_until(predicate, message, seconds=.3)
    try:
        oracle.barrier("", "", None, None, None)
    except AssertionError as error:
        assert "blocker" in str(error), str(error)
    else:
        raise AssertionError("missing readiness failure")
    assert len(spawned) == 1, "worker must not start"
    assert spawned[0].poll() is not None, "blocker was not reaped"
    for pipe in (spawned[0].stdin, spawned[0].stdout, spawned[0].stderr):
        assert pipe.closed, "barrier must close subprocess pipes"

class ReadinessTests(unittest.TestCase):
    def check(self, source, success=False):
        with subprocess.Popen([sys.executable, "-B", __file__, "--scenario", source,
                               "success" if success else "failure"],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              text=True, start_new_session=True) as process:
            try:
                out, error = process.communicate(timeout=3)
                self.assertEqual(process.returncode, 0, out + error)
            finally:
                # A regression must not leave the watchdog's synthetic child alive.
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait(timeout=1)

    def test_silent(self):
        self.check("import time; time.sleep(30)")

    def test_row_then_stall(self):
        self.check("import time; print('1', flush=True); time.sleep(30)")

    def test_partial_line(self):
        self.check("import os,time; os.write(1,b'partial'); time.sleep(30)")

    def test_stdout_eof_stderr_open(self):
        self.check("import os,time; os.close(1); os.write(2,b'diagnostic'); time.sleep(30)")

    def test_stderr_flood(self):
        self.check("import os;\nwhile True: os.write(2,b'x'*8192)")

    def test_stdout_flood(self):
        self.check("import os;\nwhile True: os.write(1,b'row\\n'*1024)")

    def test_buffered_marker(self):
        self.check("import os,time; os.write(1,b'1\\nNO11_HELD:123\\n'); time.sleep(30)", True)

    def test_split_marker(self):
        self.check("import os,time; os.write(1,b'1\\nNO11_HE'); time.sleep(.03); os.write(1,b'LD:123\\n'); time.sleep(30)", True)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--scenario":
        scenario(sys.argv[2], sys.argv[3] == "success")
    else:
        unittest.main()
