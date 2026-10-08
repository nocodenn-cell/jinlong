"""
Subset da Noto Serif SC 600 (SIL OFL 1.1) para os caracteres dos títulos zh-CN.

Fonte: fatias woff2 de @fontsource/noto-serif-sc (já no monorepo).
Saída: app/fonts/noto-serif-sc-600-subset.woff2 (+ OFL.txt ao lado).
Requer fonttools + brotli em ambiente isolado (não é dependência do projeto).
"""
import re
import shutil
import sys
from pathlib import Path

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont

SITE = Path(__file__).resolve().parent.parent
FONTSOURCE = SITE.parent / "node_modules" / "@fontsource" / "noto-serif-sc"
CHARS_FILE = SITE / "app" / "fonts" / "noto-serif-sc-600.chars.txt"
OUT_FONT = SITE / "app" / "fonts" / "noto-serif-sc-600-subset.woff2"
WORK = SITE / ".font-work"


def parse_slices(css: str):
    pattern = re.compile(r"url\(\./files/([^)]+?-600-normal\.woff2)\).*?unicode-range:\s*([^;]+);", re.S)
    for match in pattern.finditer(css):
        yield match.group(1), match.group(2)


def in_range(codepoint: int, ranges: str) -> bool:
    for part in ranges.split(","):
        bounds = part.strip().removeprefix("U+").split("-")
        low = int(bounds[0], 16)
        high = int(bounds[-1], 16)
        if low <= codepoint <= high:
            return True
    return False


def subset_slice(source: Path, text: str, target: Path) -> None:
    options = subset.Options()
    options.flavor = None
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    font = subset.load_font(str(source), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    font.flavor = None
    font.save(str(target))


def main() -> int:
    chars = CHARS_FILE.read_text(encoding="utf-8").strip()
    css = (FONTSOURCE / "600.css").read_text(encoding="utf-8")
    shutil.rmtree(WORK, ignore_errors=True)
    WORK.mkdir()
    parts = []
    for filename, ranges in parse_slices(css):
        needed = "".join(c for c in chars if in_range(ord(c), ranges))
        if not needed:
            continue
        target = WORK / f"{len(parts)}.ttf"
        subset_slice(FONTSOURCE / "files" / filename, needed, target)
        parts.append(str(target))
    merged = Merger().merge(parts) if len(parts) > 1 else TTFont(parts[0])
    merged.flavor = "woff2"
    merged.save(str(OUT_FONT))
    shutil.copyfile(FONTSOURCE / "LICENSE", OUT_FONT.parent / "OFL.txt")
    covered = set(chr(cp) for cp in merged.getBestCmap())
    missing = [c for c in chars if c not in covered]
    shutil.rmtree(WORK, ignore_errors=True)
    print(f"{len(parts)} fatias -> {OUT_FONT.name}: {OUT_FONT.stat().st_size / 1024:.1f} KB; faltando: {''.join(missing) or 'nenhum'}")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
