"""
WebSocket handler for real-time training progress streaming.

Bridges the synchronous training thread (which calls TrainCallbacks) to
async WebSocket clients.  The training thread calls ``broadcast_sync()``
which safely schedules a broadcast onto the asyncio event loop via
``asyncio.run_coroutine_threadsafe``.

Message types sent to connected clients:

    {"type": "progress",        "data": {"epoch", "epoch_step", "epoch_sample", "global_step", "max_step", "max_epoch"}}
    {"type": "status",          "data": {"text": "..."}}
    {"type": "sample",          "data": {"file_type": "image", "base64": "...", "step": int}}
    {"type": "sample_progress", "data": {"step": int, "max_step": int}}
    {"type": "error",           "data": {"message": "..."}}
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
    """
    Manages active WebSocket connections for the training progress stream.

    All mutating methods are guarded by an asyncio lock so that concurrent
    connect / disconnect / broadcast calls do not corrupt the connection list.
    """

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []
        self._lock: asyncio.Lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        """Accept an incoming WebSocket and add it to the active set."""
        await websocket.accept()
        async with self._lock:
            self._connections.append(websocket)
        logger.info("Training WebSocket client connected (%s total)", len(self._connections))

    async def disconnect(self, websocket: WebSocket) -> None:
        """Remove a WebSocket from the active set."""
        async with self._lock:
            with suppress(ValueError):
                self._connections.remove(websocket)
        logger.info("Training WebSocket client disconnected (%s remaining)", len(self._connections))

    async def broadcast(self, message: dict) -> None:
        """
        Send a JSON message to every connected client.

        Clients that have silently disconnected are removed from the
        connection list rather than raising.
        """
        async with self._lock:
            stale: list[WebSocket] = []
            for ws in self._connections:
                try:
                    await ws.send_json(message)
                except Exception:  # noqa: BLE001, PERF203 — catch-all; try/except required per-client
                    stale.append(ws)

            for ws in stale:
                with suppress(ValueError):
                    self._connections.remove(ws)

            if stale:
                logger.debug("Removed %d stale WebSocket connection(s)", len(stale))

    @property
    def active_count(self) -> int:
        """Return the number of currently connected clients (non-locking snapshot)."""
        return len(self._connections)


# Module-level singleton — importable by other modules.
manager = ConnectionManager()


# ---------------------------------------------------------------------------
# Event-loop reference for cross-thread broadcasting
# ---------------------------------------------------------------------------

_event_loop: asyncio.AbstractEventLoop | None = None


def _capture_event_loop() -> None:
    """Store a reference to the running asyncio event loop.

    Called once when the first WebSocket connects.  The reference is used by
    ``broadcast_sync`` to schedule coroutines from non-async threads.
    """
    global _event_loop
    if _event_loop is None:
        try:
            _event_loop = asyncio.get_running_loop()
        except RuntimeError:
            logger.warning("No running event loop found when capturing loop reference")


# ---------------------------------------------------------------------------
# Synchronous broadcast helper (called from training thread)
# ---------------------------------------------------------------------------


def broadcast_sync(message: dict) -> None:
    """
    Thread-safe synchronous wrapper around ``manager.broadcast()``.

    This function is designed to be called from the training thread (which
    is a plain ``threading.Thread``, not an asyncio task).  It schedules
    the broadcast coroutine on the captured event loop.

    If no event loop has been captured yet (no WebSocket clients have ever
    connected), the message is silently dropped.
    """
    if manager.active_count == 0:
        return  # No clients — skip the cross-thread hop entirely.

    loop = _event_loop
    if loop is not None and loop.is_running():
        future = asyncio.run_coroutine_threadsafe(manager.broadcast(message), loop)
        # We don't block on the future — fire-and-forget is fine for progress
        # updates.  But we attach a callback to log unexpected errors so they
        # aren't swallowed silently.
        future.add_done_callback(_broadcast_done_callback)
    else:
        # No running event loop available (FastAPI has shut down but the
        # training thread is still draining).  Calling asyncio.run() here
        # would fail silently because the asyncio.Lock inside
        # ConnectionManager is bound to the original event loop.
        logger.debug("No active event loop — dropping training broadcast message")


def _broadcast_done_callback(future: asyncio.Future) -> None:
    """Log exceptions from fire-and-forget broadcast futures."""
    exc = future.exception()
    if exc is not None:
        logger.error("Error broadcasting training message: %s", exc, exc_info=exc)


# ---------------------------------------------------------------------------
# WebSocket route
# ---------------------------------------------------------------------------

router = APIRouter()


@router.websocket("/ws/training")
async def training_ws(websocket: WebSocket) -> None:
    """
    WebSocket endpoint for real-time training progress.

    On connection:
    1. Accept the socket and register it with the ConnectionManager.
    2. Capture the running event loop so ``broadcast_sync`` can schedule
       coroutines from the training thread.
    3. Wire the synchronous broadcast callback into the TrainerService so
       that TrainCallbacks progress events are forwarded to all clients.
    4. Enter a receive loop that keeps the connection alive.  The loop
       currently ignores client messages but could be extended to accept
       commands (e.g. request an immediate sample).

    On disconnect the socket is removed from the manager.
    """
    await manager.connect(websocket)
    _capture_event_loop()

    # Lazily import to avoid circular dependencies at module load time.
    from web.backend.services.trainer_service import TrainerService

    TrainerService.get_instance().set_ws_broadcast(broadcast_sync)

    try:
        while True:
            # Keep the connection alive.  ``receive_text`` will raise
            # WebSocketDisconnect when the client closes the socket.
            data = await websocket.receive_text()
            # Future: handle client-initiated commands (ping, sample request, etc.)
            logger.debug("Received client message on training WS: %s", data)
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)
