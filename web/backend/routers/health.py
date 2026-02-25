import asyncio
import os
import sys

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/health")
def health(request: Request):
    return {"status": "ok", "version": request.app.version}


@router.post("/shutdown")
async def shutdown():
    """Graceful shutdown endpoint called by Electron before force-killing."""
    asyncio.get_event_loop().call_later(0.5, _exit)
    return {"status": "shutting_down"}


def _exit():
    if sys.platform == "win32":
        os._exit(0)
    else:
        import signal
        os.kill(os.getpid(), signal.SIGTERM)
