#!/usr/bin/env python
"""Review sheet of the unit roster as four class lines:  python tools/lineage_sheet.py [out.png] [src-dir]

Rows are classes, columns are ranks, so a merge reads left to right. Units without an image yet show
an empty slot. Names and breeds come from art/build_units_v2.py.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "art"))
from build_units_v2 import CLASSES, TIERS, UNITS  # noqa: E402

out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "art" / "units_v2" / "_lineage.png"
src = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "art" / "units_v2"

TILE, GAP, LEFT, TOP, ROW_H = 300, 56, 150, 90, 400
INK, SOFT, PAPER, SLOT = (74, 50, 34), (130, 100, 74), (250, 244, 232), (238, 228, 208)
CLASS_COLOUR = {"warrior": (214, 84, 70), "ranger": (92, 160, 84), "mage": (70, 120, 200), "trickster": (226, 172, 40)}


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    for f in (["C:/Windows/Fonts/malgunbd.ttf"] if bold else []) + ["C:/Windows/Fonts/malgun.ttf"]:
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


def fit(im: Image.Image, box: int) -> Image.Image:
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > 12)
    if len(xs):
        im = im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    s = min(box / im.width, box / im.height)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


classes = list(CLASSES)
W = LEFT + 5 * TILE + 4 * GAP + 40
H = TOP + len(classes) * ROW_H + 20
sheet = Image.new("RGBA", (W, H), PAPER + (255,))
d = ImageDraw.Draw(sheet)
f_head, f_name, f_breed, f_class = font(34), font(30), font(23, False), font(40)

for t in range(1, 6):
    x = LEFT + (t - 1) * (TILE + GAP)
    text = TIERS[t][0]
    d.text((x + (TILE - d.textlength(text, font=f_head)) / 2, 28), text, fill=INK, font=f_head)

for r, cls in enumerate(classes):
    y = TOP + r * ROW_H
    colour = CLASS_COLOUR[cls]
    d.rounded_rectangle((20, y + 8, 28, y + ROW_H - 24), 4, fill=colour)
    d.text((44, y + TILE / 2 - 24), CLASSES[cls]["ko"], fill=colour, font=f_class)
    for u in (u for u in UNITS if u[1] == cls):
        uid, _, tier, name, breed = u[:5]
        x = LEFT + (tier - 1) * (TILE + GAP)
        d.rounded_rectangle((x, y, x + TILE, y + TILE), 26, fill=SLOT)
        p = src / f"unit_{uid}.png"
        if p.exists():
            im = fit(Image.open(p).convert("RGBA"), TILE - 24)
            sheet.alpha_composite(im, (x + (TILE - im.width) // 2, y + (TILE - im.height) // 2))
        else:
            d.text((x + (TILE - d.textlength("생성 예정", font=f_breed)) / 2, y + TILE / 2 - 14), "생성 예정", fill=SOFT, font=f_breed)
        d.text((x + (TILE - d.textlength(name, font=f_name)) / 2, y + TILE + 8), name, fill=INK, font=f_name)
        d.text((x + (TILE - d.textlength(breed, font=f_breed)) / 2, y + TILE + 46), breed, fill=SOFT, font=f_breed)
        if tier < 5:
            ax, ay = x + TILE + GAP / 2, y + TILE / 2
            label = "합성" if tier < 4 else "각성"
            d.polygon([(ax - 14, ay - 16), (ax + 14, ay), (ax - 14, ay + 16)], fill=colour)
            d.text((ax - d.textlength(label, font=f_breed) / 2, ay + 22), label, fill=SOFT, font=f_breed)

out.parent.mkdir(parents=True, exist_ok=True)
sheet.convert("RGB").save(out)
print(f"-> {out} {sheet.size}")
