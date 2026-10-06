#!/usr/bin/env python
"""Crop full-page captures down to the game canvas. Usage: crop_shots.py <src_dir> <out_dir>

Each <name>.png has a sidecar <name>.json holding the canvas rectangle in CSS pixels plus the
device pixel ratio, written by tools/aside_run.sh at capture time.
"""
import json
import sys
from pathlib import Path

from PIL import Image

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
MAX_H = 1400  # keep captures small enough to review quickly
for png in sorted(src.glob("*.png")):
    im = Image.open(png)
    meta = png.with_suffix(".json")
    if meta.exists():
        r = json.loads(meta.read_text(encoding="utf-8"))
        d = r.get("dpr", 1)
        box = (round(r["x"] * d), round(r["y"] * d), round((r["x"] + r["w"]) * d), round((r["y"] + r["h"]) * d))
        im = im.crop(box)
    if im.height > MAX_H:
        im = im.resize((round(im.width * MAX_H / im.height), MAX_H), Image.LANCZOS)
    im.convert("RGB").save(out / png.name)
    print(f"shot -> {out / png.name} ({im.width}x{im.height})")
