# Upstream Sync Tooling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build tooling and documentation so pulling upstream OneTrainer changes and regenerating TypeScript types is a single command with automatic gap detection.

**Architecture:** Modify `generate_types.py` to discover enums/configs by scanning directories instead of hardcoded lists. Add auto-label and auto-tooltip generation so `ui_metadata.py` becomes an override layer. Create `sync_upstream.py` as the AIO orchestrator. Write `SYNCING.md` for maintainers.

**Tech Stack:** Python 3.12 (stdlib only — no new deps), existing pytest + vitest + tsc toolchain.

---

### Task 1: Snapshot current generated output

Before modifying the generator, capture current output as a regression baseline.

**Files:**
- Create: `web/scripts/tests/baseline_enums.txt`
- Create: `web/scripts/tests/baseline_configs.txt`

**Step 1: Write a script to dump current discovery results**

```python
# In a temporary test — run from project root
import sys, os
sys.path.insert(0, os.path.abspath("."))
from web.scripts.generate_types import collect_enums, collect_configs

print("=== ENUMS ===")
for name, cls in sorted(collect_enums(), key=lambda x: x[0]):
    print(f"  {name}: {[e.value for e in cls]}")

print("\n=== CONFIGS ===")
for name, cls in sorted(collect_configs(), key=lambda x: x[0]):
    inst = cls.default_values()
    print(f"  {name}: {sorted(inst.to_dict().keys())}")
```

**Step 2: Run it and save output**

Run: `python -c "<above script>" > web/scripts/tests/baseline_discovery.txt 2>&1`

**Step 3: Also snapshot the generated TypeScript files**

Run: `cp -r web/gui/src/renderer/types/generated/ web/scripts/tests/baseline_generated/`

**Step 4: Commit the baseline**

```bash
git add web/scripts/tests/
git commit -m "Snapshot current type generation baseline"
```

---

### Task 2: Add dynamic enum discovery

Replace the hardcoded `ENUM_MODULES` list with directory scanning.

**Files:**
- Modify: `web/scripts/generate_types.py:22-75`

**Step 1: Write a test for dynamic enum discovery**

Create `web/scripts/tests/test_discovery.py`:

```python
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from web.scripts.generate_types import ENUM_MODULES, collect_enums


def test_dynamic_enum_discovery_matches_hardcoded():
    """Dynamic scanning must find at least every enum in the hardcoded list."""
    from web.scripts.generate_types import discover_enum_modules

    discovered = discover_enum_modules()
    hardcoded = set(ENUM_MODULES)

    # Every hardcoded module must be found by scanning
    missing = hardcoded - set(discovered)
    assert not missing, f"Dynamic scan missed: {missing}"


def test_dynamic_enum_discovery_finds_all_enums():
    """Every discovered module must yield at least one Enum subclass."""
    from web.scripts.generate_types import discover_enum_modules

    for module_path in discover_enum_modules():
        import importlib
        from enum import Enum

        mod = importlib.import_module(module_path)
        enums = [
            obj for _, obj in vars(mod).items()
            if isinstance(obj, type) and issubclass(obj, Enum) and obj is not Enum
        ]
        assert len(enums) > 0, f"No Enum found in {module_path}"
```

**Step 2: Run the test — should fail (discover_enum_modules doesn't exist)**

Run: `python -m pytest web/scripts/tests/test_discovery.py -v`
Expected: FAIL — `ImportError: cannot import name 'discover_enum_modules'`

**Step 3: Implement `discover_enum_modules()`**

Add to `web/scripts/generate_types.py` before `ENUM_MODULES`:

```python
ENUM_DIR = os.path.join(PROJECT_ROOT, "modules", "util", "enum")

def discover_enum_modules() -> list[str]:
    """Scan modules/util/enum/ for Python files containing Enum subclasses."""
    modules = []
    for filename in sorted(os.listdir(ENUM_DIR)):
        if filename.startswith("_") or not filename.endswith(".py"):
            continue
        module_name = filename[:-3]  # strip .py
        module_path = f"modules.util.enum.{module_name}"
        modules.append(module_path)
    return modules
```

Then replace `ENUM_MODULES` with:

```python
ENUM_MODULES = discover_enum_modules()

# Safety: known minimum from hardcoded era — abort if scanning finds fewer
_KNOWN_ENUM_MODULES = {
    "modules.util.enum.AudioFormat",
    "modules.util.enum.ModelType",
    "modules.util.enum.Optimizer",
    "modules.util.enum.TrainingMethod",
    "modules.util.enum.DataType",
}
_missing = _KNOWN_ENUM_MODULES - set(ENUM_MODULES)
if _missing:
    raise RuntimeError(f"Dynamic enum scan missed known modules: {_missing}")
```

**Step 4: Run the test**

Run: `python -m pytest web/scripts/tests/test_discovery.py::test_dynamic_enum_discovery_matches_hardcoded -v`
Expected: PASS

**Step 5: Run full type generation and diff against baseline**

Run: `python -m web.scripts.generate_types && diff -r web/gui/src/renderer/types/generated/ web/scripts/tests/baseline_generated/`
Expected: No differences (or only whitespace/ordering differences — investigate any)

**Step 6: Commit**

```bash
git add web/scripts/generate_types.py web/scripts/tests/test_discovery.py
git commit -m "Replace hardcoded ENUM_MODULES with directory scanning"
```

---

### Task 3: Add dynamic config discovery

Replace the hardcoded `CONFIG_IMPORTS` list with scanning.

**Files:**
- Modify: `web/scripts/generate_types.py:52-88`
- Modify: `web/scripts/tests/test_discovery.py`

**Step 1: Write a test for dynamic config discovery**

Add to `web/scripts/tests/test_discovery.py`:

```python
def test_dynamic_config_discovery_matches_hardcoded():
    """Dynamic scanning must find at least every config in the hardcoded list."""
    from web.scripts.generate_types import CONFIG_IMPORTS, discover_config_classes

    discovered_names = {name for name, _ in discover_config_classes()}
    hardcoded_names = {class_name for _, class_name in CONFIG_IMPORTS}

    missing = hardcoded_names - discovered_names
    assert not missing, f"Dynamic scan missed: {missing}"


def test_dynamic_config_classes_have_default_values():
    """Every discovered config must have a default_values() method."""
    from web.scripts.generate_types import discover_config_classes

    for name, cls in discover_config_classes():
        assert hasattr(cls, "default_values"), f"{name} has no default_values()"
        inst = cls.default_values()
        assert hasattr(inst, "to_dict"), f"{name}.default_values() has no to_dict()"
```

**Step 2: Run the test — should fail**

Run: `python -m pytest web/scripts/tests/test_discovery.py::test_dynamic_config_discovery_matches_hardcoded -v`
Expected: FAIL — `ImportError: cannot import name 'discover_config_classes'`

**Step 3: Implement `discover_config_classes()`**

Add to `generate_types.py`:

```python
CONFIG_DIR = os.path.join(PROJECT_ROOT, "modules", "util", "config")

def discover_config_classes() -> list[tuple[str, type]]:
    """Scan modules/util/config/ for BaseConfig subclasses with default_values()."""
    configs = []
    seen = set()
    for filename in sorted(os.listdir(CONFIG_DIR)):
        if filename.startswith("_") or not filename.endswith(".py"):
            continue
        module_name = filename[:-3]
        module_path = f"modules.util.config.{module_name}"
        try:
            mod = importlib.import_module(module_path)
        except Exception:
            continue
        for attr_name in dir(mod):
            obj = getattr(mod, attr_name)
            if (
                isinstance(obj, type)
                and issubclass_safe(obj, BaseConfig)
                and obj is not BaseConfig
                and hasattr(obj, "default_values")
                and attr_name not in seen
            ):
                seen.add(attr_name)
                configs.append((attr_name, obj))
    return configs
```

Then update the `CONFIG_IMPORTS` area:

```python
# Keep for reference / validation
_KNOWN_CONFIG_CLASSES = {
    "TrainConfig", "TrainOptimizerConfig", "TrainModelPartConfig",
    "TrainEmbeddingConfig", "QuantizationConfig", "ConceptConfig",
    "ConceptImageConfig", "ConceptTextConfig", "SampleConfig",
    "CloudConfig", "CloudSecretsConfig", "SecretsConfig",
}
```

Update `collect_configs()` to use `discover_config_classes()`:

```python
def collect_configs() -> list[tuple[str, type]]:
    configs = discover_config_classes()
    found_names = {name for name, _ in configs}
    missing = _KNOWN_CONFIG_CLASSES - found_names
    if missing:
        raise RuntimeError(f"Dynamic config scan missed known classes: {missing}")
    return configs
```

**Step 4: Run test**

Run: `python -m pytest web/scripts/tests/test_discovery.py -v`
Expected: All 4 tests PASS

**Step 5: Run full type generation and diff against baseline**

Run: `python -m web.scripts.generate_types && diff -r web/gui/src/renderer/types/generated/ web/scripts/tests/baseline_generated/`
Expected: No differences (or only ordering — config classes may come in different order from directory scan vs hardcoded list)

Note: If ordering differs, that's fine — the generated TypeScript interfaces don't depend on order. But verify the content is identical.

**Step 6: Commit**

```bash
git add web/scripts/generate_types.py web/scripts/tests/test_discovery.py
git commit -m "Replace hardcoded CONFIG_IMPORTS with directory scanning"
```

---

### Task 4: Add auto-label generation

Make `generate_enum_labels_ts()` produce labels automatically, with `ui_metadata.py` as an override layer.

**Files:**
- Modify: `web/scripts/generate_types.py:676-715` (the `generate_enum_labels_ts` function)
- Modify: `web/scripts/tests/test_discovery.py`

**Step 1: Write tests for `_auto_label()`**

Add to `web/scripts/tests/test_discovery.py`:

```python
def test_auto_label_basic():
    from web.scripts.generate_types import _auto_label

    assert _auto_label("ADAM") == "Adam"
    assert _auto_label("ADAMW") == "AdamW"


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
    assert _auto_label("PRODIGY") == "Prodigy"


def test_auto_label_overrides_take_precedence():
    """ENUM_DISPLAY_LABELS in ui_metadata.py should override auto-labels."""
    from web.scripts.generate_types import _auto_label
    from web.scripts.ui_metadata import ENUM_DISPLAY_LABELS

    # Check that a known override differs from auto-label
    sd15_auto = _auto_label("STABLE_DIFFUSION_15")
    sd15_override = ENUM_DISPLAY_LABELS.get("ModelType", {}).get("STABLE_DIFFUSION_15")
    # The override should be "SD1.5", which is different from auto
    assert sd15_override is not None
    assert sd15_override != sd15_auto  # "SD1.5" != "Stable Diffusion 1.5"
```

**Step 2: Run tests — should fail**

Run: `python -m pytest web/scripts/tests/test_discovery.py::test_auto_label_basic -v`
Expected: FAIL — `ImportError: cannot import name '_auto_label'`

**Step 3: Implement `_auto_label()`**

Add to `generate_types.py` (before `generate_enum_labels_ts`):

```python
_ACRONYMS = {
    "SDXL", "VAE", "LORA", "GAN", "FP16", "FP32", "BF16", "NF4",
    "CPU", "GPU", "TPU", "EMA", "LR", "GGUF", "BNBFP4", "BNBNF4",
    "RGB", "RGBA", "HDR", "SRT", "JSON", "CSV", "MP3", "MP4", "FLAC",
    "WAV", "OGG", "AVI", "MKV", "WEBM", "GIF", "PNG", "JPG", "JPEG",
    "WEBP", "BMP", "TIFF",
}

_SPECIAL_LABELS = {
    "ADAMW": "AdamW",
    "LORA": "LoRA",
    "ADAFACTOR": "Adafactor",
}

_VERSION_SUFFIXES = {"15": "1.5", "20": "2.0", "21": "2.1", "30": "3.0", "35": "3.5"}


def _auto_label(value: str) -> str:
    """Generate a display label from an enum value string."""
    if value in _SPECIAL_LABELS:
        return _SPECIAL_LABELS[value]

    parts = value.split("_")
    result = []
    for part in parts:
        if part in _ACRONYMS:
            result.append(part)
        elif part in _VERSION_SUFFIXES:
            result.append(_VERSION_SUFFIXES[part])
        elif part.isdigit():
            result.append(part)
        else:
            result.append(part.capitalize())
    return " ".join(result)
```

**Step 4: Run tests**

Run: `python -m pytest web/scripts/tests/test_discovery.py -k "auto_label" -v`
Expected: All auto_label tests PASS

**Step 5: Update `generate_enum_labels_ts()` to use auto-labels with overrides**

Modify the function (around line 676) so that for each enum value:
1. Check `ENUM_DISPLAY_LABELS[enum_class_name][value]` — if present, use it
2. Otherwise, call `_auto_label(value)`

The generated `enumLabels.ts` should be identical for values that have overrides, and have auto-generated labels for any values that don't. Since all current values have overrides, the output should be identical to baseline.

**Step 6: Run full generation and diff**

Run: `python -m web.scripts.generate_types && diff web/gui/src/renderer/types/generated/enumLabels.ts web/scripts/tests/baseline_generated/enumLabels.ts`
Expected: Identical output

**Step 7: Commit**

```bash
git add web/scripts/generate_types.py web/scripts/tests/test_discovery.py
git commit -m "Add _auto_label for enum display names with override support"
```

---

### Task 5: Add auto-tooltip generation

Make `generate_tooltips_ts()` produce fallback tooltips, with `FIELD_TOOLTIPS` as an override.

**Files:**
- Modify: `web/scripts/generate_types.py:746-775`
- Modify: `web/scripts/tests/test_discovery.py`

**Step 1: Write tests for `_auto_tooltip()`**

Add to `web/scripts/tests/test_discovery.py`:

```python
def test_auto_tooltip_basic():
    from web.scripts.generate_types import _auto_tooltip

    assert _auto_tooltip("learning_rate") == "Learning rate"
    assert _auto_tooltip("batch_size") == "Batch size"


def test_auto_tooltip_nested():
    from web.scripts.generate_types import _auto_tooltip

    assert _auto_tooltip("text_encoder.weight_dtype") == "Text encoder weight dtype"


def test_auto_tooltip_empty_for_obvious():
    from web.scripts.generate_types import _auto_tooltip

    # Single-word fields like "optimizer" are obvious enough
    result = _auto_tooltip("optimizer")
    assert isinstance(result, str)
```

**Step 2: Run tests — should fail**

Run: `python -m pytest web/scripts/tests/test_discovery.py::test_auto_tooltip_basic -v`
Expected: FAIL

**Step 3: Implement `_auto_tooltip()`**

```python
def _auto_tooltip(field_path: str) -> str:
    """Generate a tooltip from a dot-notation field path."""
    readable = field_path.replace(".", " ").replace("_", " ")
    return readable[:1].upper() + readable[1:] if readable else ""
```

**Step 4: Update `generate_tooltips_ts()` to merge auto and curated**

For each config field discovered via metadata:
1. Check `FIELD_TOOLTIPS[field_path]` — if present, use it
2. Otherwise, call `_auto_tooltip(field_path)`

Since all current fields with tooltips are in `FIELD_TOOLTIPS`, the output should be identical plus any new fields that didn't previously have tooltips (which would get auto-generated ones).

**Step 5: Run full generation and diff**

Run: `python -m web.scripts.generate_types && diff web/gui/src/renderer/types/generated/tooltips.ts web/scripts/tests/baseline_generated/tooltips.ts`
Expected: Identical for existing entries. New entries (if any) will have auto-tooltips.

**Step 6: Commit**

```bash
git add web/scripts/generate_types.py web/scripts/tests/test_discovery.py
git commit -m "Add _auto_tooltip for config fields with override support"
```

---

### Task 6: Create sync_upstream.py

**Files:**
- Create: `web/scripts/sync_upstream.py`

**Step 1: Create the script**

```python
"""
AIO upstream sync: fetch, regenerate types, detect gaps, run tests.

Usage:
    python -m web.scripts.sync_upstream              # full sync
    python -m web.scripts.sync_upstream --check      # dry-run (no tests)
    python -m web.scripts.sync_upstream --no-fetch   # skip git fetch
"""

import argparse
import os
import subprocess
import sys

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
os.chdir(PROJECT_ROOT)


def run(cmd: list[str], check: bool = True, capture: bool = False) -> subprocess.CompletedProcess:
    """Run a command, printing it first."""
    print(f"  $ {' '.join(cmd)}")
    return subprocess.run(cmd, check=check, capture_output=capture, text=True)


def phase_fetch() -> list[str]:
    """Fetch upstream and show new commits."""
    print("\n[1/6] Fetching upstream...")
    run(["git", "fetch", "upstream"])

    result = run(
        ["git", "log", "--oneline", "HEAD..upstream/master"],
        capture=True,
        check=False,
    )
    new_commits = result.stdout.strip().splitlines() if result.stdout.strip() else []
    if new_commits:
        print(f"  {len(new_commits)} new upstream commits:")
        for line in new_commits[:20]:
            print(f"    {line}")
        if len(new_commits) > 20:
            print(f"    ... and {len(new_commits) - 20} more")
    else:
        print("  Already up to date.")
    return new_commits


def phase_diff() -> dict[str, list[str]]:
    """Show what changed in key directories."""
    print("\n[2/6] Detecting changes in key directories...")
    areas = {
        "enums": "modules/util/enum/",
        "configs": "modules/util/config/",
        "ui": "modules/ui/",
    }
    changes: dict[str, list[str]] = {}
    for label, path in areas.items():
        result = run(
            ["git", "diff", "--name-only", "HEAD..upstream/master", "--", path],
            capture=True,
            check=False,
        )
        files = [f for f in result.stdout.strip().splitlines() if f]
        if files:
            changes[label] = files
            print(f"  {label}: {len(files)} file(s) changed")
            for f in files:
                print(f"    {f}")
        else:
            print(f"  {label}: no changes")
    return changes


def phase_generate() -> bool:
    """Run type generation."""
    print("\n[3/6] Running type generation...")
    result = run(
        [sys.executable, "-m", "web.scripts.generate_types"],
        check=False,
    )
    if result.returncode != 0:
        print("  TYPE GENERATION FAILED")
        return False
    print("  Type generation succeeded.")

    # Show what changed
    diff = run(
        ["git", "diff", "--stat", "--", "web/gui/src/renderer/types/generated/"],
        capture=True,
        check=False,
    )
    if diff.stdout.strip():
        print(f"  Generated file changes:\n{diff.stdout}")
    else:
        print("  No changes to generated files.")
    return True


def phase_metadata_gaps() -> list[str]:
    """Check for enum values missing from ui_metadata.py overrides."""
    print("\n[4/6] Checking metadata coverage...")
    warnings: list[str] = []

    sys.path.insert(0, PROJECT_ROOT)
    from web.scripts.generate_types import collect_enums, _auto_label
    from web.scripts.ui_metadata import ENUM_DISPLAY_LABELS

    for enum_name, enum_cls in collect_enums():
        overrides = ENUM_DISPLAY_LABELS.get(enum_name, {})
        for member in enum_cls:
            if member.value not in overrides:
                auto = _auto_label(member.value)
                warnings.append(
                    f"  {enum_name}.{member.value}: no override, using auto-label \"{auto}\""
                )

    if warnings:
        print(f"  {len(warnings)} enum values using auto-labels (no curated override):")
        for w in warnings[:30]:
            print(w)
        if len(warnings) > 30:
            print(f"  ... and {len(warnings) - 30} more")
    else:
        print("  All enum values have curated overrides.")
    return warnings


def phase_tests() -> bool:
    """Run the test suites."""
    print("\n[5/6] Running tests...")
    all_passed = True

    # Backend tests
    print("  Backend (pytest)...")
    r = run(
        [sys.executable, "-m", "pytest", "web/backend/tests/", "-q",
         "--ignore=web/backend/tests/test_preset_load.py"],
        check=False,
    )
    if r.returncode != 0:
        print("  BACKEND TESTS FAILED")
        all_passed = False

    # TypeScript typecheck
    print("  TypeScript (tsc)...")
    r = run(["npx", "tsc", "--noEmit"], check=False)
    if r.returncode != 0:
        print("  TYPECHECK FAILED")
        all_passed = False

    # Frontend tests
    print("  Frontend (vitest)...")
    r = run(["npx", "vitest", "run"], check=False)
    if r.returncode != 0:
        print("  FRONTEND TESTS FAILED")
        all_passed = False

    return all_passed


def phase_summary(
    new_commits: list[str],
    changes: dict[str, list[str]],
    gen_ok: bool,
    warnings: list[str],
    tests_ok: bool | None,
) -> None:
    """Print final summary."""
    print("\n[6/6] Summary")
    print("=" * 60)
    print(f"  Upstream commits:    {len(new_commits)}")
    print(f"  Changed areas:       {', '.join(changes.keys()) or 'none'}")
    print(f"  Type generation:     {'OK' if gen_ok else 'FAILED'}")
    print(f"  Auto-label warnings: {len(warnings)}")
    if tests_ok is None:
        print(f"  Tests:               skipped (--check mode)")
    else:
        print(f"  Tests:               {'ALL PASS' if tests_ok else 'FAILURES'}")
    print("=" * 60)

    if warnings:
        print("\n  To add curated labels, edit web/scripts/ui_metadata.py")
        print("  (auto-labels work fine as fallbacks — this is optional)")

    if not gen_ok:
        print("\n  FIX: Resolve type generation errors before proceeding.")
    elif tests_ok is False:
        print("\n  FIX: Resolve test failures before committing.")
    else:
        print("\n  Next: review changes, commit, and push.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync with upstream OneTrainer")
    parser.add_argument("--check", action="store_true", help="Dry-run: skip tests")
    parser.add_argument("--no-fetch", action="store_true", help="Skip git fetch")
    args = parser.parse_args()

    new_commits: list[str] = []
    changes: dict[str, list[str]] = {}

    if not args.no_fetch:
        new_commits = phase_fetch()
    else:
        print("\n[1/6] Skipping fetch (--no-fetch)")

    changes = phase_diff() if not args.no_fetch else {}

    gen_ok = phase_generate()
    warnings = phase_metadata_gaps()
    tests_ok = phase_tests() if not args.check else None

    phase_summary(new_commits, changes, gen_ok, warnings, tests_ok)


if __name__ == "__main__":
    main()
```

**Step 2: Test it**

Run: `python -m web.scripts.sync_upstream --no-fetch --check`
Expected: Phases 3-4 run, phases 1-2 skipped, tests skipped, summary printed.

Run: `python -m web.scripts.sync_upstream --no-fetch`
Expected: Full run including tests. All should pass.

**Step 3: Commit**

```bash
git add web/scripts/sync_upstream.py
git commit -m "Add sync_upstream.py for upstream sync workflow"
```

---

### Task 7: Write SYNCING.md

**Files:**
- Create: `web/docs/SYNCING.md`

**Step 1: Write the document**

See design doc for structure. Key sections:

1. **Architecture overview** — code gen pipeline diagram (3 paragraphs)
2. **Quick sync** — `python -m web.scripts.sync_upstream` with example output
3. **What the script does** — 6 phases
4. **Manual steps** — when/why to edit `ui_metadata.py`
5. **Troubleshooting** — import errors, merge conflicts, test failures
6. **How dynamic discovery works** — scanning, KNOWN_MINIMUM validation

Tone: terse, like a good CONTRIBUTING.md. No filler.

**Step 2: Commit**

```bash
git add web/docs/SYNCING.md
git commit -m "Add SYNCING.md upstream sync documentation"
```

---

### Task 8: Run full verification

**Files:** None (verification only)

**Step 1: Run full type generation from clean state**

```bash
python -m web.scripts.generate_types
```

**Step 2: Run all tests**

```bash
cd web/backend && python -m pytest tests/ -v --ignore=tests/test_preset_load.py
cd ../gui && npx tsc --noEmit
cd ../gui && npx vitest run
cd ../gui && npx eslint --max-warnings 0 src/
python -m ruff check web/backend/ web/scripts/
```

**Step 3: Run the sync script end-to-end**

```bash
python -m web.scripts.sync_upstream --no-fetch
```

**Step 4: Diff generated files against baseline**

```bash
diff -r web/gui/src/renderer/types/generated/ web/scripts/tests/baseline_generated/
```

Expected: Identical or only trivially different (auto-tooltips for fields that didn't previously have them).

**Step 5: Clean up baseline files (no longer needed)**

```bash
rm -rf web/scripts/tests/baseline_generated/ web/scripts/tests/baseline_discovery.txt
git add -A web/scripts/tests/
git commit -m "Remove baseline snapshots after validation"
```
