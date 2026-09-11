"""TEST ONLY, macOS: observe one already-identified fixture PID; never signal it.

The controller arms this observer BEFORE terminating the launcher, then checks
the service's nonce through its existing IPC channel again. NOTE_EXIT is kernel
exit evidence, not a Node close event, exit status, or database cleanup proof.
"""
import json
import os
import re
import select
import sys


def emit(kind, **fields):
    print(json.dumps({"type": kind, **fields}), flush=True)


def observe():
    if sys.platform != "darwin" or not hasattr(select, "kqueue"):
        raise ValueError("UNSUPPORTED_PLATFORM")
    raw = sys.stdin.buffer.readline(4097)
    if len(raw) > 4096:
        raise ValueError("INVALID_INPUT")
    value = json.loads(raw)
    if not isinstance(value, dict) or set(value) != {"pid", "nonce", "timeoutMs"}:
        raise ValueError("INVALID_INPUT")
    pid, nonce, timeout = value["pid"], value["nonce"], value["timeoutMs"]
    if (type(pid) is not int or pid <= 1 or pid in (os.getpid(), os.getppid())
            or not isinstance(nonce, str) or not re.fullmatch(r"[a-f0-9]{32}", nonce)
            or type(timeout) is not int or timeout not in (0, 15000)):
        raise ValueError("INVALID_INPUT")
    queue = select.kqueue()
    try:
        watch = select.kevent(pid, filter=select.KQ_FILTER_PROC,
                             flags=select.KQ_EV_ADD | select.KQ_EV_ONESHOT,
                             fflags=select.KQ_NOTE_EXIT)
        queue.control([watch], 0, 0)
        emit("armed", pid=pid, nonce=nonce, observerPid=os.getpid())
        events = queue.control(None, 1, timeout / 1000)
        if not events:
            raise ValueError("EXIT_UNCONFIRMED")
        event = events[0]
        if (event.ident != pid or event.filter != select.KQ_FILTER_PROC
                or event.flags & select.KQ_EV_ERROR
                or not event.fflags & select.KQ_NOTE_EXIT):
            raise ValueError("INVALID_EXIT_EVENT")
        emit("kernel-exit", pid=pid, nonce=nonce, observerPid=os.getpid())
    finally:
        queue.close()


try:
    observe()
except (ValueError, OSError, EOFError) as error:
    # Fixed diagnostics only; no environment, arbitrary exception or target data.
    known = {"UNSUPPORTED_PLATFORM", "INVALID_INPUT", "EXIT_UNCONFIRMED", "INVALID_EXIT_EVENT"}
    reason = str(error) if str(error) in known else "OBSERVATION_FAILED"
    emit("unverified", reason=reason)
    sys.exit(2)
