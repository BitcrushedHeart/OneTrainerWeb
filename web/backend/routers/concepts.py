import os
import random
from functools import lru_cache

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse

from web.backend.services.concept_service import ConceptService
from web.backend.services.config_service import ConfigService

router = APIRouter(prefix="/concepts", tags=["concepts"])

# Supported image extensions for thumbnail scanning
_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


@lru_cache(maxsize=256)
def _pick_thumbnail(dir_path: str) -> str | None:
    """
    Scan *dir_path* for image files and return a randomly-chosen path.

    The result is cached by directory path so repeated requests for the
    same concept return the same thumbnail.
    """
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
    """
    Return a random image from the given directory as a file download.

    The chosen image is cached per directory so that the same thumbnail
    is returned on repeated requests for the same concept path.
    """
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
    """
    List image files in a concept directory with their companion caption
    (.txt file with same stem).  Used by the ConceptEditorModal image
    browser.
    """
    if not os.path.isdir(path):
        raise HTTPException(status_code=404, detail="Directory not found")

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
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    total = len(entries)
    page = entries[offset:offset + limit]

    return JSONResponse({"total": total, "offset": offset, "images": page})


@router.get("/image")
def get_image(path: str = Query(..., description="Full path to an image file")):
    """Serve a single image file by its absolute path."""
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Image file not found")

    ext = os.path.splitext(path)[1].lower()
    if ext not in _IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Not a supported image file")

    return FileResponse(path, media_type="image/*")


@router.get("")
def get_concepts() -> list[dict]:
    """
    Load concepts from the file referenced by the current config's
    concept_file_name field.
    """
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
    """
    Save concepts to the file referenced by the current config's
    concept_file_name field.
    """
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
