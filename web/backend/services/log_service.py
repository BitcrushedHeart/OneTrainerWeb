"""
Singleton service that captures stdout, stderr, and the Python logging
subsystem and re-broadcasts them to connected WebSocket clients.

1. At startup (called from main.py lifespan), sys.stdout and sys.stderr are
   replaced with a TeeWriter that forwards bytes to both the original stream
   and to the LogService buffer.

2. A root logging.Handler is installed that converts LogRecord objects into
   formatted log lines and feeds them into the same buffer.

3. The in-memory ring buffer (collections.deque, maxlen=1000) stores the last
   1000 log lines so new WebSocket clients receive history on connect.

4. broadcast_sync() follows the same pattern as training_ws.py: it schedules
   a coroutine on the captured asyncio event loop via
   asyncio.run_coroutine_threadsafe, making it safe to call from any thread.

Message format sent to clients:
    {"type": "log", "data": {"text": "<ansi-encoded line>", "ts": 1234567890.0}}
"""

import asyncio
import io
import logging
import sys
import threading
import time
from collections import deque
from collections.abc import Callable
from typing import Any

from web.backend.services._singleton import SingletonMixin

logger = logging.getLogger(__name__)


class _TeeWriter(io.TextIOBase):
    """Writes to the original stream AND feeds lines to LogService."""

    def __init__(self, original: io.TextIOBase, log_service: "LogService") -> None:
        self._original = original
        self._log_service = log_service

    def write(self, s: str) -> int:
        if not s:
            return 0
        # Always write to the original stream first
        result = self._original.write(s)
        self._original.flush()

        # Feed non-empty content to the log service
        stripped = s.rstrip("\n\r")
        if stripped:
            # Split on newlines so each buffer entry is one logical line
            for line in stripped.split("\n"):
                if line:
                    self._log_service._append(line)

        return result

    def flush(self) -> None:
        self._original.flush()

    def fileno(self) -> int:
        return self._original.fileno()

    @property
    def encoding(self) -> str:
        return getattr(self._original, "encoding", "utf-8")

    def isatty(self) -> bool:
        return False

    def writable(self) -> bool:
        return True

    def readable(self) -> bool:
        return False


class _WebSocketLogHandler(logging.Handler):
    """Feeds Python logging records into LogService."""

    def __init__(self, log_service: "LogService") -> None:
        super().__init__()
        self._log_service = log_service
        self.setFormatter(logging.Formatter("%(levelname)s:     %(name)s - %(message)s"))

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
            self._log_service._append(msg)
        except Exception:
            self.handleError(record)


class LogService(SingletonMixin):
    """
    Singleton that captures process output and streams it via WebSocket.

    Thread-safe: the ring buffer is guarded by a threading.Lock, and
    broadcast_sync uses asyncio.run_coroutine_threadsafe for cross-thread
    dispatch.
    """

    def __init__(self) -> None:
        self._buffer: deque[dict[str, Any]] = deque(maxlen=1000)
        self._lock = threading.Lock()
        self._ws_broadcast: Callable[[dict], None] | None = None
        self._event_loop: asyncio.AbstractEventLoop | None = None
        self._installed = False

    def install(self) -> None:
        """Install stdout/stderr interceptors and logging handler.

        Idempotent — calling multiple times is safe.
        """
        if self._installed:
            return
        self._installed = True

        # Replace stdout and stderr with tee writers
        sys.stdout = _TeeWriter(sys.stdout, self)  # type: ignore[assignment]
        sys.stderr = _TeeWriter(sys.stderr, self)  # type: ignore[assignment]

        # Install a root logging handler
        handler = _WebSocketLogHandler(self)
        handler.setLevel(logging.INFO)
        root_logger = logging.getLogger()
        root_logger.addHandler(handler)

    def set_ws_broadcast(self, broadcast_fn: Callable[[dict], None]) -> None:
        """Inject the WebSocket broadcast function (called by terminal_ws.py)."""
        self._ws_broadcast = broadcast_fn

    def set_event_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Store the asyncio event loop reference for cross-thread broadcasting."""
        self._event_loop = loop

    def get_history(self) -> list[dict[str, Any]]:
        """Return a thread-safe snapshot of the full ring buffer."""
        with self._lock:
            return list(self._buffer)

    def _append(self, text: str) -> None:
        """Add a line to the buffer and broadcast it."""
        entry = {"text": text, "ts": time.time()}
        with self._lock:
            self._buffer.append(entry)

        message = {"type": "log", "data": entry}
        if self._ws_broadcast is not None:
            self._ws_broadcast(message)
