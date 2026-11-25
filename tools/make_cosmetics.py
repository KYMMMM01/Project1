#!/usr/bin/env python
"""Fit the approved profile frames and name plates (art/cosmetics_v1) to the game's canvases, as WebP in src/assets/img/.

A frame is placed by its hole, not by its outline: the transparent circle in the middle is measured (its centre from the
hits left, right, up and down, its radius the median of eight directions, so a coin or a rosette dipping into the hole on one
side does not shrink it) and scaled so the hole is 197 px across, centred on a canvas just wide and tall enough for the
frame's farthest painted pixel across and up or down (256 at least each way; a square sized by the farthest pixel in any
direction wasted the corners, where only round decorations reach). The game fits each canvas in the badge's box (FRAME_BOX_W x
FRAME_BOX_H, layoutMath) and the icon to the hole, so a frame with big decorations shows a smaller cat instead of running into
the screen's top or the currency pills (docs/명세_프로필꾸미기.md 2.2 and 9).

A plate is placed by its body: the rows the plate fills almost all the way across (crowns, ears and ornaments over it leave
gaps). The body is stretched to 704 x 120 and centred on an 800 x 200 canvas, drawn at PLATE_ART_W x PLATE_ART_H, so the body
lands on the home's 352 x 60 plate and what sticks out keeps its room.

Run:  python tools/make_cosmetics.py [--only frame_wood,plate_paw]
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "cosmetics_v1"
OUT = ROOT / "src" / "assets" / "img"

FRAME_MIN = 256
HOLE_D = 197
PLATE_CANVAS = (800, 200)
PLATE_BODY = (704, 120)
SOLID = 40  # alpha above this counts as painted


def solid(im: Image.Image) -> Image.Image:
    return im.getchannel("A").point(lambda v: 255 if v > SOLID else 0)


def hole(a: Image.Image) -> tuple[float, float, float]:
    """Centre and radius of the transparent circle in the middle of a frame."""
    l, t, r, b = a.getbbox()
    cx, cy = (l + r) / 2, (t + b) / 2

    def hit(dx: float, dy: float, x: float, y: float) -> int:
        k = 0
        while a.getpixel((int(x + dx * k), int(y + dy * k))) < 128:
            k += 1
        return k

    for _ in range(2):
        cx += (hit(1, 0, cx, cy) - hit(-1, 0, cx, cy)) / 2
        cy += (hit(0, 1, cx, cy) - hit(0, -1, cx, cy)) / 2
    d = 0.7071
    rs = sorted(hit(dx, dy, cx, cy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (d, d), (-d, d), (d, -d), (-d, -d)))
    return cx, cy, rs[len(rs) // 2]


def frame(im: Image.Image) -> Image.Image:
    a = solid(im)
    cx, cy, rin = hole(a)
    s = (HOLE_D / 2) / rin
    ys, xs = np.nonzero(np.asarray(a))
    w = max(FRAME_MIN, 2 * math.ceil(float(np.abs(xs + 0.5 - cx).max()) * s) + 4)
    h = max(FRAME_MIN, 2 * math.ceil(float(np.abs(ys + 0.5 - cy).max()) * s) + 4)
    big = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    out = Image.new("RGBA", (w, h))
    out.alpha_composite(big, (round(w / 2 - cx * s), round(h / 2 - cy * s)))
    return out


def plate(im: Image.Image) -> Image.Image:
    a = solid(im)
    l, t, r, b = a.getbbox()
    fill = [sum(a.crop((l, y, r, y + 1)).getdata()) / 255 for y in range(t, b)]
    body = [t + k for k, w in enumerate(fill) if w > 0.85 * (r - l)]
    bt, bb = body[0], body[-1] + 1
    sx, sy = PLATE_BODY[0] / (r - l), PLATE_BODY[1] / (bb - bt)
    big = im.resize((round(im.width * sx), round(im.height * sy)), Image.LANCZOS)
    out = Image.new("RGBA", PLATE_CANVAS)
    out.alpha_composite(big, (round(PLATE_CANVAS[0] / 2 - (l + r) / 2 * sx), round(PLATE_CANVAS[1] / 2 - (bt + bb) / 2 * sy)))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    only = set(filter(None, ap.parse_args().only.split(",")))
    for src in sorted(SRC.glob("*.png")):
        name = src.stem
        if only and name not in only:
            continue
        if name.startswith("frame_"):
            out = frame(Image.open(src).convert("RGBA"))
        elif name.startswith("plate_"):
            out = plate(Image.open(src).convert("RGBA"))
        else:
            continue
        dst = OUT / f"{name}.webp"
        out.save(dst, "WEBP", quality=88, method=6)
        print(f"{name}: {dst.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
