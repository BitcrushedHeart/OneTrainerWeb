import os

from fastapi import HTTPException

# Path components that should never be served regardless of allowlist.
_BLOCKED_NAMES = {
    ".git",
    ".env",
    "__pycache__",
    "secrets.json",
    "node_modules",
}

# File extensions that should never be served.
_BLOCKED_SUFFIXES = {
    ".pyc",
    ".pyo",
    ".key",
    ".pem",
}


def validate_path(
    user_path: str,
    *,
    must_exist: bool = True,
    allow_file: bool = True,
    allow_dir: bool = True,
) -> str:
    if not user_path or not user_path.strip():
        raise HTTPException(status_code=400, detail="Empty path")

    # Resolve to canonical absolute path (follows symlinks, resolves ..)
    try:
        canonical = os.path.realpath(user_path)
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid path: {exc}") from exc

    # Existence check
    if must_exist:
        if not os.path.exists(canonical):
            raise HTTPException(status_code=404, detail="Path not found")
        if not allow_file and os.path.isfile(canonical):
            raise HTTPException(status_code=400, detail="Expected directory, got file")
        if not allow_dir and os.path.isdir(canonical):
            raise HTTPException(status_code=400, detail="Expected file, got directory")

    # Block sensitive path components
    parts = os.path.normpath(canonical).split(os.sep)
    for part in parts:
        if part.lower() in _BLOCKED_NAMES:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: path contains restricted component '{part}'",
            )

    # Block sensitive file extensions
    _, ext = os.path.splitext(canonical)
    if ext.lower() in _BLOCKED_SUFFIXES:
        raise HTTPException(
            status_code=403,
            detail=f"Access denied: file type '{ext}' is restricted",
        )

    # Validate against allowlist of base directories
    allowed_bases = _get_allowed_bases()
    if allowed_bases:
        canon_cmp = canonical.lower() if os.name == "nt" else canonical
        if not any(
            canon_cmp.startswith(base.lower() if os.name == "nt" else base)
            for base in allowed_bases
        ):
            raise HTTPException(
                status_code=403,
                detail="Access denied: path is outside allowed directories",
            )

    return canonical


def _get_allowed_bases() -> list[str]:
    from web.backend.paths import PROJECT_ROOT

    bases = [os.path.realpath(PROJECT_ROOT)]

    try:
        from web.backend.services.config_service import ConfigService

        config = ConfigService.get_instance().config

        if config.workspace_dir:
            resolved = os.path.realpath(config.workspace_dir)
            if resolved not in bases:
                bases.append(resolved)

        if hasattr(config, "concepts") and config.concepts:
            for concept in config.concepts:
                if hasattr(concept, "path") and concept.path:
                    resolved = os.path.realpath(concept.path)
                    if resolved not in bases:
                        bases.append(resolved)
    except Exception:
        pass  # Config may not be initialized yet

    return bases
