"""
WebSocket handler for real-time system metrics streaming.

Pushes CPU, RAM, and GPU metrics to connected clients at approximately
1-second intervals.  Follows the same ConnectionManager pattern as
``training_ws.py``.

Message types sent to connected clients:

    {"type": "metrics", "data": { ... }}

The ``data`` payload matches the structure returned by
``MonitorService.get_metrics()``.
"""

import asyncio
import logging
from contextlib import suppress

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

METRICS_INTERVAL_S = 1.0


# ---------------------------------------------------------------------------
# Connection manager
# ---------------------------------------------------------------------------


class ConnectionManager:
    """
    Manages active WebSocket connections for the system metrics stream.

    All mutating methods are guarded by an asyncio lock so that concurrent
    connect / disconnect calls do not corrupt the connection list.
    """

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []
        self._lock: asyncio.Lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        """Accept an incoming WebSocket and add it to the active set."""
        await websocket.accept()
        async with self._lock:
            self._connections.append(websocket)
        logger.info("System metrics WebSocket client connected (%s total)", len(self._connections))

    async def disconnect(self, websocket: WebSocket) -> None:
        """Remove a WebSocket from the active set."""
        async with self._lock:
            with suppress(ValueError):
                self._connections.remove(websocket)
        logger.info("System metrics WebSocket client disconnected (%s remaining)", len(self._connections))

    @property
    def active_count(self) -> int:
        """Return the number of currently connected clients (non-locking snapshot)."""
        return len(self._connections)


# Module-level singleton
manager = ConnectionManager()


# ---------------------------------------------------------------------------
# WebSocket route
# ---------------------------------------------------------------------------

router = APIRouter()


@router.websocket("/ws/system")
async def system_ws(websocket: WebSocket) -> None:
    """
    WebSocket endpoint for real-time system metrics.

    On connection:
    1. Accept the socket and register it with the ConnectionManager.
    2. Enter a send loop that pushes metrics every ~1 second.
    3. On disconnect the socket is removed from the manager.
    """
    await manager.connect(websocket)

    # Lazily import to avoid pulling in psutil/pynvml at module load time.
    from web.backend.services.monitor_service import MonitorService

    monitor = MonitorService.get_instance()

    try:
        while True:
            metrics = monitor.get_metrics()
            await websocket.send_json({"type": "metrics", "data": metrics})
            await asyncio.sleep(METRICS_INTERVAL_S)
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        # Connection may have been closed unexpectedly
        logger.debug("System metrics WebSocket connection closed unexpectedly")
    finally:
        await manager.disconnect(websocket)
