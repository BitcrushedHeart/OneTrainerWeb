import contextlib
import os
import random
import threading
import time
from functools import lru_cache

from web.backend.services.concept_service import ConceptService
from web.backend.services.config_service import ConfigService
from web.backend.utils.path_security import validate_path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

router = APIRouter(prefix="/concepts", tags=["concepts"])

# Supported image extensions for thumbnail scanning
_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


@lru_cache(maxsize=256)
def _pick_thumbnail(dir_path: str) -> str | None:
    if not os.path.isdir(dir_path):
        return None

    candidates: list[str] = []
    try:
        for entry in os.scandir(dir_path):
            if entry.is_file():
                ext = os.path.splitext(entry.name)[1].lower()
                if ext in _IMAGE_EXTENSIONS:
                    candidates.append(entry.path)
    except PermissionError:
        return None

    if not candidates:
        return None

    return random.choice(candidates)


@router.get("/thumbnail")
def get_thumbnail(path: str = Query(..., description="Directory path to scan for images")):
    path = validate_path(path, allow_file=False)
    chosen = _pick_thumbnail(path)
    if chosen is None:
        raise HTTPException(status_code=404, detail="No images found in directory")

    return FileResponse(chosen, media_type="image/*")


@router.get("/images")
def list_images(
    path: str = Query(..., description="Directory path to scan for images"),
    offset: int = Query(0, ge=0, description="Start index"),
    limit: int = Query(50, ge=1, le=200, description="Max images to return"),
):
    path = validate_path(path, allow_file=False)

    entries: list[dict] = []
    try:
        for entry in sorted(os.scandir(path), key=lambda e: e.name):
            if entry.is_file():
                ext = os.path.splitext(entry.name)[1].lower()
                if ext in _IMAGE_EXTENSIONS:
                    stem = os.path.splitext(entry.path)[0]
                    caption_path = stem + ".txt"
                    caption: str | None = None
                    if os.path.isfile(caption_path):
                        try:
                            with open(caption_path, "r", encoding="utf-8") as fh:
                                caption = fh.read().strip()
                        except Exception:
                            caption = None
                    entries.append({
                        "filename": entry.name,
                        "path": entry.path.replace("\\", "/"),
                        "caption": caption,
                    })
    except PermissionError as err:
        raise HTTPException(status_code=403, detail="Permission denied") from err

    total = len(entries)
    page = entries[offset:offset + limit]

    return JSONResponse({"total": total, "offset": offset, "images": page})


@router.get("/image")
def get_image(path: str = Query(..., description="Full path to an image file")):
    path = validate_path(path, allow_dir=False)

    ext = os.path.splitext(path)[1].lower()
    if ext not in _IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Not a supported image file")

    return FileResponse(path, media_type="image/*")


@router.get("/text-file")
def get_text_file(path: str = Query(..., description="Path to a text file")):
    path = validate_path(path, allow_dir=False)

    ext = os.path.splitext(path)[1].lower()
    if ext not in {".txt", ".caption", ".csv"}:
        raise HTTPException(status_code=400, detail="Not a supported text file")

    try:
        with open(path, "r", encoding="utf-8") as fh:
            content = fh.read()
        return JSONResponse({"content": content})
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Permission denied") from exc
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid file encoding") from exc


@router.get("")
def get_concepts() -> list[dict]:
    service = ConfigService.get_instance()
    concept_path = service.config.concept_file_name

    if not concept_path:
        raise HTTPException(status_code=422, detail="No concept_file_name configured")

    concept_service = ConceptService()
    try:
        return concept_service.load_concepts(concept_path)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Concept file not found: {concept_path}",
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.put("")
def save_concepts(concepts: list[dict]) -> dict:
    service = ConfigService.get_instance()
    concept_path = service.config.concept_file_name

    if not concept_path:
        raise HTTPException(status_code=422, detail="No concept_file_name configured")

    concept_service = ConceptService()
    try:
        concept_service.save_concepts(concept_path, concepts)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"saved": len(concepts), "path": concept_path}


# Module-level cancel flag for stats scanning
_stats_cancel_flag = threading.Event()


class StatsRequest(BaseModel):
    path: str
    include_subdirectories: bool = False
    advanced: bool = False


@router.post("/stats")
def scan_concept_stats(req: StatsRequest):
    req.path = validate_path(req.path, allow_file=False)

    try:
        from modules.util import concept_stats
        from modules.util.config.ConceptConfig import ConceptConfig
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Backend modules not available: {exc}",
        ) from exc

    _stats_cancel_flag.clear()
    start_time = time.perf_counter()

    concept_config = ConceptConfig.default_values()
    concept_config.path = req.path
    concept_config.include_subdirectories = req.include_subdirectories

    stats_dict = concept_stats.init_concept_stats(req.advanced)

    subfolders = [req.path]
    wait_time = 9999  # No timeout — cancellation via flag

    for folder in subfolders:
        if _stats_cancel_flag.is_set():
            break
        stats_dict = concept_stats.folder_scan(
            folder, stats_dict, req.advanced, concept_config,
            start_time, wait_time, _stats_cancel_flag,
        )
        if req.include_subdirectories and not _stats_cancel_flag.is_set():
            with contextlib.suppress(PermissionError):
                subfolders.extend(
                    entry.path for entry in os.scandir(folder) if entry.is_dir()
                )

    stats_dict["processing_time"] = round(time.perf_counter() - start_time, 3)

    return JSONResponse(stats_dict)


@router.delete("/stats/cancel")
def cancel_concept_stats():
    _stats_cancel_flag.set()
    return {"cancelled": True}
