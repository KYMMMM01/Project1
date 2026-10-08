#!/usr/bin/env python
"""Cut the battle-effect sheets of art/fx_v3 (flat cartoon style, made by tools/gen_image.py from art/fx_v3/jobs.json) into single sprites.

    python art/fx_v3/build_fx.py              cut every sheet into art/raw/fx_<name>.png and rebuild _sheet.png
    python art/fx_v3/build_fx.py --sheet-only only rebuild the contact sheet from art/raw/fx_*.png

Then run `python tools/process_art.py` (trims, fits and writes src/assets/img/fx_*.webp).

Every sheet is a strict grid (columns, rows), so a piece is the cell it sits in; the generator's soft halo is cut hard (these are flat
drawings with a brown outline, not light) and the half-transparent fringe takes the colour of the nearest solid pixel. Pieces that must
turn about their middle (the ground areas and the rings) are written on a square canvas centred on that middle:
  centre  the middle of the picture's bounding box (a disc, a ring)
  pin     the centre of mass of what is drawn (a pinwheel of arms, which is not round)
  trim    the bounding box (a shot, a burst, a bolt)
  big     the bounding box of the biggest piece only (a snowball without the chunks beside it)
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
RAW = ROOT / "art" / "raw"

CORE_ALPHA = 90
# (sheet, (columns, rows), [(piece, mode), ...]) in reading order.
SHEETS: dict[str, tuple[tuple[int, int], list[tuple[str, str]]]] = {
    "sheet_shots_a": ((3, 2), [("shot_pebble", "trim"), ("shot_arrow", "trim"), ("shot_shuriken", "trim"), ("shot_cork", "trim"), ("shot_moon", "trim"), ("shot_coin", "trim")]),
    "sheet_shots_b": ((2, 2), [("shot_snow", "big"), ("shot_fire", "trim"), ("shot_ice", "trim"), ("shot_void", "trim")]),
    "sheet_shots_c": ((2, 2), [("shot_note", "trim"), ("shot_flask", "trim"), ("shot_ladle", "trim"), ("shot_bell", "trim")]),
    "sheet_bursts": ((3, 2), [("burst_star", "centre"), ("burst_ring", "centre"), ("burst_glint", "centre"), ("burst_slash", "trim"), ("burst_sparks", "trim"), ("burst_puff", "trim")]),
    "sheet_marks": ((2, 1), [("mark_scorch", "centre"), ("mark_snow", "centre")]),
    "sheet_bolts": ((2, 3), [(f"bolt_{i}", "trim") for i in range(6)]),
    "zones_a": ((2, 1), [("zone_frost", "centre"), ("zone_snow", "pin")]),
    "zones_b": ((2, 1), [("zone_hole", "centre"), ("zone_holearms", "pin")]),
    "zones_c": ((2, 1), [("zone_ooze", "centre"), ("zone_puddle", "centre")]),
    "sheet_foe_rings": ((2, 1), [("foe_haste", "centre"), ("foe_heal", "centre")]),
    "shield_bits_blue": ((3, 2), [("badge_shield", "trim")] + [(f"shard_{i}", "trim") for i in range(5)]),
}


# Sheets whose objects do not stay inside an even grid cell (a ladle's bowl reaches over the line to the bell beside it): the cut windows
# (x0, y0, x1, y1) in the sheet's pixels, in reading order.
WINDOWS: dict[str, list[tuple[int, int, int, int]]] = {
    "sheet_shots_c": [(0, 0, 627, 650), (627, 0, 1254, 650), (0, 650, 760, 1254), (760, 650, 1254, 1254)],
}


def decontaminate(arr: np.ndarray) -> np.ndarray:
    """Half-transparent pixels take the colour of the nearest solid pixel, in proportion to how transparent they are."""
    alpha = arr[..., 3]
    solid = alpha >= 190
    if not solid.any():
        return arr
    idx = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
    near = arr[idx[0], idx[1], :3]
    w = np.clip(1.0 - alpha / 190.0, 0.0, 1.0)[..., None]
    out = arr.copy()
    out[..., :3] = arr[..., :3] * (1 - w) + near * w
    return out


def clean(im: Image.Image, only_biggest: bool) -> Image.Image:
    """Cut the soft halo off hard: keep what is within a pixel and a half of the solid drawing, drop stray specks."""
    arr = np.asarray(im.convert("RGBA")).astype(np.float32)
    alpha = arr[..., 3]
    core = alpha >= CORE_ALPHA
    lab, n = ndimage.label(ndimage.binary_dilation(core, iterations=2 if only_biggest else 8))
    if n > 1:
        sizes = ndimage.sum(core, lab, range(1, n + 1))
        floor = (0.9 if only_biggest else 0.012) * sizes.max()
        keep = np.zeros(n + 1, bool)
        for i, s in enumerate(sizes, start=1):
            keep[i] = s >= floor
        core = core & keep[lab]
    dist = ndimage.distance_transform_edt(~core)
    out = arr.copy()
    out[..., 3] = np.where(dist <= 1.2, alpha, 0)
    out[..., 3] = np.where(core, np.maximum(out[..., 3], alpha), out[..., 3])
    return Image.fromarray(np.clip(decontaminate(out), 0, 255).astype(np.uint8), "RGBA")


def bbox(im: Image.Image) -> tuple[int, int, int, int]:
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > 12)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def on_square(im: Image.Image, cx: float, cy: float) -> Image.Image:
    """The picture on a square canvas whose middle is (cx, cy) of the picture."""
    x0, y0, x1, y1 = bbox(im)
    half = int(np.ceil(max(cx - x0, x1 - cx, cy - y0, y1 - cy))) + 2
    canvas = Image.new("RGBA", (2 * half, 2 * half), (0, 0, 0, 0))
    canvas.paste(im, (round(half - cx), round(half - cy)))
    return canvas


def piece(cell: Image.Image, mode: str) -> Image.Image:
    cell = clean(cell, mode == "big")
    x0, y0, x1, y1 = bbox(cell)
    if mode in ("trim", "big"):
        return cell.crop((max(0, x0 - 4), max(0, y0 - 4), min(cell.width, x1 + 4), min(cell.height, y1 + 4)))
    if mode == "pin":
        a = np.asarray(cell)[..., 3].astype(np.float32)
        ys, xs = np.mgrid[0:a.shape[0], 0:a.shape[1]]
        return on_square(cell, float((xs * a).sum() / a.sum()), float((ys * a).sum() / a.sum()))
    return on_square(cell, (x0 + x1) / 2, (y0 + y1) / 2)


def cut() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for sheet, ((cols, rows), items) in SHEETS.items():
        src = HERE / f"{sheet}.png"
        if not src.exists():
            print(f"[fx] missing {src.name}")
            continue
        im = Image.open(src).convert("RGBA")
        cw, ch = im.width // cols, im.height // rows
        for i, (name, mode) in enumerate(items):
            c, r = i % cols, i // cols
            window = WINDOWS[sheet][i] if sheet in WINDOWS else (c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)
            out = piece(im.crop(window), mode)
            out.save(RAW / f"fx_{name}.png")
            print(f"[fx] {sheet} -> fx_{name}.png {out.size} ({mode})")


def contact_sheet() -> None:
    """Every sprite on the wood of the floor and on the cream of the board, as it reads in a battle."""
    files = sorted(RAW.glob("fx_*.png"))
    if not files:
        return
    cell, cols = 200, 8
    rows = -(-len(files) // cols)
    backs = [(0xC4, 0x8F, 0x50), (0xFB, 0xF3, 0xE2)]
    out = Image.new("RGB", (cols * cell, rows * cell * len(backs)), (0, 0, 0))
    d = ImageDraw.Draw(out)
    for bi, bg in enumerate(backs):
        label = (255, 255, 255) if bi == 0 else (90, 70, 50)
        for i, f in enumerate(files):
            x, y = (i % cols) * cell, (i // cols) * cell + bi * rows * cell
            d.rectangle((x, y, x + cell - 1, y + cell - 1), fill=bg)
            im = Image.open(f).convert("RGBA")
            s = min((cell - 24) / im.width, (cell - 24) / im.height)
            im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
            out.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2), im)
            d.text((x + 4, y + 3), f.stem[3:], fill=label)
    out.save(HERE / "_sheet.png")
    print(f"[fx] _sheet.png {out.size}, {len(files)} sprites")


if __name__ == "__main__":
    if "--sheet-only" not in sys.argv:
        cut()
    contact_sheet()
