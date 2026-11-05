"""Extract plain text from resume PDFs with pypdf.

    npm run resume:text                          # every PDF in resume/ -> resume/<name>.txt
    npm run resume:text -- resume/master.pdf     # specific file(s)
    npm run resume:text -- --stdout resume/master.pdf
    npm run resume:text -- --layout ...          # keep columns/spacing (good for 2-column resumes)

Output .txt files go to resume/ by default, which is gitignored, so extracted text
never reaches the repo.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader
from pypdf.errors import PdfReadError

ROOT = Path(__file__).resolve().parent.parent
RESUME_DIR = ROOT / "resume"

# Fewer characters than this per page usually means the PDF is a scanned image.
MIN_CHARS_PER_PAGE = 20


@dataclass
class Extraction:
    path: Path
    pages: int
    text: str

    @property
    def looks_scanned(self) -> bool:
        """True when there's (almost) no text layer, so the PDF likely needs OCR."""
        return self.pages > 0 and len(self.text.strip()) < MIN_CHARS_PER_PAGE * self.pages


def clean_text(raw: str) -> str:
    """Normalize pypdf output: line endings, stray spaces, hyphenation, blank lines."""
    text = raw.replace("\r\n", "\n").replace("\r", "\n").replace(" ", " ")
    text = re.sub(r"[ \t]+\n", "\n", text)  # trailing whitespace
    # Re-join words split across lines ("manage-\nment"), but not ranges like "2019-\n2021".
    text = re.sub(r"([a-z])-\n([a-z])", r"\1\2", text)
    text = re.sub(r"\n{3,}", "\n\n", text)  # at most one blank line in a row
    return text.strip() + "\n"


def extract_text(path: Path, *, layout: bool = False, password: str | None = None) -> Extraction:
    """Read every page of a PDF. Raises ValueError for a locked PDF without the right password."""
    reader = PdfReader(path)
    if reader.is_encrypted and not reader.decrypt(password or ""):
        raise ValueError("password-protected; pass --password")
    mode = "layout" if layout else "plain"
    pages = [page.extract_text(extraction_mode=mode) or "" for page in reader.pages]
    return Extraction(path=path, pages=len(reader.pages), text=clean_text("\n\n".join(pages)))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Extract text from resume PDFs with pypdf.")
    parser.add_argument("files", nargs="*", type=Path, help="PDFs to read (default: every PDF in resume/)")
    parser.add_argument("--stdout", action="store_true", help="print the text instead of writing .txt files")
    parser.add_argument("--out-dir", type=Path, default=RESUME_DIR, help="where to write .txt files (default: resume/)")
    parser.add_argument("--layout", action="store_true", help="keep visual layout (columns, spacing)")
    parser.add_argument("--password", help="password for an encrypted PDF")
    args = parser.parse_args(argv)

    files: list[Path] = args.files or sorted(RESUME_DIR.glob("*.pdf"))
    if not files:
        print(f"No PDFs found in {RESUME_DIR}. Add one there or pass a path.", file=sys.stderr)
        return 1

    failures = 0
    for pdf in files:
        try:
            result = extract_text(pdf, layout=args.layout, password=args.password)
        except (FileNotFoundError, PdfReadError, ValueError) as err:
            print(f"✗ {pdf}: {err}", file=sys.stderr)
            failures += 1
            continue

        if result.looks_scanned:
            print(f"! {pdf.name}: little or no text found; it may be a scanned image that needs OCR", file=sys.stderr)

        if args.stdout:
            sys.stdout.write(result.text)
        else:
            args.out_dir.mkdir(parents=True, exist_ok=True)
            out = args.out_dir / f"{pdf.stem}.txt"
            out.write_text(result.text, encoding="utf-8")
            print(f"✓ {pdf.name}: {result.pages} page(s), {len(result.text):,} characters → {out}")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
