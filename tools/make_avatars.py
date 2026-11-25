#!/usr/bin/env python
"""Cut the 20 cats' profile avatars (head and upper body) out of the unit originals in art/raw/.

Each avatar is a square crop of art/raw/unit_<id>.png (the same original the game's unit_<id>.webp comes from),
shrunk to 192 x 192 RGBA and written as a WebP to src/assets/img/avatar_<id>.webp. The picture is square with a
transparent background because the game masks it into a round icon.

The crop box of each cat is {cx, cy, size} in original pixels in tools/avatars.json. A cat missing from the json
gets a first guess from the opaque bounding box (head side); a json value always wins.

Run:  python tools/make_avatars.py [--only w_paw,r_star] [--sheet]
      --sheet also writes .shots/avatars/sheet.png: the 20 avatars under a 160 px round mask (outside dimmed), 4 x 5.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "art" / "raw"
OUT = ROOT / "src" / "assets" / "img"
BOXES = ROOT / "tools" / "avatars.json"
SHEET = ROOT / ".shots" / "avatars" / "sheet.png"
ROSTER = ROOT / "src" / "game" / "data" / "roster.ts"

SIZE = 192
CIRCLE = 160
CELL_W, CELL_H = 200, 200


def unit_ids() -> list[str]:
    """The 20 ids in UNIT_GRID order (warrior, ranger, mage, trickster rows)."""
    grid = re.search(r"UNIT_GRID[^=]*=\s*\{(.*?)\n\};", ROOT.joinpath(ROSTER).read_text(encoding="utf-8"), re.S)
    return re.findall(r"'([a-z]_[a-z]+)'", grid.group(1)) if grid else []


def guess(img: Image.Image) -> dict:
    """First guess from the opaque bounding box: centred on x, a square a bit narrower than the body, near the top."""
    left, top, right, bottom = img.getchannel("A").getbbox()
    size = round((right - left) * 0.62)
    return {"cx": (left + right) // 2, "cy": top + round(size * 0.55), "size": size}


def crop(img: Image.Image, box: dict) -> Image.Image:
    half = box["size"] / 2
    region = (round(box["cx"] - half), round(box["cy"] - half), round(box["cx"] + half), round(box["cy"] + half))
    return img.crop(region).resize((SIZE, SIZE), Image.LANCZOS)  # crop pads with transparent outside the picture


def sheet(avatars: dict[str, Image.Image]) -> None:
    out = Image.new("RGBA", (CELL_W * 5, CELL_H * 4), (236, 226, 208, 255))
    mask = Image.new("L", (CIRCLE, CIRCLE), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, CIRCLE - 1, CIRCLE - 1), fill=255)
    draw = ImageDraw.Draw(out)
    for i, (uid, im) in enumerate(avatars.items()):
        x, y = (i % 5) * CELL_W, (i // 5) * CELL_H
        small = im.resize((CIRCLE, CIRCLE), Image.LANCZOS)
        dim = small.copy()
        dim.putalpha(small.getchannel("A").point(lambda a: a * 3 // 10))
        inside = small.copy()
        inside.putalpha(Image.composite(small.getchannel("A"), Image.new("L", (CIRCLE, CIRCLE), 0), mask))
        ox, oy = x + (CELL_W - CIRCLE) // 2, y + 8
        out.alpha_composite(dim, (ox, oy))
        out.alpha_composite(inside, (ox, oy))
        draw.ellipse((ox, oy, ox + CIRCLE - 1, oy + CIRCLE - 1), outline=(120, 90, 60, 255), width=1)
        draw.text((x + 8, y + CELL_H - 24), uid, fill=(60, 40, 20, 255))
    SHEET.parent.mkdir(parents=True, exist_ok=True)
    out.convert("RGB").save(SHEET)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--sheet", action="store_true")
    args = ap.parse_args()
    only = set(filter(None, args.only.split(",")))
    boxes = json.loads(BOXES.read_text(encoding="utf-8")) if BOXES.exists() else {}
    avatars: dict[str, Image.Image] = {}
    for uid in unit_ids():
        img = Image.open(RAW / f"unit_{uid}.png").convert("RGBA")
        box = boxes.get(uid) or guess(img)
        avatars[uid] = crop(img, box)
        if not only or uid in only:
            avatars[uid].save(OUT / f"avatar_{uid}.webp", "WEBP", quality=90, method=6)
            print(uid, box)
    if args.sheet:
        sheet(avatars)


if __name__ == "__main__":
    main()
