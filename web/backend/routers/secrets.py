import json
import os

from fastapi import APIRouter, HTTPException

from web.backend.paths import SECRETS_PATH
from web.backend.services.config_service import ConfigService

router = APIRouter(prefix="/secrets", tags=["secrets"])

# Fields whose values should be masked in GET responses
_SENSITIVE_FIELDS = {"huggingface_token", "api_key", "password"}


def _mask_value(value: str) -> str:
    """Replace all but the last 4 characters with asterisks."""
    if not value or len(value) <= 4:
        return "****" if value else ""
    return "*" * (len(value) - 4) + value[-4:]


def _mask_secrets(data: dict) -> dict:
    """
    Recursively mask sensitive string values in a secrets dictionary.
    """
    masked = {}
    for key, value in data.items():
        if key.startswith("__"):
            # Skip internal keys like __version
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
    """
    Load secrets from secrets.json. Sensitive values are masked in the
    response (only the last 4 characters are visible).
    """
    if not os.path.isfile(SECRETS_PATH):
        # Return the default structure with empty values
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
    """
    Save secrets to secrets.json. Accepts a full secrets dictionary.
    Fields whose values are entirely asterisks (masked placeholders)
    are preserved from the existing file to avoid overwriting real
    values with masks.
    """
    # Load existing secrets so masked fields can be preserved
    existing: dict = {}
    if os.path.isfile(SECRETS_PATH):
        try:
            with open(SECRETS_PATH, "r", encoding="utf-8") as f:
                existing = json.load(f)
        except (json.JSONDecodeError, OSError):
            existing = {}

    merged = _merge_secrets(body, existing)

    # Also apply to the in-memory config
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
    """
    Merge incoming secrets with existing ones, preserving existing
    values when the incoming value looks like a mask (all asterisks
    or the well-known '****' placeholder).
    """
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
    """Return True if the value looks like a masked placeholder."""
    if not value:
        return False
    # Consider it masked if it's all asterisks or matches our mask pattern
    # (asterisks followed by up to 4 non-asterisk chars)
    stripped = value.rstrip()
    if all(c == "*" for c in stripped):
        return True
    # Pattern: ****<suffix up to 4 chars> -- still treat as mask
    if stripped.startswith("****") and len(stripped) - stripped.count("*") <= 4:
        return True
    return False
