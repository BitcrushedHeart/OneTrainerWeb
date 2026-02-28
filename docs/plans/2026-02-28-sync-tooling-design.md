# Upstream Sync Tooling Design

## Problem

OneTrainer is actively maintained. The web frontend generates TypeScript types from Python enums and config classes. When upstream adds new enums, config fields, or model types, the frontend must regenerate types and may need updated display labels or tooltips. Currently this requires multiple manual steps and hardcoded source lists.

## Deliverables

1. `web/scripts/sync_upstream.py` — AIO sync script
2. `web/scripts/generate_types.py` changes — dynamic discovery, auto-labels, auto-tooltips
3. `web/scripts/ui_metadata.py` changes — becomes an override layer
4. `web/docs/SYNCING.md` — architecture overview + maintainer runbook

## Design

### Dynamic Discovery in generate_types.py

Replace hardcoded `ENUM_MODULES` (27 entries) and `CONFIG_IMPORTS` (12 entries) with directory scans:

- **Enums**: Scan `modules/util/enum/` for `.py` files, import each, find `enum.Enum` subclasses.
- **Configs**: Scan `modules/util/config/` for `.py` files, import each, find `BaseConfig` subclasses with `default_values()`.

Safety: maintain a `KNOWN_MINIMUM` set of expected entries. If scanning finds fewer than known, abort with an error. This catches broken imports without silently generating incomplete types.

Approach: commit current hardcoded state first, add dynamic scanning, validate it produces identical output to the hardcoded version.

### Auto-Generated Labels and Tooltips

Add `_auto_label(enum_name: str) -> str`:
- Replace underscores with spaces
- Handle known acronyms (SDXL, VAE, LORA, FP16, BF16, etc.)
- Handle version patterns (_15 → 1.5, _20 → 2.0)
- Fall back to title-casing

Add `_auto_tooltip(field_path: str) -> str`:
- Convert dot-notation field names to readable phrases
- Return empty string for obvious fields

`ui_metadata.py` becomes an override layer: `ENUM_DISPLAY_LABELS` and `FIELD_TOOLTIPS` override auto-generated values when present but are not required for every entry.

### Output Validation

After generation, compare against previous generated files. If a field or enum value was removed (not just added), print a prominent warning — likely an upstream breaking change.

### sync_upstream.py

Single Python script, invoked as `python -m web.scripts.sync_upstream`.

Phases:
1. **Fetch upstream** — `git fetch upstream`, show new commits
2. **Diff detection** — show changes in `modules/util/enum/`, `modules/util/config/`, `modules/ui/`
3. **Run type generation** — call `generate_types.py` (with dynamic discovery)
4. **Metadata gap check** — compare generated enum values against `ui_metadata.py` overrides, report new values using auto-labels
5. **Run tests** — pytest, tsc --noEmit, vitest
6. **Summary** — what changed, what needs manual attention, what passed/failed

Flags:
- `--check` — dry-run: show gaps without running tests
- `--no-fetch` — skip git fetch (already pulled)

### SYNCING.md

Structure:
1. Architecture overview (code gen pipeline, for PR reviewers)
2. Quick sync (one-liner command)
3. What the sync script does (6 phases explained)
4. Manual steps (overriding auto-labels, adding wide tooltip flags)
5. Troubleshooting (import errors, merge conflicts in generated files, test failures)
6. How dynamic discovery works

Tone: terse, developer-oriented, no filler.

## Not In Scope

- Modifying upstream `modules/` code
- Automated PR creation against upstream
- Windows CI runner
- AST extraction of tooltips from legacy tkinter UI
