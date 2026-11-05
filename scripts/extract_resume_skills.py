"""Pull a skills list out of a resume.

    npm run resume:skills                           # every PDF in resume/ -> resume/<name>.skills.txt
    npm run resume:skills -- resume/master.pdf      # specific PDF or .txt file(s)
    npm run resume:skills -- --stdout resume/master.pdf
    npm run resume:skills -- --json resume/master.pdf

Two sources, merged in order of appearance with duplicates removed:
  1. "skills section": items under a Skills / Core Competencies / Expertise heading.
  2. "mentioned": terms from scripts/skills_vocabulary.txt found anywhere else.
Output stays in resume/ (gitignored).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

import extract_resume_text as ert
from pypdf.errors import PdfReadError

VOCABULARY_FILE = Path(__file__).resolve().parent / "skills_vocabulary.txt"

SKILLS_SECTION = "skills section"
MENTIONED = "mentioned"

# Heading words that start a skills section, and that start some other section.
_SKILL_HEADING_WORDS = ("skill", "competenc", "expertise", "proficienc", "tools", "technologies", "strengths")
_OTHER_HEADINGS = {
    "summary", "professional summary", "profile", "professional profile", "objective", "about me",
    "experience", "professional experience", "work experience", "relevant experience",
    "employment", "employment history", "work history", "career history", "career highlights",
    "education", "education and training", "certifications", "certificates", "licenses",
    "licenses and certifications", "certifications and training", "training", "projects",
    "key projects", "awards", "honors", "achievements", "accomplishments", "key achievements",
    "publications", "volunteer", "volunteering", "languages", "interests", "references",
    "affiliations", "professional affiliations", "memberships",
}

_BULLETS = "•●▪◦·‣⁃➢➤✓✔■□-–—*"
_MAX_WORDS_PER_SKILL = 6


@dataclass(frozen=True)
class Skill:
    name: str
    source: str  # SKILLS_SECTION or MENTIONED


@dataclass(frozen=True)
class VocabEntry:
    name: str
    patterns: tuple[re.Pattern[str], ...]


def load_vocabulary(path: Path = VOCABULARY_FILE) -> list[VocabEntry]:
    entries: list[VocabEntry] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip() if raw.lstrip().startswith("#") else raw.strip()
        if not line:
            continue
        names = [p.strip() for p in line.split("|") if p.strip()]
        canonical = names[0].lstrip("=")
        aliases = names if names[0].startswith("=") else [names[0], *names[1:]]
        entries.append(VocabEntry(canonical, tuple(_alias_pattern(a) for a in dict.fromkeys(aliases))))
    return entries


def _alias_pattern(alias: str) -> re.Pattern[str]:
    term_text = alias.lstrip("=")
    # Exact case for "=" aliases and for words with an inner capital (SAFe, SQL, BI).
    exact = alias.startswith("=") or any(c.isupper() for w in term_text.split() for c in w[1:])
    term = re.escape(term_text)
    return re.compile(rf"(?<![\w]){term}(?![\w])", 0 if exact else re.IGNORECASE)


def _heading_text(line: str) -> str:
    return re.sub(r"[^a-z& ]+", "", line.lower()).replace("&", "and").strip()


def _looks_like_heading(line: str) -> bool:
    s = line.strip().rstrip(":").strip()
    words = s.split()
    if not (1 <= len(words) <= 5) or len(s) > 45 or re.search(r"[.,;|•]", s):
        return False
    letters = [c for c in s if c.isalpha()]
    return bool(letters) and (s.isupper() or _heading_text(s) in _OTHER_HEADINGS or _is_skills_heading(s))


def _is_skills_heading(line: str) -> bool:
    h = _heading_text(line.rstrip(":"))
    return 0 < len(h.split()) <= 5 and any(w in h for w in _SKILL_HEADING_WORDS)


def split_items(line: str) -> list[str]:
    """Split one skills-section line into individual skills."""
    s = line.strip().lstrip(_BULLETS).strip()
    # "Tools: Jira, Confluence" -> drop the short category label
    m = re.match(r"^([^:]{1,40}):\s*(.+)$", s)
    if m and len(m.group(1).split()) <= 4:
        s = m.group(2)
    parts = re.split(r"\s*(?:[•●▪◦·‣|;]|,(?![^()]*\))|\s{3,}|\t)\s*", s)
    items = []
    for p in parts:
        p = re.sub(r"^(?:and|&)\s+", "", p.strip().strip(_BULLETS + ".:,; ")).strip()
        if 2 <= len(p) <= 60 and re.search(r"[A-Za-z]", p) and len(p.split()) <= _MAX_WORDS_PER_SKILL:
            items.append(p)
    return items


def skills_section_items(text: str) -> list[str]:
    """Items listed under skills-type headings, in order."""
    items: list[str] = []
    collecting = False
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        inline = re.match(r"^([^:]{2,45}):\s*(.+)$", stripped)
        if inline and _is_skills_heading(inline.group(1)):
            collecting = True
            items.extend(split_items(inline.group(2)))
            continue
        if _looks_like_heading(stripped):
            collecting = _is_skills_heading(stripped)
            continue
        if collecting:
            items.extend(split_items(stripped))
    return items


def _key(s: str) -> str:
    return re.sub(r"[^a-z0-9+#]", "", s.casefold())


def extract_skills(text: str, vocabulary: list[VocabEntry] | None = None) -> list[Skill]:
    vocabulary = load_vocabulary() if vocabulary is None else vocabulary
    found: list[Skill] = []
    seen: set[str] = set()

    section = skills_section_items(text)
    for item in section:
        if _key(item) not in seen:
            seen.add(_key(item))
            found.append(Skill(item, SKILLS_SECTION))

    # Vocabulary hits anywhere, ordered by first appearance; skip ones already covered
    # by a section item ("Agile" when the section lists "Agile Methodologies").
    # A match inside a longer match ("cloud" in "cloud migration") doesn't count.
    section_text = " | ".join(section)
    spans = [(m.start(), m.end(), e.name) for e in vocabulary for p in e.patterns for m in p.finditer(text)]
    first: dict[str, int] = {}
    for start, end, name in spans:
        inside_longer = any(s <= start and end <= e and (e - s) > (end - start) for s, e, _ in spans)
        if not inside_longer:
            first[name] = min(first.get(name, start), start)
    hits = sorted((pos, name) for name, pos in first.items())
    for _, name in hits:
        covered = _key(name) in seen or any(p.search(section_text) for p in _patterns_for(vocabulary, name))
        if not covered:
            seen.add(_key(name))
            found.append(Skill(name, MENTIONED))
    return found


def _patterns_for(vocabulary: list[VocabEntry], name: str) -> tuple[re.Pattern[str], ...]:
    return next((e.patterns for e in vocabulary if e.name == name), ())


def read_resume_text(path: Path) -> str:
    if path.suffix.lower() == ".txt":
        return path.read_text(encoding="utf-8")
    return ert.extract_text(path).text


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Pull a skills list out of resume PDFs or .txt files.")
    parser.add_argument("files", nargs="*", type=Path, help="PDF or .txt files (default: every PDF in resume/)")
    parser.add_argument("--stdout", action="store_true", help="print the list only; don't write a file")
    parser.add_argument("--json", action="store_true", help="print JSON [{name, source}] instead")
    parser.add_argument("--out-dir", type=Path, default=ert.RESUME_DIR, help="where to write <name>.skills.txt")
    parser.add_argument("--vocabulary", type=Path, default=VOCABULARY_FILE, help="skills vocabulary file")
    args = parser.parse_args(argv)

    files: list[Path] = args.files or sorted(ert.RESUME_DIR.glob("*.pdf"))
    if not files:
        print(f"No PDFs found in {ert.RESUME_DIR}. Add one there or pass a path.", file=sys.stderr)
        return 1
    vocabulary = load_vocabulary(args.vocabulary)

    failures = 0
    for path in files:
        try:
            skills = extract_skills(read_resume_text(path), vocabulary)
        except (FileNotFoundError, PdfReadError, ValueError, UnicodeDecodeError) as err:
            print(f"✗ {path}: {err}", file=sys.stderr)
            failures += 1
            continue

        if args.json:
            print(json.dumps([asdict(s) for s in skills], indent=2, ensure_ascii=False))
            continue
        from_section = sum(s.source == SKILLS_SECTION for s in skills)
        summary = f"{path.name}: {len(skills)} skills ({from_section} from skills section, {len(skills) - from_section} mentioned elsewhere)"
        if args.stdout:
            print(summary)
        else:
            args.out_dir.mkdir(parents=True, exist_ok=True)
            out = args.out_dir / f"{path.stem}.skills.txt"
            out.write_text("".join(f"{s.name}\n" for s in skills), encoding="utf-8")
            print(f"✓ {summary} → {out}")
        for i, s in enumerate(skills, 1):
            print(f"  {i:>3}. {s.name}" + ("" if s.source == SKILLS_SECTION else "   (mentioned)"))

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
