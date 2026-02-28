import os
import re
import sys

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, PROJECT_ROOT)

TS_CONFIG_PATH = os.path.join(
    PROJECT_ROOT, "web", "gui", "src", "renderer", "types", "generated", "config.ts"
)

try:
    from modules.util.config.TrainConfig import TrainConfig
    HAS_TRAIN_CONFIG = True
except ImportError:
    HAS_TRAIN_CONFIG = False


def get_python_config_keys() -> set[str]:
    config = TrainConfig.default_values()
    return set(config.to_dict().keys())


def get_typescript_interface_keys(interface_name: str = "TrainConfig") -> set[str]:
    with open(TS_CONFIG_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    # Find the interface block — handle multiline
    pattern = rf"export interface {interface_name}\s*\{{([^}}]+)\}}"
    match = re.search(pattern, content, re.DOTALL)
    if not match:
        return set()

    interface_body = match.group(1)
    # Extract field names: "fieldName:" or "fieldName?:"
    keys = re.findall(r"^\s*(\w+)\??\s*:", interface_body, re.MULTILINE)
    return set(keys)


# Keys that are intentionally absent from TypeScript (internal Python-only fields)
KNOWN_PYTHON_ONLY = {
    "__version",
    "optimizer_defaults",
}

# Keys that may appear in TS but not in the Python top-level dict
KNOWN_TS_ONLY: set[str] = set()


@pytest.mark.skipif(not HAS_TRAIN_CONFIG, reason="TrainConfig not importable (missing ML dependencies)")
class TestParameterParity:
    def test_config_ts_file_exists(self):
        assert os.path.isfile(TS_CONFIG_PATH), f"config.ts not found at {TS_CONFIG_PATH}"

    def test_config_ts_has_train_config_interface(self):
        ts_keys = get_typescript_interface_keys()
        assert len(ts_keys) > 10, "TrainConfig interface appears to have too few fields"

    def test_python_keys_present_in_typescript(self):
        python_keys = get_python_config_keys() - KNOWN_PYTHON_ONLY
        ts_keys = get_typescript_interface_keys()

        missing = python_keys - ts_keys
        assert not missing, (
            "The following Python TrainConfig fields are missing from the TypeScript interface:\n"
            + "\n".join(sorted(missing))
        )

    def test_no_unexpected_typescript_extras(self):
        python_keys = get_python_config_keys()
        ts_keys = get_typescript_interface_keys() - KNOWN_TS_ONLY

        extras = ts_keys - python_keys
        assert not extras, (
            "The following TypeScript TrainConfig fields are not in the Python config:\n"
            + "\n".join(sorted(extras))
        )

    def test_field_count_reasonable(self):
        python_count = len(get_python_config_keys() - KNOWN_PYTHON_ONLY)
        ts_count = len(get_typescript_interface_keys() - KNOWN_TS_ONLY)

        # Allow up to 10% difference
        ratio = min(python_count, ts_count) / max(python_count, ts_count)
        assert ratio > 0.9, (
            f"Field count mismatch: Python has {python_count}, TypeScript has {ts_count}"
        )
