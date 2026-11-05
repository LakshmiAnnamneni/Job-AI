"""Tests for scripts/extract_resume_text.py.

PDFs are generated on the fly with made-up content: never use a real resume here.
Run: npm run test:py
"""

from __future__ import annotations

import io
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from pypdf import PdfWriter

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import extract_resume_text as ert  # noqa: E402


def make_pdf(lines: list[str]) -> bytes:
    """A minimal one-page PDF with real text (Helvetica), built by hand."""
    esc = lambda s: s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")  # noqa: E731
    content = "BT /F1 12 Tf 72 720 Td 16 TL " + " ".join(f"({esc(line)}) Tj T*" for line in lines) + " ET"
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(content)} >>\nstream\n{content}\nendstream",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{body}\nendobj\n".encode("latin-1")
    xref_at = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets).encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode()
    return bytes(out)


SAMPLE = ["Pat Example", "Senior Widget Program Manager", "Agile, Risk management (RAID), Vendors"]


class ExtractTextTest(unittest.TestCase):
    def setUp(self) -> None:
        self.dir = Path(tempfile.mkdtemp())
        self.pdf = self.dir / "sample.pdf"
        self.pdf.write_bytes(make_pdf(SAMPLE))

    def test_extracts_every_line(self) -> None:
        result = ert.extract_text(self.pdf)
        self.assertEqual(result.pages, 1)
        for line in SAMPLE:
            self.assertIn(line, result.text)
        self.assertFalse(result.looks_scanned)

    def test_layout_mode_also_extracts(self) -> None:
        self.assertIn("Pat Example", ert.extract_text(self.pdf, layout=True).text)

    def test_encrypted_pdf_needs_the_password(self) -> None:
        writer = PdfWriter(clone_from=self.pdf)
        writer.encrypt("s3cret", algorithm="RC4-128")  # RC4 works without extra crypto packages
        locked = self.dir / "locked.pdf"
        with locked.open("wb") as f:
            writer.write(f)

        with self.assertRaisesRegex(ValueError, "password"):
            ert.extract_text(locked)
        self.assertIn("Pat Example", ert.extract_text(locked, password="s3cret").text)

    def test_image_only_pdf_is_flagged_as_scanned(self) -> None:
        writer = PdfWriter()
        writer.add_blank_page(width=612, height=792)
        blank = self.dir / "scan.pdf"
        with blank.open("wb") as f:
            writer.write(f)
        self.assertTrue(ert.extract_text(blank).looks_scanned)


class CleanTextTest(unittest.TestCase):
    def test_rejoins_hyphenated_words_but_not_number_ranges(self) -> None:
        self.assertEqual(ert.clean_text("program manage-\nment\n2019-\n2021"), "program management\n2019-\n2021\n")

    def test_collapses_blank_lines_and_trailing_spaces(self) -> None:
        self.assertEqual(ert.clean_text("A  \n\n\n\nB C\r\n"), "A\n\nB C\n")


class CliTest(unittest.TestCase):
    def setUp(self) -> None:
        self.dir = Path(tempfile.mkdtemp())
        self.pdf = self.dir / "cv.pdf"
        self.pdf.write_bytes(make_pdf(SAMPLE))

    def run_main(self, *argv: str) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = ert.main(list(argv))
        return code, out.getvalue(), err.getvalue()

    def test_writes_txt_to_out_dir(self) -> None:
        out_dir = self.dir / "out"
        code, stdout, _ = self.run_main(str(self.pdf), "--out-dir", str(out_dir))
        self.assertEqual(code, 0)
        self.assertIn("Pat Example", (out_dir / "cv.txt").read_text(encoding="utf-8"))
        self.assertIn("1 page(s)", stdout)

    def test_stdout_mode(self) -> None:
        code, stdout, _ = self.run_main("--stdout", str(self.pdf))
        self.assertEqual(code, 0)
        self.assertIn("Senior Widget Program Manager", stdout)

    def test_missing_and_non_pdf_files_fail_cleanly(self) -> None:
        not_pdf = self.dir / "notes.pdf"
        not_pdf.write_text("just text", encoding="utf-8")
        code, _, stderr = self.run_main(str(self.dir / "missing.pdf"), str(not_pdf), "--stdout")
        self.assertEqual(code, 1)
        self.assertIn("missing.pdf", stderr)
        self.assertIn("notes.pdf", stderr)


if __name__ == "__main__":
    unittest.main()
