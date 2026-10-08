"""
Subset do Noto Sans SC (SIL OFL 1.1) por peso, só com os caracteres de cada papel tipográfico.

Entrada : app/fonts/cjk-<500|700|900>.chars.txt (gerado por scripts/cjk-chars.ts)
Fonte   : --source <pasta que contém node_modules/@fontsource/noto-sans-sc>
          (instale fora do repositório: `npm install @fontsource/noto-sans-sc --prefix <pasta>`)
Saída   : app/fonts/noto-sans-sc-<peso>-subset.woff2 e app/fonts/OFL-NotoSansSC.txt
Requer fonttools + brotli em ambiente Python isolado (não são dependências do projeto).
"""
import argparse
import re
import shutil
import sys
from pathlib import Path

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont

SITE = Path(__file__).resolve().parent.parent
FONTS = SITE / "app" / "fonts"
WEIGHTS = (500, 700, 900)


def parse_slices(css: str, weight: int):
    pattern = re.compile(
        r"url\(\./files/([^)]*-%d-normal\.woff2)\)[^;]*;\s*(?:font-[^;]*;\s*)*?unicode-range:\s*([^;]+);" % weight, re.S
    )
    for match in pattern.finditer(css):
        yield match.group(1), match.group(2)


def in_range(codepoint: int, ranges: str) -> bool:
    for part in ranges.split(","):
        bounds = part.strip().removeprefix("U+").split("-")
        if int(bounds[0], 16) <= codepoint <= int(bounds[-1], 16):
            return True
    return False


def subset_slice(source: Path, text: str, target: Path) -> None:
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    font = subset.load_font(str(source), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    font.flavor = None
    font.save(str(target))


def build_weight(package: Path, weight: int, work: Path) -> tuple[Path, str]:
    chars = (FONTS / f"cjk-{weight}.chars.txt").read_text(encoding="utf-8").strip()
    css = (package / f"{weight}.css").read_text(encoding="utf-8")
    parts = []
    for filename, ranges in parse_slices(css, weight):
        needed = "".join(c for c in chars if in_range(ord(c), ranges))
        if needed:
            target = work / f"{weight}-{len(parts)}.ttf"
            subset_slice(package / "files" / filename, needed, target)
            parts.append(str(target))
    merged = Merger().merge(parts) if len(parts) > 1 else TTFont(parts[0])
    merged.flavor = "woff2"
    out = FONTS / f"noto-sans-sc-{weight}-subset.woff2"
    merged.save(str(out))
    covered = {chr(cp) for cp in merged.getBestCmap()}
    return out, "".join(c for c in chars if c not in covered)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    package = parser.parse_args().source / "node_modules" / "@fontsource" / "noto-sans-sc"
    work = SITE / ".font-work"
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir()
    failed = False
    for weight in WEIGHTS:
        out, missing = build_weight(package, weight, work)
        print(f"{weight}: {out.name} {out.stat().st_size / 1024:.1f} KB; faltando: {missing or 'nenhum'}")
        failed = failed or bool(missing)
    shutil.copyfile(package / "LICENSE", FONTS / "OFL-NotoSansSC.txt")
    shutil.rmtree(work, ignore_errors=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
