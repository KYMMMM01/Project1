#!/usr/bin/env python
"""Turn raw generated art (art/raw/*.png) into game-ready WebP files in src/assets/img/.

The file-name prefix selects the treatment:
    unit_*    trim to the opaque bounding box, fit inside 320 px, alpha WebP
    enemy_*   trim, fit inside 240 px
    boss_*    trim, fit inside 480 px
    icon_*    trim, fit inside 192 px
    relic_*   trim, fit inside 192 px
    fx_*      trim, fit inside 256 px
    ui_*      trim, fit inside 512 px
    logo_*    trim, fit inside 640 px wide
    bg_*      scale to 720 px wide keeping the full picture, opaque WebP
    keyart_*  scale to 1080 px wide, opaque WebP

Sizes are ~2x the on-screen size at the 720-wide design resolution, i.e. crisp on a DPR-2 phone.
Sprites are trimmed so every image's anchor maths can assume "the picture fills its texture".
Run:  python tools/process_art.py [--only unit_knight,bg_home] [--force]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "art" / "raw"
OUT = ROOT / "src" / "assets" / "img"

SPRITE_MAX = {
    "unit_": 320,
    "enemy_": 240,
    "boss_": 480,
    "icon_": 192,
    "relic_": 192,
    "fx_": 256,
    "ui_": 512,
    "logo_": 640,
}
ALPHA_THRESHOLD = 12
PAD = 4


def trim_alpha(im: Image.Image) -> Image.Image:
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > ALPHA_THRESHOLD)
    if len(xs) == 0:
        return im
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    return im.crop((int(x0), int(y0), int(x1), int(y1)))


def clean_alpha(im: Image.Image) -> Image.Image:
    """Zero out near-invisible pixels so stray specks do not inflate the trim box or leave halos."""
    arr = np.asarray(im).copy()
    arr[arr[..., 3] <= ALPHA_THRESHOLD] = 0
    return Image.fromarray(arr, "RGBA")


def has_real_alpha(im: Image.Image) -> bool:
    a = np.asarray(im.convert("RGBA"))[..., 3]
    return float((a < 250).mean()) > 0.02


def process_sprite(src: Path, dst: Path, max_side: int) -> str:
    im = Image.open(src).convert("RGBA")
    if not has_real_alpha(im):
        return "NO-ALPHA (background is opaque; regenerate with a transparent background)"
    im = trim_alpha(clean_alpha(im))
    w, h = im.size
    scale = min(1.0, max_side / max(w, h))
    if scale < 1.0:
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (im.width + PAD * 2, im.height + PAD * 2), (0, 0, 0, 0))
    canvas.paste(im, (PAD, PAD))
    canvas.save(dst, "WEBP", quality=92, method=6, exact=False)
    return f"{canvas.width}x{canvas.height}"


def process_bg(src: Path, dst: Path) -> str:
    # Keep the whole picture: the props that give each room its character sit at the edges. The
    # battle scene centres it on the playfield and the HUD panels cover whatever height is missing.
    im = Image.open(src).convert("RGB")
    w, h = im.size
    th = round(h * 720 / w)
    im = im.resize((720, th), Image.LANCZOS)
    im.save(dst, "WEBP", quality=86, method=6)
    return f"720x{th}"


def process_keyart(src: Path, dst: Path) -> str:
    im = Image.open(src).convert("RGB")
    w, h = im.size
    if w > 1080:
        im = im.resize((1080, round(h * 1080 / w)), Image.LANCZOS)
    im.save(dst, "WEBP", quality=88, method=6)
    return f"{im.width}x{im.height}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    only = {s.strip() for s in args.only.split(",")} if args.only else None
    OUT.mkdir(parents=True, exist_ok=True)
    problems = 0
    for src in sorted(RAW.glob("*.png")):
        name = src.stem
        if only and name not in only:
            continue
        dst = OUT / f"{name}.webp"
        if dst.exists() and not args.force and dst.stat().st_mtime >= src.stat().st_mtime:
            continue
        if name.startswith("bg_"):
            info = process_bg(src, dst)
        elif name.startswith("keyart_"):
            info = process_keyart(src, dst)
        else:
            side = next((v for k, v in SPRITE_MAX.items() if name.startswith(k)), None)
            if side is None:
                print(f"[art] skip {name}: unknown prefix")
                continue
            info = process_sprite(src, dst, side)
        if info.startswith("NO-ALPHA"):
            problems += 1
            print(f"[art] {name}: {info}")
            continue
        kb = dst.stat().st_size / 1024
        print(f"[art] {name}: {info}, {kb:.0f} KB")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
