import json
import os

from web.backend.paths import SECRETS_PATH
from web.backend.services.config_service import ConfigService

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/secrets", tags=["secrets"])

# Fields whose values should be masked in GET responses
_SENSITIVE_FIELDS = {"huggingface_token", "api_key", "password"}


def _mask_value(value: str) -> str:
    if not value or len(value) <= 4:
        return "****" if value else ""
    return "*" * (len(value) - 4) + value[-4:]


def _mask_secrets(data: dict) -> dict:
    masked = {}
    for key, value in data.items():
        if key.startswith("__"):
            continue
        if isinstance(value, dict):
            masked[key] = _mask_secrets(value)
        elif isinstance(value, str) and key in _SENSITIVE_FIELDS:
            masked[key] = _mask_value(value)
        else:
            masked[key] = value
    return masked


@router.get("")
def get_secrets() -> dict:
    if not os.path.isfile(SECRETS_PATH):
        service = ConfigService.get_instance()
        raw = service.config.secrets.to_dict()
        return _mask_secrets(raw)

    try:
        with open(SECRETS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read secrets: {exc}") from exc

    return _mask_secrets(data)


@router.put("")
def save_secrets(body: dict) -> dict:
    existing: dict = {}
    if os.path.isfile(SECRETS_PATH):
        try:
            with open(SECRETS_PATH, "r", encoding="utf-8") as f:
                existing = json.load(f)
        except (json.JSONDecodeError, OSError):
            existing = {}

    merged = _merge_secrets(body, existing)

    service = ConfigService.get_instance()
    service.config.secrets.from_dict(merged)

    try:
        os.makedirs(os.path.dirname(SECRETS_PATH), exist_ok=True)
        with open(SECRETS_PATH, "w", encoding="utf-8") as f:
            json.dump(merged, f, indent=4)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to write secrets: {exc}") from exc

    return _mask_secrets(merged)


def _merge_secrets(incoming: dict, existing: dict) -> dict:
    merged = {}
    for key, value in incoming.items():
        if isinstance(value, dict) and isinstance(existing.get(key), dict):
            merged[key] = _merge_secrets(value, existing[key])
        elif isinstance(value, str) and _is_masked(value) and key in existing:
            merged[key] = existing[key]
        else:
            merged[key] = value
    # Preserve any existing keys not present in incoming
    for key, value in existing.items():
        if key not in merged:
            merged[key] = value
    return merged


def _is_masked(value: str) -> bool:
    if not value:
        return False
    stripped = value.rstrip()
    if all(c == "*" for c in stripped):
        return True
    return stripped.startswith("****") and len(stripped) - stripped.count("*") <= 4
