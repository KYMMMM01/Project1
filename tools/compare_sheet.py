#!/usr/bin/env python
"""Before/after review sheet:  python tools/compare_sheet.py <out.png> <old-dir> <new-dir> [name-prefix ...]

Every PNG in <new-dir> (optionally filtered by prefix) is shown under the file of the same name in <old-dir>.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

out, old_dir, new_dir = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
prefixes = sys.argv[4:]
names = sorted(p.stem for p in new_dir.glob("*.png") if not p.stem.startswith("_") and (not prefixes or any(p.stem.startswith(x) for x in prefixes)))
TILE, COLS, LABEL = 220, 6, 26
PAPER, SLOT, INK = (250, 244, 232), (238, 228, 208), (74, 50, 34)
try:
    font = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 18)
except OSError:
    font = ImageFont.load_default()


def fit(path: Path) -> Image.Image | None:
    if not path.exists():
        return None
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > 12)
    if len(xs):
        im = im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    s = min((TILE - 20) / im.width, (TILE - 20) / im.height)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


rows = max(1, (len(names) + COLS - 1) // COLS)
block = TILE * 2 + LABEL + 14
sheet = Image.new("RGBA", (COLS * (TILE + 8) + 8, rows * block + 8), PAPER + (255,))
d = ImageDraw.Draw(sheet)
for i, name in enumerate(names):
    x = 8 + (i % COLS) * (TILE + 8)
    y = 8 + (i // COLS) * block
    for k, folder in enumerate((old_dir, new_dir)):
        yy = y + k * TILE
        d.rounded_rectangle((x, yy, x + TILE, yy + TILE - 4), 18, fill=SLOT)
        im = fit(folder / f"{name}.png")
        if im:
            sheet.alpha_composite(im, (x + (TILE - im.width) // 2, yy + (TILE - 4 - im.height) // 2))
    d.text((x + 6, y + TILE * 2), name, fill=INK, font=font)
out.parent.mkdir(parents=True, exist_ok=True)
sheet.convert("RGB").save(out)
print(f"{len(names)} pairs -> {out} {sheet.size}")
