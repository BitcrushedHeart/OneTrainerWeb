"""
WebSocket handler for real-time backend log streaming.

Streams stdout, stderr, and Python logging output captured by LogService
to connected WebSocket clients.  New clients receive the full history
buffer (up to 1000 lines) on connect.

Message types sent to connected clients:

    {"type": "log", "data": {"text": "<ansi string>", "ts": <float>}}
"""

import asyncio
import logging
from contextlib import suppress

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Connection manager
# ---------------------------------------------------------------------------


class ConnectionManager:
    """Manages active WebSocket connections for the terminal log stream."""

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []
        self._lock: asyncio.Lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.append(websocket)
        logger.info("Terminal WebSocket client connected (%s total)", len(self._connections))

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            with suppress(ValueError):
                self._connections.remove(websocket)
        logger.info("Terminal WebSocket client disconnected (%s remaining)", len(self._connections))

    async def broadcast(self, message: dict) -> None:
        """Send a JSON message to every connected client."""
        async with self._lock:
            stale: list[WebSocket] = []
            for ws in self._connections:
                try:
                    await ws.send_json(message)
                except Exception:  # noqa: BLE001, PERF203
                    stale.append(ws)

            for ws in stale:
                with suppress(ValueError):
                    self._connections.remove(ws)

            if stale:
                logger.debug("Removed %d stale terminal WebSocket connection(s)", len(stale))

    @property
    def active_count(self) -> int:
        return len(self._connections)


manager = ConnectionManager()


# ---------------------------------------------------------------------------
# Event-loop reference for cross-thread broadcasting
# ---------------------------------------------------------------------------

_event_loop: asyncio.AbstractEventLoop | None = None


def _capture_event_loop() -> None:
    global _event_loop
    if _event_loop is None:
        try:
            _event_loop = asyncio.get_running_loop()
        except RuntimeError:
            logger.warning("No running event loop found when capturing loop reference")


# ---------------------------------------------------------------------------
# Synchronous broadcast helper (called from LogService on any thread)
# ---------------------------------------------------------------------------


def broadcast_sync(message: dict) -> None:
    """Thread-safe synchronous wrapper around manager.broadcast()."""
    if manager.active_count == 0:
        return

    loop = _event_loop
    if loop is not None and loop.is_running():
        future = asyncio.run_coroutine_threadsafe(manager.broadcast(message), loop)
        future.add_done_callback(_broadcast_done_callback)
    else:
        logger.debug("No active event loop — dropping terminal broadcast message")


def _broadcast_done_callback(future: asyncio.Future) -> None:
    exc = future.exception()
    if exc is not None:
        logger.error("Error broadcasting terminal message: %s", exc, exc_info=exc)


# ---------------------------------------------------------------------------
# WebSocket route
# ---------------------------------------------------------------------------

router = APIRouter()


@router.websocket("/ws/terminal")
async def terminal_ws(websocket: WebSocket) -> None:
    """
    WebSocket endpoint for real-time backend log output.

    On connection:
    1. Accept the socket and register it with the ConnectionManager.
    2. Capture the event loop for cross-thread broadcasting.
    3. Wire the broadcast function into LogService.
    4. Replay the full history buffer to the new client.
    5. Enter a receive loop to keep the connection alive.
    """
    await manager.connect(websocket)
    _capture_event_loop()

    # Lazily import to avoid circular dependencies at module load time.
    from web.backend.services.log_service import LogService

    svc = LogService.get_instance()
    svc.set_ws_broadcast(broadcast_sync)
    svc.set_event_loop(asyncio.get_running_loop())

    # Replay history to newly connected client
    history = svc.get_history()
    for entry in history:
        with suppress(Exception):
            await websocket.send_json({"type": "log", "data": entry})

    try:
        while True:
            await websocket.receive_text()
            # Keep-alive loop — client messages are ignored
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)
