"""
Type generation script for OneTrainerWeb.

Introspects Python BaseConfig classes and enums to generate TypeScript types.
Requires the full OneTrainer Python environment (torch, diffusers, etc.)
because BaseConfig stores metadata in runtime dicts populated during __init__.

Usage:
    python web/scripts/generate_types.py

Output (committed to repo):
    web/gui/src/renderer/types/generated/enums.ts
    web/gui/src/renderer/types/generated/config.ts
    web/gui/src/renderer/types/generated/metadata.ts
"""

import importlib
import inspect
import json
import os
import sys
from enum import Enum
from typing import Any, get_args, get_origin

# Add project root to path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, PROJECT_ROOT)

from modules.util.config.BaseConfig import BaseConfig
from modules.util.type_util import issubclass_safe

# Output directory
OUTPUT_DIR = os.path.join(
    PROJECT_ROOT, "web", "gui", "src", "renderer", "types", "generated"
)

# All enum modules to introspect
ENUM_MODULES = [
    "modules.util.enum.AudioFormat",
    "modules.util.enum.BalancingStrategy",
    "modules.util.enum.CloudAction",
    "modules.util.enum.CloudFileSync",
    "modules.util.enum.CloudType",
    "modules.util.enum.ConceptType",
    "modules.util.enum.ConfigPart",
    "modules.util.enum.DataType",
    "modules.util.enum.EMAMode",
    "modules.util.enum.FileType",
    "modules.util.enum.GenerateCaptionsModel",
    "modules.util.enum.GenerateMasksModel",
    "modules.util.enum.GradientCheckpointingMethod",
    "modules.util.enum.GradientReducePrecision",
    "modules.util.enum.ImageFormat",
    "modules.util.enum.LearningRateScaler",
    "modules.util.enum.LearningRateScheduler",
    "modules.util.enum.LossScaler",
    "modules.util.enum.LossWeight",
    "modules.util.enum.ModelFormat",
    "modules.util.enum.ModelType",
    "modules.util.enum.NoiseScheduler",
    "modules.util.enum.Optimizer",
    "modules.util.enum.TimestepDistribution",
    "modules.util.enum.TimeUnit",
    "modules.util.enum.TrainingMethod",
    "modules.util.enum.VideoFormat",
]

# Config classes to generate interfaces for
CONFIG_IMPORTS = [
    ("modules.util.config.TrainConfig", "TrainConfig"),
    ("modules.util.config.TrainConfig", "TrainOptimizerConfig"),
    ("modules.util.config.TrainConfig", "TrainModelPartConfig"),
    ("modules.util.config.TrainConfig", "TrainEmbeddingConfig"),
    ("modules.util.config.TrainConfig", "QuantizationConfig"),
    ("modules.util.config.ConceptConfig", "ConceptConfig"),
    ("modules.util.config.ConceptConfig", "ConceptImageConfig"),
    ("modules.util.config.ConceptConfig", "ConceptTextConfig"),
    ("modules.util.config.SampleConfig", "SampleConfig"),
    ("modules.util.config.CloudConfig", "CloudConfig"),
    ("modules.util.config.CloudConfig", "CloudSecretsConfig"),
    ("modules.util.config.SecretsConfig", "SecretsConfig"),
]


def collect_enums() -> list[tuple[str, type]]:
    """Import all enum modules and collect enum classes."""
    enums = []
    for module_path in ENUM_MODULES:
        mod = importlib.import_module(module_path)
        for name, obj in inspect.getmembers(mod, inspect.isclass):
            if issubclass(obj, Enum) and obj is not Enum:
                enums.append((name, obj))
    return enums


def collect_configs() -> list[tuple[str, type]]:
    """Import all config classes."""
    configs = []
    seen = set()
    for module_path, class_name in CONFIG_IMPORTS:
        if class_name in seen:
            continue
        seen.add(class_name)
        mod = importlib.import_module(module_path)
        cls = getattr(mod, class_name)
        configs.append((class_name, cls))
    return configs


def python_type_to_ts(py_type: type, nullable: bool, enum_names: set[str]) -> str:
    """Convert a Python type annotation to a TypeScript type string."""
    if py_type is str:
        ts = "string"
    elif py_type is bool:
        ts = "boolean"
    elif py_type is int or py_type is float:
        ts = "number"
    elif py_type is dict:
        ts = "Record<string, unknown>"
    elif issubclass_safe(py_type, Enum):
        ts = py_type.__name__
    elif issubclass_safe(py_type, BaseConfig):
        ts = py_type.__name__
    elif py_type is list or get_origin(py_type) is list:
        args = get_args(py_type)
        if args:
            inner = args[0]
            if issubclass_safe(inner, BaseConfig):
                ts = f"{inner.__name__}[]"
            elif issubclass_safe(inner, Enum):
                ts = f"{inner.__name__}[]"
            elif inner is str:
                ts = "string[]"
            elif inner is int or inner is float:
                ts = "number[]"
            elif inner is bool:
                ts = "boolean[]"
            elif get_origin(inner) is dict:
                dict_args = get_args(inner)
                if dict_args and len(dict_args) == 2:
                    key_ts = python_type_to_ts(dict_args[0], False, enum_names)
                    val_ts = python_type_to_ts(dict_args[1], False, enum_names)
                    ts = f"Record<{key_ts}, {val_ts}>[]"
                else:
                    ts = "Record<string, unknown>[]"
            else:
                ts = "unknown[]"
        else:
            ts = "unknown[]"
    elif get_origin(py_type) is dict:
        args = get_args(py_type)
        if args and len(args) == 2:
            key_ts = python_type_to_ts(args[0], False, enum_names)
            val_ts = python_type_to_ts(args[1], False, enum_names)
            ts = f"Record<{key_ts}, {val_ts}>"
        else:
            ts = "Record<string, unknown>"
    else:
        ts = "unknown"

    if nullable:
        ts = f"{ts} | null"

    return ts


def generate_enums_ts(enums: list[tuple[str, type]]) -> str:
    """Generate enums.ts content."""
    lines = [
        "// Auto-generated by web/scripts/generate_types.py",
        "// Do not edit manually. Regenerate when backend enums change.",
        "",
    ]

    for name, enum_cls in sorted(enums, key=lambda x: x[0]):
        members = [m for m in enum_cls]
        lines.append(f"export type {name} =")
        for i, member in enumerate(members):
            separator = ";" if i == len(members) - 1 else ""
            lines.append(f"  | '{member.value}'{separator}")
        lines.append("")

        # Also export a const array of all values for dropdowns
        lines.append(f"export const {name}Values: {name}[] = [")
        for member in members:
            lines.append(f"  '{member.value}',")
        lines.append("];")
        lines.append("")

    return "\n".join(lines)


def generate_config_ts(
    configs: list[tuple[str, type]], enum_names: set[str]
) -> str:
    """Generate config.ts content with TypeScript interfaces."""
    lines = [
        "// Auto-generated by web/scripts/generate_types.py",
        "// Do not edit manually. Regenerate when backend config classes change.",
        "",
        "import type {",
    ]

    # Import all enum types that are used
    used_enums = set()
    for class_name, cls in configs:
        instance = cls.default_values()
        for field_name, field_type in instance.types.items():
            if issubclass_safe(field_type, Enum):
                used_enums.add(field_type.__name__)
            elif get_origin(field_type) is list:
                args = get_args(field_type)
                if args and issubclass_safe(args[0], Enum):
                    used_enums.add(args[0].__name__)
            elif get_origin(field_type) is dict:
                args = get_args(field_type)
                if args:
                    for arg in args:
                        if issubclass_safe(arg, Enum):
                            used_enums.add(arg.__name__)

    for enum_name in sorted(used_enums):
        lines.append(f"  {enum_name},")
    lines.append("} from './enums';")
    lines.append("")

    # Generate interfaces in dependency order
    generated = set()

    def generate_interface(class_name: str, cls: type):
        if class_name in generated:
            return ""
        generated.add(class_name)

        result_lines = []

        # First generate any nested BaseConfig dependencies
        instance = cls.default_values()
        for field_name, field_type in instance.types.items():
            if issubclass_safe(field_type, BaseConfig) and field_type.__name__ not in generated:
                # Find the class in our configs list
                for cn, cc in configs:
                    if cn == field_type.__name__:
                        dep = generate_interface(cn, cc)
                        if dep:
                            result_lines.append(dep)
                        break
            elif get_origin(field_type) is list:
                args = get_args(field_type)
                if args and issubclass_safe(args[0], BaseConfig) and args[0].__name__ not in generated:
                    for cn, cc in configs:
                        if cn == args[0].__name__:
                            dep = generate_interface(cn, cc)
                            if dep:
                                result_lines.append(dep)
                            break
            elif get_origin(field_type) is dict:
                args = get_args(field_type)
                if args and len(args) > 1 and issubclass_safe(args[1], BaseConfig) and args[1].__name__ not in generated:
                    for cn, cc in configs:
                        if cn == args[1].__name__:
                            dep = generate_interface(cn, cc)
                            if dep:
                                result_lines.append(dep)
                            break

        iface_lines = [f"export interface {class_name} {{"]

        for field_name in instance.types:
            field_type = instance.types[field_name]
            nullable = instance.nullables.get(field_name, False)
            ts_type = python_type_to_ts(field_type, nullable, enum_names)
            iface_lines.append(f"  {field_name}: {ts_type};")

        iface_lines.append("}")
        iface_lines.append("")

        result_lines.append("\n".join(iface_lines))
        return "\n".join(result_lines)

    for class_name, cls in configs:
        result = generate_interface(class_name, cls)
        if result:
            lines.append(result)

    return "\n".join(lines)


def generate_metadata_ts(
    configs: list[tuple[str, type]], enum_names: set[str]
) -> str:
    """Generate metadata.ts with field metadata for form validation."""
    lines = [
        "// Auto-generated by web/scripts/generate_types.py",
        "// Do not edit manually. Regenerate when backend config classes change.",
        "",
        "export interface FieldMetadata {",
        "  type: 'string' | 'number' | 'boolean' | 'enum' | 'config' | 'list' | 'dict';",
        "  nullable: boolean;",
        "  enumType?: string;",
        "  configType?: string;",
        "  defaultValue: unknown;",
        "}",
        "",
        "export type ConfigMetadata = Record<string, FieldMetadata>;",
        "",
    ]

    for class_name, cls in configs:
        instance = cls.default_values()
        lines.append(f"export const {class_name}Metadata: ConfigMetadata = {{")

        for field_name in instance.types:
            field_type = instance.types[field_name]
            nullable = instance.nullables.get(field_name, False)
            default_value = instance.default_values.get(field_name)

            # Determine meta type
            if field_type is str:
                meta_type = "string"
                enum_type = None
                config_type = None
            elif field_type is bool:
                meta_type = "boolean"
                enum_type = None
                config_type = None
            elif field_type is int or field_type is float:
                meta_type = "number"
                enum_type = None
                config_type = None
            elif issubclass_safe(field_type, Enum):
                meta_type = "enum"
                enum_type = field_type.__name__
                config_type = None
            elif issubclass_safe(field_type, BaseConfig):
                meta_type = "config"
                enum_type = None
                config_type = field_type.__name__
            elif field_type is list or get_origin(field_type) is list:
                meta_type = "list"
                enum_type = None
                config_type = None
                args = get_args(field_type)
                if args and issubclass_safe(args[0], BaseConfig):
                    config_type = args[0].__name__
            elif field_type is dict or get_origin(field_type) is dict:
                meta_type = "dict"
                enum_type = None
                config_type = None
                args = get_args(field_type)
                if args and len(args) > 1 and issubclass_safe(args[1], BaseConfig):
                    config_type = args[1].__name__
            else:
                meta_type = "string"
                enum_type = None
                config_type = None

            # Serialize default value
            if default_value is None:
                default_json = "null"
            elif isinstance(default_value, bool):
                default_json = "true" if default_value else "false"
            elif isinstance(default_value, (int, float)):
                if default_value == float("inf"):
                    default_json = '"Infinity"'
                elif default_value == float("-inf"):
                    default_json = '"-Infinity"'
                else:
                    default_json = json.dumps(default_value)
            elif isinstance(default_value, str):
                default_json = json.dumps(default_value)
            elif isinstance(default_value, Enum):
                default_json = json.dumps(str(default_value))
            elif isinstance(default_value, BaseConfig):
                default_json = "null"  # nested configs handled separately
            elif isinstance(default_value, list):
                default_json = "[]"
            elif isinstance(default_value, dict):
                default_json = "{}"
            else:
                default_json = "null"

            enum_str = f', enumType: "{enum_type}"' if enum_type else ""
            config_str = f', configType: "{config_type}"' if config_type else ""

            lines.append(
                f'  {field_name}: {{ type: "{meta_type}", nullable: {str(nullable).lower()}'
                f"{enum_str}{config_str}, defaultValue: {default_json} }},"
            )

        lines.append("};")
        lines.append("")

    return "\n".join(lines)


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("Collecting enums...")
    enums = collect_enums()
    print(f"  Found {len(enums)} enum types")

    print("Collecting config classes...")
    configs = collect_configs()
    print(f"  Found {len(configs)} config classes")

    enum_names = {name for name, _ in enums}

    # Generate enums.ts
    print("Generating enums.ts...")
    enums_content = generate_enums_ts(enums)
    enums_path = os.path.join(OUTPUT_DIR, "enums.ts")
    with open(enums_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(enums_content)
    print(f"  Wrote {enums_path}")

    # Generate config.ts
    print("Generating config.ts...")
    config_content = generate_config_ts(configs, enum_names)
    config_path = os.path.join(OUTPUT_DIR, "config.ts")
    with open(config_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(config_content)
    print(f"  Wrote {config_path}")

    # Generate metadata.ts
    print("Generating metadata.ts...")
    metadata_content = generate_metadata_ts(configs, enum_names)
    metadata_path = os.path.join(OUTPUT_DIR, "metadata.ts")
    with open(metadata_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(metadata_content)
    print(f"  Wrote {metadata_path}")

    # Print summary statistics
    total_enum_values = sum(len(list(cls)) for _, cls in enums)
    total_config_fields = 0
    for class_name, cls in configs:
        instance = cls.default_values()
        total_config_fields += len(instance.types)

    print(f"\nSummary:")
    print(f"  {len(enums)} enum types with {total_enum_values} total values")
    print(f"  {len(configs)} config interfaces with {total_config_fields} total fields")
    print("Done!")


if __name__ == "__main__":
    main()
