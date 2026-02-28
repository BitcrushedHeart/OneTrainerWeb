import json
import os
import sys

import pytest

# Ensure project root is importable
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, PROJECT_ROOT)

from modules.util.config.TrainConfig import TrainConfig

# Discover all preset files at collection time
PRESETS_DIR = os.path.join(PROJECT_ROOT, "training_presets")

PRESET_FILES = sorted(
    [
        f
        for f in os.listdir(PRESETS_DIR)
        if f.endswith(".json")
    ]
)

# Sanity-check: we expect a non-trivial number of presets.
assert len(PRESET_FILES) > 0, f"No preset files found in {PRESETS_DIR}"


def _load_preset_json(filename: str) -> dict:
    path = os.path.join(PRESETS_DIR, filename)
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _apply_preset_to_default(preset_data: dict) -> TrainConfig:
    config = TrainConfig.default_values()
    return config.from_dict(preset_data)


def _normalize_config_dict(d: dict) -> dict:
    config = TrainConfig.default_values()
    config.from_dict(d)
    return config.to_dict()


def _deep_compare_dicts(d1: dict, d2: dict, path: str = "") -> list[str]:
    diffs = []
    all_keys = set(d1.keys()) | set(d2.keys())
    for key in sorted(all_keys):
        current_path = f"{path}.{key}" if path else key
        if key not in d1:
            diffs.append(f"MISSING in first:  {current_path} (value in second: {d2[key]!r})")
        elif key not in d2:
            diffs.append(f"MISSING in second: {current_path} (value in first: {d1[key]!r})")
        elif isinstance(d1[key], dict) and isinstance(d2[key], dict):
            diffs.extend(_deep_compare_dicts(d1[key], d2[key], current_path))
        elif isinstance(d1[key], list) and isinstance(d2[key], list):
            if len(d1[key]) != len(d2[key]):
                diffs.append(
                    f"LIST LENGTH MISMATCH at {current_path}: "
                    f"{len(d1[key])} vs {len(d2[key])}"
                )
            else:
                for i, (v1, v2) in enumerate(zip(d1[key], d2[key], strict=False)):
                    item_path = f"{current_path}[{i}]"
                    if isinstance(v1, dict) and isinstance(v2, dict):
                        diffs.extend(_deep_compare_dicts(v1, v2, item_path))
                    elif v1 != v2:
                        diffs.append(f"DIFF at {item_path}: {v1!r} != {v2!r}")
        elif d1[key] != d2[key]:
            diffs.append(f"DIFF at {current_path}: {d1[key]!r} != {d2[key]!r}")
    return diffs


# 1. Preset round-trip tests (parametrize over every preset file)

@pytest.mark.parametrize("preset_filename", PRESET_FILES, ids=PRESET_FILES)
class TestPresetRoundTrip:
    def test_roundtrip_idempotent(self, preset_filename: str):
        raw = _load_preset_json(preset_filename)

        # Built-in presets skip migrations
        if preset_filename.startswith("#"):
            raw["__version"] = TrainConfig.default_values().config_version

        # First pass: raw preset -> default config -> serialize -> normalize
        config1 = TrainConfig.default_values()
        config1.from_dict(raw)
        serialize_1 = _normalize_config_dict(config1.to_dict())

        # Second pass: serialize_1 -> fresh default config -> serialize
        config2 = TrainConfig.default_values()
        config2.from_dict(serialize_1)
        serialize_2 = config2.to_dict()

        diffs = _deep_compare_dicts(serialize_1, serialize_2)
        assert not diffs, (
            f"Round-trip produced differences for preset '{preset_filename}':\n"
            + "\n".join(diffs)
        )

    def test_roundtrip_preserves_preset_values(self, preset_filename: str):
        raw = _load_preset_json(preset_filename)

        if preset_filename.startswith("#"):
            raw_for_load = {**raw, "__version": TrainConfig.default_values().config_version}
        else:
            raw_for_load = raw

        config = TrainConfig.default_values()
        config.from_dict(raw_for_load)
        output = config.to_dict()

        for key, expected_value in raw.items():
            if key.startswith("__"):
                continue
            # Only check scalar values (not nested dicts/lists which have
            # sub-config logic that fills in defaults).
            if isinstance(expected_value, (str, int, float, bool)):
                # Keys that were renamed by schema migrations (e.g.
                # weight_dtype -> train_dtype) are silently consumed by
                # from_dict but will not appear in the output under the
                # old name.  Skip them.
                if key not in output:
                    continue
                actual = output[key]
                # Enum values are stored as strings in preset JSON
                # and may be serialised differently (e.g. "ModelType.X" vs "X")
                if isinstance(actual, str) and isinstance(expected_value, str):
                    # The enum serialisation puts the enum class prefix on,
                    # so we compare the tail after the last dot.
                    actual_tail = actual.rsplit(".", 1)[-1] if "." in actual else actual
                    expected_tail = expected_value.rsplit(".", 1)[-1] if "." in expected_value else expected_value
                    assert actual_tail == expected_tail, (
                        f"Value mismatch for key '{key}' in preset '{preset_filename}': "
                        f"{actual!r} != {expected_value!r}"
                    )
                else:
                    assert actual == expected_value, (
                        f"Value mismatch for key '{key}' in preset '{preset_filename}': "
                        f"{actual!r} != {expected_value!r}"
                    )


# 2. Default config round-trip

class TestDefaultConfigRoundTrip:
    def test_default_roundtrip(self):
        # Normalize: default -> to_dict -> from_dict -> to_dict
        serialize_1 = _normalize_config_dict(
            TrainConfig.default_values().to_dict()
        )

        # Second pass: serialize_1 -> from_dict -> to_dict
        config2 = TrainConfig.default_values()
        config2.from_dict(serialize_1)
        serialize_2 = config2.to_dict()

        diffs = _deep_compare_dicts(serialize_1, serialize_2)
        assert not diffs, (
            "Default config round-trip produced differences:\n"
            + "\n".join(diffs)
        )

    def test_default_triple_roundtrip(self):
        config = TrainConfig.default_values()
        d1 = config.to_dict()

        for _ in range(3):
            config = TrainConfig.default_values()
            config.from_dict(d1)
            d1 = config.to_dict()

        final_config = TrainConfig.default_values()
        final_config.from_dict(d1)
        d_final = final_config.to_dict()

        diffs = _deep_compare_dicts(d1, d_final)
        assert not diffs, (
            "Triple round-trip produced differences:\n" + "\n".join(diffs)
        )

    def test_default_has_version(self):
        config = TrainConfig.default_values()
        d = config.to_dict()
        assert "__version" in d
        assert d["__version"] == 10

    def test_default_has_expected_top_level_keys(self):
        config = TrainConfig.default_values()
        d = config.to_dict()
        expected_keys = [
            "training_method", "model_type", "base_model_name",
            "learning_rate", "batch_size", "epochs",
            "optimizer", "unet", "text_encoder", "vae",
            "resolution", "train_dtype",
        ]
        for key in expected_keys:
            assert key in d, f"Expected key '{key}' not found in default config dict"


# 3. to_settings_dict() round-trip

class TestSettingsDictRoundTrip:
    def test_settings_dict_roundtrip(self):
        config = TrainConfig.default_values()
        settings_1 = config.to_settings_dict(secrets=False)

        config2 = TrainConfig.default_values()
        config2.from_dict(settings_1)
        settings_2 = config2.to_settings_dict(secrets=False)

        diffs = _deep_compare_dicts(settings_1, settings_2)
        assert not diffs, (
            "settings_dict round-trip produced differences:\n"
            + "\n".join(diffs)
        )

    def test_settings_dict_strips_concepts(self):
        config = TrainConfig.default_values()
        settings = config.to_settings_dict(secrets=False)
        assert settings.get("concepts") is None

    def test_settings_dict_strips_samples(self):
        config = TrainConfig.default_values()
        settings = config.to_settings_dict(secrets=False)
        assert settings.get("samples") is None

    def test_settings_dict_excludes_secrets(self):
        config = TrainConfig.default_values()
        settings = config.to_settings_dict(secrets=False)
        assert "secrets" not in settings

    def test_settings_dict_includes_secrets_when_asked(self):
        config = TrainConfig.default_values()
        settings = config.to_settings_dict(secrets=True)
        assert "secrets" in settings

    @pytest.mark.parametrize("preset_filename", PRESET_FILES, ids=PRESET_FILES)
    def test_settings_dict_roundtrip_with_preset(self, preset_filename: str):
        raw = _load_preset_json(preset_filename)
        if preset_filename.startswith("#"):
            raw["__version"] = TrainConfig.default_values().config_version

        config1 = TrainConfig.default_values()
        config1.from_dict(raw)
        settings_1 = config1.to_settings_dict(secrets=False)

        config2 = TrainConfig.default_values()
        config2.from_dict(settings_1)
        settings_2 = config2.to_settings_dict(secrets=False)

        diffs = _deep_compare_dicts(settings_1, settings_2)
        assert not diffs, (
            f"settings_dict round-trip failed for preset '{preset_filename}':\n"
            + "\n".join(diffs)
        )


# 4. to_pack_dict() round-trip  (limited -- needs concept/sample files)

class TestPackDictRoundTrip:
    def test_pack_dict_roundtrip_with_inline_data(self):
        from modules.util.config.ConceptConfig import ConceptConfig
        from modules.util.config.SampleConfig import SampleConfig

        config = TrainConfig.default_values()
        # Set inline concepts and samples so to_pack_dict does not try
        # to read from filesystem.
        config.concepts = [ConceptConfig.default_values()]
        config.samples = [SampleConfig.default_values()]

        pack_1 = config.to_pack_dict(secrets=False)

        config2 = TrainConfig.default_values()
        config2.from_dict(pack_1)
        # Re-populate inline data for second round
        _ = config2.concepts
        _ = config2.samples
        pack_2 = config2.to_pack_dict(secrets=False)

        diffs = _deep_compare_dicts(pack_1, pack_2)
        assert not diffs, (
            "pack_dict round-trip produced differences:\n"
            + "\n".join(diffs)
        )

    def test_pack_dict_contains_concepts_and_samples(self):
        from modules.util.config.ConceptConfig import ConceptConfig
        from modules.util.config.SampleConfig import SampleConfig

        config = TrainConfig.default_values()
        config.concepts = [ConceptConfig.default_values()]
        config.samples = [SampleConfig.default_values()]

        pack = config.to_pack_dict(secrets=False)

        assert pack.get("concepts") is not None, "pack_dict should include concepts"
        assert pack.get("samples") is not None, "pack_dict should include samples"
        assert isinstance(pack["concepts"], list)
        assert isinstance(pack["samples"], list)
        assert len(pack["concepts"]) == 1
        assert len(pack["samples"]) == 1

    def test_pack_dict_excludes_secrets(self):
        from modules.util.config.ConceptConfig import ConceptConfig
        from modules.util.config.SampleConfig import SampleConfig

        config = TrainConfig.default_values()
        config.concepts = [ConceptConfig.default_values()]
        config.samples = [SampleConfig.default_values()]

        pack = config.to_pack_dict(secrets=False)
        assert "secrets" not in pack


# 5. JSON serialisation fidelity

class TestJsonFidelity:
    def test_default_json_roundtrip(self):
        # Normalize first (see _normalize_config_dict for rationale)
        d1 = _normalize_config_dict(TrainConfig.default_values().to_dict())

        json_str = json.dumps(d1)
        d_from_json = json.loads(json_str)

        config2 = TrainConfig.default_values()
        config2.from_dict(d_from_json)
        d2 = config2.to_dict()

        diffs = _deep_compare_dicts(d1, d2)
        assert not diffs, (
            "JSON round-trip produced differences:\n" + "\n".join(diffs)
        )

    @pytest.mark.parametrize("preset_filename", PRESET_FILES, ids=PRESET_FILES)
    def test_preset_json_roundtrip(self, preset_filename: str):
        raw = _load_preset_json(preset_filename)
        if preset_filename.startswith("#"):
            raw["__version"] = TrainConfig.default_values().config_version

        # Normalize first pass (see _normalize_config_dict for rationale)
        config1 = TrainConfig.default_values()
        config1.from_dict(raw)
        d1 = _normalize_config_dict(config1.to_dict())

        json_str = json.dumps(d1)
        d_from_json = json.loads(json_str)

        config2 = TrainConfig.default_values()
        config2.from_dict(d_from_json)
        d2 = config2.to_dict()

        diffs = _deep_compare_dicts(d1, d2)
        assert not diffs, (
            f"JSON round-trip failed for preset '{preset_filename}':\n"
            + "\n".join(diffs)
        )


# 6. Sub-config round-trip tests

class TestSubConfigRoundTrip:
    def test_optimizer_config_roundtrip(self):
        from modules.util.config.TrainConfig import TrainOptimizerConfig
        config = TrainOptimizerConfig.default_values()
        d1 = config.to_dict()

        config2 = TrainOptimizerConfig.default_values()
        config2.from_dict(d1)
        d2 = config2.to_dict()

        diffs = _deep_compare_dicts(d1, d2)
        assert not diffs, (
            "TrainOptimizerConfig round-trip differences:\n" + "\n".join(diffs)
        )

    def test_model_part_config_roundtrip(self):
        from modules.util.config.TrainConfig import TrainModelPartConfig
        config = TrainModelPartConfig.default_values()
        d1 = config.to_dict()

        config2 = TrainModelPartConfig.default_values()
        config2.from_dict(d1)
        d2 = config2.to_dict()

        diffs = _deep_compare_dicts(d1, d2)
        assert not diffs, (
            "TrainModelPartConfig round-trip differences:\n" + "\n".join(diffs)
        )

    def test_embedding_config_roundtrip(self):
        from modules.util.config.TrainConfig import TrainEmbeddingConfig
        config = TrainEmbeddingConfig.default_values()
        d1 = config.to_dict()

        config2 = TrainEmbeddingConfig.default_values()
        config2.from_dict(d1)
        d2 = config2.to_dict()

        diffs = _deep_compare_dicts(d1, d2)
        assert not diffs, (
            "TrainEmbeddingConfig round-trip differences:\n" + "\n".join(diffs)
        )

    def test_concept_config_roundtrip(self):
        from modules.util.config.ConceptConfig import ConceptConfig
        config = ConceptConfig.default_values()
        d1 = config.to_dict()

        config2 = ConceptConfig.default_values()
        config2.from_dict(d1)
        d2 = config2.to_dict()

        diffs = _deep_compare_dicts(d1, d2)
        assert not diffs, (
            "ConceptConfig round-trip differences:\n" + "\n".join(diffs)
        )

    def test_sample_config_roundtrip(self):
        from modules.util.config.SampleConfig import SampleConfig
        config = SampleConfig.default_values()
        d1 = config.to_dict()

        config2 = SampleConfig.default_values()
        config2.from_dict(d1)
        d2 = config2.to_dict()

        diffs = _deep_compare_dicts(d1, d2)
        assert not diffs, (
            "SampleConfig round-trip differences:\n" + "\n".join(diffs)
        )

    def test_cloud_config_roundtrip(self):
        from modules.util.config.CloudConfig import CloudConfig
        config = CloudConfig.default_values()
        d1 = config.to_dict()

        config2 = CloudConfig.default_values()
        config2.from_dict(d1)
        d2 = config2.to_dict()

        diffs = _deep_compare_dicts(d1, d2)
        assert not diffs, (
            "CloudConfig round-trip differences:\n" + "\n".join(diffs)
        )

    def test_secrets_config_roundtrip(self):
        from modules.util.config.SecretsConfig import SecretsConfig
        # Normalize first (SecretsConfig contains CloudSecretsConfig which
        # has a port field with mismatched default type -- see _normalize_config_dict)
        config = SecretsConfig.default_values()
        raw = config.to_dict()
        config_norm = SecretsConfig.default_values()
        config_norm.from_dict(raw)
        d1 = config_norm.to_dict()

        config2 = SecretsConfig.default_values()
        config2.from_dict(d1)
        d2 = config2.to_dict()

        diffs = _deep_compare_dicts(d1, d2)
        assert not diffs, (
            "SecretsConfig round-trip differences:\n" + "\n".join(diffs)
        )

    def test_quantization_config_roundtrip(self):
        from modules.util.config.TrainConfig import QuantizationConfig
        config = QuantizationConfig.default_values()
        d1 = config.to_dict()

        config2 = QuantizationConfig.default_values()
        config2.from_dict(d1)
        d2 = config2.to_dict()

        diffs = _deep_compare_dicts(d1, d2)
        assert not diffs, (
            "QuantizationConfig round-trip differences:\n" + "\n".join(diffs)
        )
