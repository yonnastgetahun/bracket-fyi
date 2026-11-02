"""Bounded subprocess execution for the local transition harness."""
import os
import signal
import subprocess


_CLEANUP_TIMEOUT = 0.5


def _close_pipe(stream):
    if stream is not None:
        stream.close()


def run_command(argv, stdin=None, timeout=180):
    """Run one command with bounded local cleanup on timeout.

    The pipe readers used by ``communicate`` can wait forever when a
    descendant inherits stdout/stderr.  After the timeout, close our pipe
    handles immediately and only wait for the direct child for a short,
    bounded interval.  A detached/remote exec is outside this local process
    group and is deliberately not treated as cancelled here.
    """
    process = subprocess.Popen(
        argv,
        stdin=subprocess.PIPE if stdin is not None else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(input=stdin, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        try:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                # The child can win the exit race after communicate timed out.
                pass
        finally:
            # Do not call communicate again: an escaped descendant may still
            # hold either pipe open indefinitely.
            _close_pipe(process.stdout)
            _close_pipe(process.stderr)
            try:
                process.kill()
            except ProcessLookupError:
                pass
        try:
            process.wait(timeout=_CLEANUP_TIMEOUT)
        except subprocess.TimeoutExpired:
            # Local cleanup itself must remain bounded.  The original timeout
            # is still the useful error; no remote-cancellation claim is made.
            pass
        raise subprocess.TimeoutExpired(argv, timeout) from exc
    if process.returncode:
        raise RuntimeError({"argv": argv, "returncode": process.returncode,
                            "stdout": stdout, "stderr": stderr})
    return stdout
