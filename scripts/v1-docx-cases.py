"""v1's Word reading as the judge of the client's (3.10): random .docx files made with python-docx, each read by v1's own
context_store._extract_docx (its source taken from v1's file and run as it is), written out as cases for the client's
tests. A case is the document's word/document.xml, which the test packs into a .docx of its own, and v1's text for it.

    python -I scripts/v1-docx-cases.py <v1's backend folder> <out.json> [count] [seed]

<v1's backend folder> is inverview_app/interview_support-main/backend; python-docx must be installed (v1's
requirements.txt). The documents hold paragraphs (some empty, with tabs and line breaks), and tables with empty cells,
repeated texts, cells of two paragraphs, and merged cells. Not page breaks or a table inside a cell: v1 drops both, and
the client keeps them on purpose (its decisions §31), so they have tests of their own.
"""
from __future__ import annotations

import ast
import io
import json
import random
import sys
import tempfile
import zipfile
from pathlib import Path

import docx

WORDS = [
    "Kafka", "Go", "payments", "ledger", "Résumé", "naïve café", "日本語", "🙂", "a | b", "x", "C# & C++",
    "<tag>", "\"quoted\"", "  padded  ", "Senior Backend Engineer", "7 years", "Why Kafka?", "Replay + ordering.",
]


def v1_reader(backend: Path):
    """v1's _extract_docx, from its source: the function v1 runs, not a copy of it."""
    tree = ast.parse((backend / "context_store.py").read_text(encoding="utf-8"))
    function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_extract_docx")
    namespace: dict = {"Path": Path}
    exec(compile(ast.Module(body=[function], type_ignores=[]), "context_store.py", "exec"), namespace)
    return namespace["_extract_docx"]


def words(r: random.Random) -> str:
    return " ".join(r.choice(WORDS) for _ in range(r.randint(1, 3)))


def paragraph(document, r: random.Random, features: set) -> None:
    if r.random() < 0.15:
        document.add_paragraph("")
        features.add("empty paragraph")
        return
    p = document.add_paragraph()
    for _ in range(r.randint(1, 3)):
        run = p.add_run(words(r))
        roll = r.random()
        if roll < 0.15:
            run.add_tab()
            features.add("tab")
        elif roll < 0.3:
            run.add_break()  # a line break: python-docx's paragraph.text reads it as "\n"
            features.add("line break")
    features.add("paragraph")


def table(document, r: random.Random, features: set) -> None:
    rows, cols = r.randint(1, 4), r.randint(1, 4)
    t = document.add_table(rows=rows, cols=cols)
    for row in t.rows:
        for cell in row.cells:
            roll = r.random()
            if roll < 0.15:
                cell.text = ""
                features.add("empty cell")
            elif roll < 0.3:
                cell.text = "Yes"
                features.add("a repeated text")
            else:
                cell.text = words(r)
            if r.random() < 0.1:
                cell.add_paragraph(words(r))
                features.add("a cell of two paragraphs")
    for _ in range(r.randint(0, 2)):
        r0, c0 = r.randrange(rows), r.randrange(cols)
        r1, c1 = r.randint(r0, rows - 1), r.randint(c0, cols - 1)
        if (r0, c0) == (r1, c1):
            continue
        try:
            t.cell(r0, c0).merge(t.cell(r1, c1))
        except Exception:  # a rectangle over an earlier merge: python-docx refuses it
            continue
        features.add("merged across" if r0 == r1 else "merged down" if c0 == c1 else "merged across and down")
    features.add("table")


def main() -> None:
    if len(sys.argv) not in (3, 4, 5):
        sys.exit(__doc__)
    backend, out = Path(sys.argv[1]), Path(sys.argv[2])
    count = int(sys.argv[3]) if len(sys.argv) > 3 else 60
    seed = int(sys.argv[4]) if len(sys.argv) > 4 else 20261114
    read = v1_reader(backend)
    r = random.Random(seed)
    cases = []
    with tempfile.TemporaryDirectory() as tmp:
        for n in range(count):
            document, features = docx.Document(), set()
            for _ in range(r.randint(1, 6)):
                (paragraph if r.random() < 0.55 else table)(document, r, features)
            path = Path(tmp) / f"case-{n}.docx"
            document.save(str(path))
            with zipfile.ZipFile(path) as z:
                xml = z.read("word/document.xml").decode("utf-8")
            cases.append({"name": f"case {n + 1}", "features": sorted(features), "documentXml": xml, "v1": read(path)})
    out.write_text(json.dumps({"seed": seed, "pythonDocx": docx.__version__ if hasattr(docx, "__version__") else "?",
                               "cases": cases}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(cases)} cases written to {out}")


if __name__ == "__main__":
    main()
