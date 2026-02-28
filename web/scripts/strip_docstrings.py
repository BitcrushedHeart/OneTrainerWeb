#!/usr/bin/env python3
import argparse
import ast
import sys
from pathlib import Path


def strip_docstrings(source: str) -> str:
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return source

    lines = source.splitlines(keepends=True)
    removals: list[tuple[int, int]] = []

    for node in ast.walk(tree):
        if not isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue

        body = node.body
        if not body:
            continue

        first = body[0]
        if not isinstance(first, ast.Expr):
            continue
        if not isinstance(first.value, (ast.Constant,)):
            continue
        if not isinstance(first.value.value, str):
            continue

        start_line = first.lineno - 1
        end_line = first.end_lineno

        # Check if the line after the docstring is blank — remove it too
        if end_line < len(lines) and lines[end_line].strip() == "":
            end_line += 1

        # For functions/classes, insert `pass` if docstring is the only statement
        needs_pass = len(body) == 1

        removals.append((start_line, end_line, needs_pass, first))

    if not removals:
        return source

    # Sort in reverse so line numbers stay valid as we remove
    removals.sort(key=lambda r: r[0], reverse=True)

    for start, end, needs_pass, node in removals:
        indent = " " * (node.col_offset)
        replacement = [f"{indent}pass\n"] if needs_pass else []
        lines[start:end] = replacement

    return "".join(lines)


def process_file(path: Path, dry_run: bool = False) -> bool:
    original = path.read_text(encoding="utf-8")
    cleaned = strip_docstrings(original)

    if cleaned == original:
        return False

    original_lines = original.splitlines()
    cleaned_lines = cleaned.splitlines()
    removed = len(original_lines) - len(cleaned_lines)

    print(f"  {path} — removed {removed} lines")

    if not dry_run:
        path.write_text(cleaned, encoding="utf-8")

    return True


def main():
    parser = argparse.ArgumentParser(description="Strip docstrings from Python files")
    parser.add_argument("paths", nargs="*", default=["web/backend"])
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without writing")
    args = parser.parse_args()

    files_changed = 0
    for base in args.paths:
        base_path = Path(base)
        if base_path.is_file():
            py_files = [base_path]
        else:
            py_files = sorted(base_path.rglob("*.py"))

        for f in py_files:
            if process_file(f, args.dry_run):
                files_changed += 1

    mode = "Would change" if args.dry_run else "Changed"
    print(f"\n{mode} {files_changed} file(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
