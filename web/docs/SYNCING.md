# Keeping OneTrainerWeb in Sync with Upstream

## Architecture

OneTrainerWeb generates TypeScript types from Python source at build time. The
pipeline reads enums from `modules/util/enum/` and config classes from
`modules/util/config/`, then writes 9 TypeScript files to
`web/gui/src/renderer/types/generated/`. Two JSON files for optimizer defaults
land in `web/backend/generated/`.

The generator (`web/scripts/generate_types.py`) discovers sources dynamically by
scanning directories rather than maintaining hardcoded lists. A known-minimum
validation set catches regressions if scanning finds fewer classes than expected.

Display labels and tooltips are auto-generated from enum/field names. Curated
overrides in `web/scripts/ui_metadata.py` take precedence when present.

## Quick Sync

```bash
python -m web.scripts.sync_upstream
```

This fetches upstream, regenerates types, reports gaps, and runs all tests.

Flags:
- `--check` — skip tests (dry-run)
- `--no-fetch` — skip `git fetch upstream` (already pulled)

## What the Script Does

| Phase | Action |
|-------|--------|
| 1. Fetch | `git fetch upstream`, show new commits |
| 2. Diff | Show changes in `modules/util/enum/`, `modules/util/config/`, `modules/ui/` |
| 3. Generate | Run `generate_types.py`, show changed generated files |
| 4. Gaps | Compare enum values against curated overrides in `ui_metadata.py` |
| 5. Tests | pytest (backend), tsc (typecheck), vitest (frontend) |
| 6. Summary | One-line status for each phase |

## Manual Steps

These can't be automated and need human judgment:

**After merging upstream:**

1. **Resolve merge conflicts** in `web/` files if upstream touched anything in
   the web layer (unlikely but possible).
2. **Review auto-labels** — the gap check (phase 4) lists enum values using
   auto-generated labels. Most are fine (`"ADAM"` → `"Adam"`). Override in
   `ui_metadata.py` if the auto-label is ugly or wrong.
3. **Add tooltips** for new config fields if the auto-generated tooltip
   (`"learning_rate"` → `"Learning rate"`) isn't descriptive enough. Edit
   `FIELD_TOOLTIPS` in `ui_metadata.py`.
4. **Update wide tooltip set** — if a new field needs a wider tooltip popup, add
   its key to `WIDE_TOOLTIPS` in `ui_metadata.py`.

**When upstream adds fundamentally new features:**

- New model type → check `ModelType.is_*()` methods are picked up by
  `generate_model_type_info_ts()` (automatic if methods follow naming convention).
- New training method → verify `TRAINING_METHODS_BY_MODEL` in `generate_types.py`
  handles it (this mapping is hardcoded logic that mirrors `TopBar.py`).
- New UI tab → needs a new React page component (manual work).

## Troubleshooting

**Import errors during generation:**

The generator imports from `modules/`. If upstream changed module paths or added
new dependencies, you may get `ModuleNotFoundError`. Fix: install the dependency
or update the import in `generate_types.py`.

**Merge conflicts in generated files:**

Never manually resolve conflicts in `web/gui/src/renderer/types/generated/`.
Delete the conflicted files and regenerate:
```bash
rm -rf web/gui/src/renderer/types/generated/
python -m web.scripts.generate_types
```

**Test failures after sync:**

- **Parameter parity** (`test_parameter_parity.py`) — a new Python config field
  isn't in TypeScript. Fix: regenerate types.
- **Config round-trip** (`test_config_roundtrip.py`) — preset JSON doesn't
  survive serialize→deserialize. Usually means a field type changed upstream.
- **TypeScript compile** — generated type doesn't match usage in React code.
  Check if a field was renamed or removed upstream.

## How Dynamic Discovery Works

On import, `generate_types.py` scans two directories:

- `modules/util/enum/` → finds `.py` files, imports each, collects `Enum`
  subclasses → populates `ENUM_MODULES`
- `modules/util/config/` → finds `.py` files, imports each, collects
  `BaseConfig` subclasses with `default_values()` → used by `collect_configs()`

Both validate against a `KNOWN_MINIMUM` set. If the scan finds fewer than
expected, generation aborts with an error rather than silently producing
incomplete types.

When upstream adds a new enum file to `modules/util/enum/`, it's automatically
picked up on the next generation run. No manual step needed.

## CI Integration

The `type-generation` CI job runs `generate_types.py` in a clean checkout and
fails if generated files differ from what's committed:

```bash
python web/scripts/generate_types.py
git diff --exit-code web/gui/src/renderer/types/generated/
```

This catches stale generated files before they reach `master`.
