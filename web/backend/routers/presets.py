import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from web.backend.paths import PRESETS_DIR
from web.backend.services.config_service import ConfigService

router = APIRouter(prefix="/presets", tags=["presets"])


class PresetInfo(BaseModel):
    name: str
    path: str
    is_builtin: bool


class LoadPresetRequest(BaseModel):
    path: str


class SavePresetRequest(BaseModel):
    name: str


@router.get("", response_model=list[PresetInfo])
def list_presets() -> list[PresetInfo]:
    """
    List all available presets from the training_presets/ directory.
    Built-in presets have filenames starting with '#'.
    """
    presets: list[PresetInfo] = []

    if not os.path.isdir(PRESETS_DIR):
        return presets

    for filename in sorted(os.listdir(PRESETS_DIR)):
        if not filename.endswith(".json"):
            continue
        name = filename.removesuffix(".json")
        is_builtin = name.startswith("#")
        full_path = os.path.join(PRESETS_DIR, filename)
        presets.append(PresetInfo(name=name, path=full_path, is_builtin=is_builtin))

    return presets


@router.post("/load")
def load_preset(body: LoadPresetRequest) -> dict:
    """
    Load a preset file by its path and apply it to the current config.
    Returns the full config after loading.
    """
    if not os.path.isfile(body.path):
        raise HTTPException(status_code=404, detail=f"Preset file not found: {body.path}")

    service = ConfigService.get_instance()
    try:
        return service.load_preset(body.path)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to load preset: {exc}") from exc


@router.post("/save")
def save_preset(body: SavePresetRequest) -> dict:
    """
    Save the current config as a named preset.
    Names starting with '#' are reserved for built-in presets and cannot
    be overwritten.
    """
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Preset name must not be empty")
    if name.startswith("#"):
        raise HTTPException(status_code=403, detail="Cannot save a preset with a name starting with '#' (reserved for built-in presets)")

    path = os.path.join(PRESETS_DIR, f"{name}.json")
    service = ConfigService.get_instance()
    try:
        service.save_preset(path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save preset: {exc}") from exc

    return {"name": name, "path": path}


@router.delete("/{name}")
def delete_preset(name: str) -> dict:
    """
    Delete a user-created preset by name. Built-in presets (starting with
    '#') cannot be deleted.
    """
    if name.startswith("#"):
        raise HTTPException(status_code=403, detail="Cannot delete built-in presets")

    path = os.path.join(PRESETS_DIR, f"{name}.json")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=f"Preset not found: {name}")

    try:
        os.remove(path)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete preset: {exc}") from exc

    return {"deleted": name}
