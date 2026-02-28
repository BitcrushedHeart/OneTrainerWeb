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
GUI_DIR = os.path.join(PROJECT_ROOT, "web", "gui")


def run(cmd: list[str], check: bool = True, capture: bool = False,
        cwd: str | None = None) -> subprocess.CompletedProcess:
    print(f"  $ {' '.join(cmd)}")
    # shell=True needed on Windows for .cmd scripts (npx, git)
    return subprocess.run(cmd, check=check, capture_output=capture, text=True,
                          cwd=cwd or PROJECT_ROOT, shell=(sys.platform == "win32"))


def has_upstream() -> bool:
    r = run(["git", "remote"], capture=True, check=False)
    return "upstream" in r.stdout.strip().splitlines()


def phase_fetch() -> list[str]:
    print("\n[1/6] Fetching upstream...")
    if not has_upstream():
        print("  No 'upstream' remote configured. Skipping fetch.")
        print("  To add: git remote add upstream https://github.com/Nerogar/OneTrainer.git")
        return []
    run(["git", "fetch", "upstream"])

    result = run(
        ["git", "log", "--oneline", "HEAD..upstream/master"],
        capture=True, check=False,
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
    print("\n[2/6] Detecting changes in key directories...")
    if not has_upstream():
        print("  Skipped (no upstream remote).")
        return {}
    areas = {
        "enums": "modules/util/enum/",
        "configs": "modules/util/config/",
        "ui": "modules/ui/",
    }
    changes: dict[str, list[str]] = {}
    for label, path in areas.items():
        result = run(
            ["git", "diff", "--name-only", "HEAD..upstream/master", "--", path],
            capture=True, check=False,
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
    print("\n[3/6] Running type generation...")
    result = run([sys.executable, "-m", "web.scripts.generate_types"], check=False)
    if result.returncode != 0:
        print("  TYPE GENERATION FAILED")
        return False
    print("  Type generation succeeded.")

    diff = run(
        ["git", "diff", "--stat", "--", "web/gui/src/renderer/types/generated/"],
        capture=True, check=False,
    )
    if diff.stdout.strip():
        print(f"  Generated file changes:\n{diff.stdout}")
    else:
        print("  No changes to generated files.")
    return True


def phase_metadata_gaps() -> list[str]:
    print("\n[4/6] Checking metadata coverage...")
    warnings: list[str] = []

    sys.path.insert(0, PROJECT_ROOT)
    from web.scripts.generate_types import _auto_label, collect_enums
    from web.scripts.ui_metadata import ENUM_DISPLAY_LABELS

    for enum_name, enum_cls in collect_enums():
        overrides = ENUM_DISPLAY_LABELS.get(enum_name, {})
        for member in enum_cls:
            if member.value not in overrides:
                auto = _auto_label(member.value)
                warnings.append(
                    f"  {enum_name}.{member.value}: using auto-label \"{auto}\""
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
    print("\n[5/6] Running tests...")
    all_passed = True

    print("  Backend (pytest)...")
    r = run(
        [sys.executable, "-m", "pytest", "web/backend/tests/", "-q",
         "--ignore=web/backend/tests/test_preset_load.py"],
        check=False,
    )
    if r.returncode != 0:
        print("  BACKEND TESTS FAILED")
        all_passed = False

    print("  TypeScript (tsc)...")
    r = run(["npx", "tsc", "--noEmit"], check=False, cwd=GUI_DIR)
    if r.returncode != 0:
        print("  TYPECHECK FAILED")
        all_passed = False

    print("  Frontend (vitest)...")
    r = run(["npx", "vitest", "run"], check=False, cwd=GUI_DIR)
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
    print("\n[6/6] Summary")
    print("=" * 60)
    print(f"  Upstream commits:    {len(new_commits)}")
    print(f"  Changed areas:       {', '.join(changes.keys()) or 'none'}")
    print(f"  Type generation:     {'OK' if gen_ok else 'FAILED'}")
    print(f"  Auto-label warnings: {len(warnings)}")
    if tests_ok is None:
        print("  Tests:               skipped (--check mode)")
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

    os.chdir(PROJECT_ROOT)

    new_commits: list[str] = []
    changes: dict[str, list[str]] = {}

    if not args.no_fetch:
        new_commits = phase_fetch()
        changes = phase_diff()
    else:
        print("\n[1/6] Skipping fetch (--no-fetch)")
        print("\n[2/6] Skipping diff (--no-fetch)")

    gen_ok = phase_generate()
    warnings = phase_metadata_gaps()
    tests_ok = phase_tests() if not args.check else None

    phase_summary(new_commits, changes, gen_ok, warnings, tests_ok)


if __name__ == "__main__":
    main()
