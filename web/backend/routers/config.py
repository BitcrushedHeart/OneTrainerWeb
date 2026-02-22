from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from web.backend.services.config_service import ConfigService

router = APIRouter(prefix="/config", tags=["config"])


class ConfigUpdateRequest(BaseModel):
    """Partial config update. Any subset of TrainConfig fields."""
    model_config = {"extra": "allow"}


@router.get("")
def get_config() -> dict:
    """Return the current training configuration as a dictionary."""
    service = ConfigService.get_instance()
    return service.get_config_dict()


@router.put("")
def update_config(body: ConfigUpdateRequest) -> dict:
    """
    Update the current config with the provided fields.
    Returns the full updated config.
    """
    service = ConfigService.get_instance()
    try:
        return service.update_config(body.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/validate")
def validate_config(body: ConfigUpdateRequest) -> dict:
    """
    Validate a full or partial config dict against TrainConfig without
    persisting any changes.

    Returns ``{"valid": true}`` on success, or
    ``{"valid": false, "errors": [...]}`` on failure.
    """
    service = ConfigService.get_instance()
    return service.validate_config(body.model_dump())


@router.get("/defaults")
def get_defaults() -> dict:
    """Return the default TrainConfig values."""
    service = ConfigService.get_instance()
    return service.get_defaults()


@router.get("/schema")
def get_schema() -> dict:
    """
    Return field metadata derived from the config's types and nullables
    dictionaries. Each field entry includes its type name and whether it
    is nullable.
    """
    service = ConfigService.get_instance()
    config = service.config

    fields: dict[str, dict] = {}
    for name, var_type in config.types.items():
        type_name = getattr(var_type, "__name__", str(var_type))
        fields[name] = {
            "type": type_name,
            "nullable": config.nullables.get(name, False),
        }

    return {"fields": fields}


@router.post("/export")
def export_config() -> dict:
    """
    Export the full config including inlined concepts and samples
    (via to_pack_dict).
    """
    service = ConfigService.get_instance()
    try:
        return service.export_config()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Referenced file not found: {exc}",
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
