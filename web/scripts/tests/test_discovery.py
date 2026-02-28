import importlib
import os
import sys
from enum import Enum

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))


def test_dynamic_enum_discovery_matches_hardcoded():
    """Dynamic scanning must find at least every known enum module."""
    from web.scripts.generate_types import _KNOWN_ENUM_MODULES, ENUM_MODULES

    missing = _KNOWN_ENUM_MODULES - set(ENUM_MODULES)
    assert not missing, f"Dynamic scan missed: {missing}"


def test_dynamic_enum_discovery_finds_all_enums():
    """Every discovered module must yield at least one Enum subclass."""
    from web.scripts.generate_types import discover_enum_modules

    for module_path in discover_enum_modules():
        mod = importlib.import_module(module_path)
        enums = [
            obj for _, obj in vars(mod).items()
            if isinstance(obj, type) and issubclass(obj, Enum) and obj is not Enum
        ]
        assert len(enums) > 0, f"No Enum found in {module_path}"


def test_dynamic_config_discovery_matches_hardcoded():
    """Dynamic scanning must find at least every known config class."""
    from web.scripts.generate_types import _KNOWN_CONFIG_CLASSES, discover_config_classes

    discovered_names = {name for name, _ in discover_config_classes()}
    missing = _KNOWN_CONFIG_CLASSES - discovered_names
    assert not missing, f"Dynamic scan missed: {missing}"


def test_dynamic_config_classes_have_default_values():
    """Every discovered config must have a default_values() method."""
    from web.scripts.generate_types import discover_config_classes

    for name, cls in discover_config_classes():
        assert hasattr(cls, "default_values"), f"{name} has no default_values()"
        inst = cls.default_values()
        assert hasattr(inst, "to_dict"), f"{name}.default_values() has no to_dict()"


# _auto_label tests

def test_auto_label_basic():
    from web.scripts.generate_types import _auto_label

    assert _auto_label("ADAM") == "Adam"
    assert _auto_label("ADAMW") == "AdamW"
    assert _auto_label("PRODIGY") == "Prodigy"


def test_auto_label_acronyms():
    from web.scripts.generate_types import _auto_label

    assert _auto_label("SDXL") == "SDXL"
    assert _auto_label("LORA") == "LoRA"
    assert _auto_label("VAE") == "VAE"


def test_auto_label_version_patterns():
    from web.scripts.generate_types import _auto_label

    assert _auto_label("STABLE_DIFFUSION_15") == "Stable Diffusion 1.5"
    assert _auto_label("STABLE_DIFFUSION_20") == "Stable Diffusion 2.0"


def test_auto_label_underscore_separation():
    from web.scripts.generate_types import _auto_label

    assert _auto_label("LEARNING_RATE") == "Learning Rate"


def test_auto_label_overrides_take_precedence():
    """ENUM_DISPLAY_LABELS overrides should differ from auto-labels for curated values."""
    from web.scripts.generate_types import _auto_label
    from web.scripts.ui_metadata import ENUM_DISPLAY_LABELS

    sd15_auto = _auto_label("STABLE_DIFFUSION_15")
    sd15_override = ENUM_DISPLAY_LABELS.get("ModelType", {}).get("STABLE_DIFFUSION_15")
    assert sd15_override is not None
    assert sd15_override != sd15_auto


# _auto_tooltip tests

def test_auto_tooltip_basic():
    from web.scripts.generate_types import _auto_tooltip

    assert _auto_tooltip("learning_rate") == "Learning rate"
    assert _auto_tooltip("batch_size") == "Batch size"


def test_auto_tooltip_nested():
    from web.scripts.generate_types import _auto_tooltip

    assert _auto_tooltip("text_encoder.weight_dtype") == "Text encoder weight dtype"


def test_auto_tooltip_empty_string():
    from web.scripts.generate_types import _auto_tooltip

    assert _auto_tooltip("") == ""
