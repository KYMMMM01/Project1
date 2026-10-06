#!/usr/bin/env python
"""Contact sheet of raw art for quick review:  python tools/contact_sheet.py <out.png> <name-prefix> [...]"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "art" / "raw"
out = Path(sys.argv[1])
prefixes = sys.argv[2:]
files = sorted(p for p in RAW.glob("*.png") if any(p.stem.startswith(x) for x in prefixes))
TILE, COLS = 260, 5
rows = max(1, (len(files) + COLS - 1) // COLS)
# Mid-tone checker backdrop shows both the white sticker border and dark outlines.
sheet = Image.new("RGBA", (COLS * TILE, rows * (TILE + 22)), (110, 96, 150, 255))
draw = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert("RGBA")
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > 12)
    if len(xs):
        im = im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    opaque = float((np.asarray(Image.open(f).convert("RGBA"))[..., 3] > 250).mean())
    s = min((TILE - 16) / im.width, (TILE - 16) / im.height)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    x = (i % COLS) * TILE + (TILE - im.width) // 2
    y = (i // COLS) * (TILE + 22) + (TILE - im.height) // 2
    sheet.alpha_composite(im, (x, y))
    label = f.stem + ("  [NO ALPHA]" if opaque > 0.97 else "")
    draw.text(((i % COLS) * TILE + 6, (i // COLS) * (TILE + 22) + TILE + 4), label, fill=(255, 255, 255, 255))
out.parent.mkdir(parents=True, exist_ok=True)
sheet.convert("RGB").save(out)
print(f"{len(files)} images -> {out}")
