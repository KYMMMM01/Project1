#!/usr/bin/env python
"""Tile numbered frame shots into one labelled strip.

  ui_motion_tile.py <shots_dir> <key> [--region x,y,w,h] [--cols 6] [--cw 250] [--out name]

Reads <shots_dir>/<key>_<index>_t<ms>[_tag][_p<probe>].png (written by tools/ui_motion_capture.js after
tools/crop_shots.py cropped them to the canvas), crops each to the region given in DESIGN units
(720 wide), and writes <shots_dir>/strip_<key>.png with the game time (and probe value) on each cell.
"""
import argparse
import re
from pathlib import Path

from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument("dir")
ap.add_argument("key")
ap.add_argument("--region", default="0,0,720,1280")
ap.add_argument("--cols", type=int, default=6)
ap.add_argument("--cw", type=int, default=250)
ap.add_argument("--out", default=None)
ap.add_argument("--keep", action="store_true", help="keep the single frames")
a = ap.parse_args()

d = Path(a.dir)
rx, ry, rw, rh = [float(v) for v in a.region.split(",")]
pat = re.compile(rf"^{re.escape(a.key)}_(\d+)_t(\d+)(?:_([A-Za-z0-9-]+))?(?:_p(.+))?$")
files = []
for f in d.glob(f"{a.key}_*.png"):
    m = pat.match(f.stem)
    if m:
        files.append((int(m.group(1)), int(m.group(2)), m.group(3) or "", (m.group(4) or "").replace("~", "!"), f))
files.sort()
if not files:
    raise SystemExit("no frames for key " + a.key)

ch = round(a.cw * rh / rw)
label_h = 18
cells = []
for _, ms, tag, probe, f in files:
    im = Image.open(f).convert("RGB")
    k = im.width / 720.0
    crop = im.crop((round(rx * k), round(ry * k), round((rx + rw) * k), round((ry + rh) * k)))
    crop = crop.resize((a.cw, ch), Image.LANCZOS)
    cell = Image.new("RGB", (a.cw, ch + label_h), (34, 34, 34))
    cell.paste(crop, (0, label_h))
    text = f"{tag + ' ' if tag else ''}{ms / 1000:.2f}" + (f" {probe}" if probe else "")
    ImageDraw.Draw(cell).text((3, 3), text, fill=(255, 255, 255))
    cells.append(cell)

cols = a.cols
rows = (len(cells) + cols - 1) // cols
gap = 4
W = cols * a.cw + (cols - 1) * gap
H = rows * (ch + label_h) + (rows - 1) * gap
out = Image.new("RGB", (W, H), (0, 0, 0))
for i, c in enumerate(cells):
    out.paste(c, ((i % cols) * (a.cw + gap), (i // cols) * (ch + label_h + gap)))
name = a.out or f"strip_{a.key}"
out.save(d / f"{name}.png")
if not a.keep:
    for _, _, _, _, f in files:
        f.unlink()
        f.with_suffix(".json").unlink(missing_ok=True)
print(f"strip -> {d / (name + '.png')} ({W}x{H}, {len(cells)} frames)")
