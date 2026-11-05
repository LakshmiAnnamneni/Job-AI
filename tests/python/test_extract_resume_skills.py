"""Tests for scripts/extract_resume_skills.py. All resume text here is MADE UP."""

from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import extract_resume_skills as ers  # noqa: E402
from test_extract_resume_text import make_pdf  # noqa: E402

RESUME = """PAT EXAMPLE
Senior Widget Program Manager

SUMMARY
Delivery leader who keeps teams safe and lean while shipping on time.

CORE COMPETENCIES
• Program Management • Agile Methodologies • Risk & Issue Management
Stakeholder Communication | Vendor Management | Budgeting (CapEx, OpEx)
Tools: Jira, Confluence, MS Project
Process Improvement   Executive Reporting

PROFESSIONAL EXPERIENCE
Widget Co, Senior Program Manager
- Led a SAFe transformation across 6 Scrum teams and a cloud migration to AWS.
- Built Power BI dashboards and tracked KPIs with the PMO.

EDUCATION
B.S. Widgetry
Certifications: PMP, Certified ScrumMaster
"""


class SectionParsingTest(unittest.TestCase):
    def test_reads_items_under_the_skills_heading_in_all_formats(self) -> None:
        self.assertEqual(
            ers.skills_section_items(RESUME),
            [
                "Program Management", "Agile Methodologies", "Risk & Issue Management",
                "Stakeholder Communication", "Vendor Management", "Budgeting (CapEx, OpEx)",
                "Jira", "Confluence", "MS Project",
                "Process Improvement", "Executive Reporting",
            ],
        )

    def test_wide_spacing_from_two_column_layouts_splits_on_3plus_spaces_only(self) -> None:
        self.assertEqual(ers.split_items("Process Improvement   Executive Reporting"), ["Process Improvement", "Executive Reporting"])

    def test_section_stops_at_the_next_heading(self) -> None:
        items = ers.skills_section_items(RESUME)
        self.assertNotIn("Widget Co", " ".join(items))
        self.assertNotIn("B.S. Widgetry", items)

    def test_inline_skills_heading(self) -> None:
        self.assertEqual(ers.skills_section_items("Skills: Kanban, Smartsheet; Miro\nEXPERIENCE\nx"), ["Kanban", "Smartsheet", "Miro"])

    def test_sentences_are_not_skills(self) -> None:
        self.assertEqual(ers.split_items("Partnered with finance and legal teams to renegotiate every vendor contract"), [])


class ExtractSkillsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.skills = ers.extract_skills(RESUME)
        self.names = [s.name for s in self.skills]

    def test_section_items_come_first_then_mentions(self) -> None:
        self.assertEqual(self.skills[0], ers.Skill("Program Management", ers.SKILLS_SECTION))
        self.assertIn(ers.Skill("SAFe", ers.MENTIONED), self.skills)

    def test_vocabulary_finds_skills_mentioned_in_experience_and_certifications(self) -> None:
        for name in ["SAFe", "Scrum", "Cloud Migration", "AWS", "Power BI", "KPIs", "PMO", "PMP", "CSM"]:
            self.assertIn(name, self.names)
        self.assertNotIn("Cloud", self.names)  # only part of "cloud migration"

    def test_case_sensitive_terms_ignore_ordinary_words(self) -> None:
        names = [s.name for s in ers.extract_skills("We keep things safe and lean, and excel at shipping.")]
        self.assertNotIn("SAFe", names)
        self.assertNotIn("Lean", names)
        self.assertNotIn("Microsoft Excel", names)

    def test_no_duplicates_and_section_wording_wins(self) -> None:
        # "Agile" is covered by the section's "Agile Methodologies"; Jira listed once.
        self.assertNotIn("Agile", self.names)
        self.assertEqual(self.names.count("Jira"), 1)
        self.assertEqual(len(self.names), len({n.casefold() for n in self.names}))

    def test_alias_maps_to_canonical_name_only_when_not_already_listed(self) -> None:
        # "MS Project" is in the section, so "Microsoft Project" isn't added again.
        self.assertIn("MS Project", self.names)
        self.assertNotIn("Microsoft Project", self.names)
        mentioned = [s.name for s in ers.extract_skills("Planned releases in MS Project.")]
        self.assertEqual(mentioned, ["Microsoft Project"])

    def test_resume_without_a_skills_section_still_gets_mentions(self) -> None:
        names = [s.name for s in ers.extract_skills("EXPERIENCE\nRan Kanban boards in Jira for a SQL migration.")]
        self.assertEqual(names, ["Kanban", "Jira", "SQL"])


class CliTest(unittest.TestCase):
    def setUp(self) -> None:
        self.dir = Path(tempfile.mkdtemp())

    def run_main(self, *argv: str) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = ers.main(list(argv))
        return code, out.getvalue(), err.getvalue()

    def test_txt_input_writes_one_skill_per_line(self) -> None:
        src = self.dir / "cv.txt"
        src.write_text(RESUME, encoding="utf-8")
        code, stdout, _ = self.run_main(str(src), "--out-dir", str(self.dir / "out"))
        self.assertEqual(code, 0)
        lines = (self.dir / "out" / "cv.skills.txt").read_text(encoding="utf-8").splitlines()
        self.assertEqual(lines[0], "Program Management")
        self.assertIn("SAFe", lines)
        self.assertIn("from skills section", stdout)

    def test_pdf_input_and_json_output(self) -> None:
        pdf = self.dir / "cv.pdf"
        pdf.write_bytes(make_pdf(["SKILLS", "Kanban | Smartsheet", "EXPERIENCE", "Led Scrum teams"]))
        code, stdout, _ = self.run_main("--json", str(pdf))
        self.assertEqual(code, 0)
        self.assertEqual(
            json.loads(stdout),
            [
                {"name": "Kanban", "source": "skills section"},
                {"name": "Smartsheet", "source": "skills section"},
                {"name": "Scrum", "source": "mentioned"},
            ],
        )

    def test_missing_file_fails_cleanly(self) -> None:
        code, _, stderr = self.run_main(str(self.dir / "nope.pdf"), "--stdout")
        self.assertEqual(code, 1)
        self.assertIn("nope.pdf", stderr)


if __name__ == "__main__":
    unittest.main()
