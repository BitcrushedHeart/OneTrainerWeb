#!/usr/bin/env python3
import argparse
import re
import sys
from pathlib import Path

# Skip generated files — they have their own style
SKIP_PATTERNS = ["/generated/", "\\generated\\", "node_modules"]


def is_generated(path: Path) -> bool:
    s = str(path)
    return any(p in s for p in SKIP_PATTERNS)


def strip_ts_docs(source: str) -> str:
    lines = source.splitlines(keepends=True)
    result: list[str] = []
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]
        stripped = line.strip()

        # Detect JSDoc block start: /** (not inside code)
        if stripped.startswith("/**"):
            # Find the end of this JSDoc block
            block_start = i

            if stripped.endswith("*/") and not stripped.endswith("/**/"):
                # Single-line JSDoc: /** something */
                block_end = i + 1
            else:
                # Multi-line JSDoc
                j = i + 1
                while j < n and "*/" not in lines[j]:
                    j += 1
                block_end = j + 1 if j < n else n

            block_lines = lines[block_start:block_end]
            block_text = "".join(block_lines)

            # Check context: what comes after the block?
            next_idx = block_end
            # Skip blank lines after block
            while next_idx < n and lines[next_idx].strip() == "":
                next_idx += 1

            next_line = lines[next_idx].strip() if next_idx < n else ""

            # KEEP: Interface/type field docs (line is a property inside interface)
            is_interface_field = (
                not next_line.startswith("export")
                and not next_line.startswith("function")
                and not next_line.startswith("class")
                and not next_line.startswith("const")
                and not next_line.startswith("let")
                and not next_line.startswith("type")
                and not next_line.startswith("interface")
                and not next_line.startswith("async")
                and not next_line.startswith("/**")  # not another JSDoc
                and block_start > 0  # not file top
            )

            # KEEP: Comments with TODO/FIXME/HACK
            has_todo = bool(re.search(r"\b(TODO|FIXME|HACK|NOTE|IMPORTANT)\b", block_text))

            if is_interface_field or has_todo:
                # Keep it
                result.extend(block_lines)
                i = block_end
                continue

            # REMOVE: Multi-line JSDoc blocks (3+ lines)
            block_line_count = block_end - block_start
            if block_line_count >= 3:
                # Remove the block and any trailing blank line
                i = block_end
                if i < n and lines[i].strip() == "":
                    i += 1
                continue

            # REMOVE: Single-line JSDoc that just restates the export name
            if block_line_count <= 2:
                # Extract the doc text
                doc_text = stripped.replace("/**", "").replace("*/", "").strip()
                # Check if next line has the same concept word
                if next_line:
                    # E.g., "/** Full-width input. */" before "export const INPUT_FULL"
                    # Extract name from next line
                    name_match = re.search(r"(?:const|let|function|class|type|interface)\s+(\w+)", next_line)
                    if name_match:
                        name = name_match.group(1)
                        # Convert PascalCase/SCREAMING_CASE to words
                        name_words = set(
                            re.sub(r"([A-Z])", r" \1", name.replace("_", " ")).lower().split()
                        )
                        doc_words = set(doc_text.lower().replace(".", "").replace(",", "").split())
                        # If >50% of name words appear in doc, it's restating the name
                        if name_words and len(name_words & doc_words) / len(name_words) > 0.4:
                            i = block_end
                            if i < n and lines[i].strip() == "":
                                i += 1
                            continue

                # Keep non-obvious single-line JSDoc
                result.extend(block_lines)
                i = block_end
                continue

            result.extend(block_lines)
            i = block_end
            continue

        result.append(line)
        i += 1

    return "".join(result)


def process_file(path: Path, dry_run: bool = False) -> bool:
    if is_generated(path):
        return False

    original = path.read_text(encoding="utf-8")
    cleaned = strip_ts_docs(original)

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
    parser = argparse.ArgumentParser(description="Strip JSDoc from TypeScript files")
    parser.add_argument("paths", nargs="*", default=["web/gui/src/renderer"])
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    files_changed = 0
    for base in args.paths:
        base_path = Path(base)
        if base_path.is_file():
            ts_files = [base_path]
        else:
            ts_files = sorted(
                list(base_path.rglob("*.ts")) + list(base_path.rglob("*.tsx"))
            )

        for f in ts_files:
            if process_file(f, args.dry_run):
                files_changed += 1

    mode = "Would change" if args.dry_run else "Changed"
    print(f"\n{mode} {files_changed} file(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
