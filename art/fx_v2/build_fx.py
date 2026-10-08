#!/usr/bin/env python
"""Cut the generated battle-effect sheets (art/fx_v2/*.png) into single sprites for the game.

    python art/fx_v2/build_fx.py            cut every sheet and single into art/raw/fx_<name>.png, rebuild _sheet.png
    python art/fx_v2/build_fx.py --sheet-only   only rebuild the contact sheet from art/raw/fx_*.png

Sheets are cut by connected clusters of the alpha channel (a dilated mask joins a shaft with its fletching, a ladle with its
steam), ordered row by row, left to right. The generator leaves a wide soft halo and a few coloured speckles round every
object: `halo` is how far (px, in the sheet's own pixels) the soft glow is kept beyond the solid core, 0 cuts it hard.
Then python tools/process_art.py trims and fits the sprites (the `fx_zone_`, `fx_shield_` and `fx_foe_` prefixes have their own
sizes and keep the picture centred on its middle, because particles and enemies are placed against that point).

Sheets whose objects touch (a fireball's tail reaches the snowball beside it) are cut by explicit windows instead (`WINDOWS`).
Every piece goes through `decontaminate`: the generator's background keying leaves cyan, blue and magenta speckles on the
half-transparent pixels, so those take the colour of the nearest solid pixel instead.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
RAW = ROOT / "art" / "raw"

# (sheet, [(name, halo px)...]) in reading order. A single image is a sheet of one.
SHEETS: dict[str, list[tuple[str, int]]] = {
    "sheet_shots_a": [("shot_pebble", 4), ("shot_arrow", 6), ("shot_shuriken", 8), ("shot_cork", 4), ("shot_moon", 26), ("shot_coin", 8)],
    "sheet_shots_b": [("shot_snow", 14), ("shot_fire", 10), ("shot_ice", 14), ("shot_void", 22), ("shot_note", 18), ("shot_flask", 10), ("shot_ladle", 4), ("shot_bell", 22)],
    "sheet_bolts": [("bolt_0", 16), ("bolt_1", 16), ("bolt_2", 16), ("bolt_3", 16), ("bolt_4", 16), ("bolt_5", 16)],
    "sheet_foe_rings": [("foe_haste", 18), ("foe_heal", 18)],
    "sheet_bursts": [("burst_star", 40), ("burst_ring", 30), ("burst_glint", 40), ("burst_slash", 30), ("burst_sparks", 20), ("burst_puff", 24)],
    "sheet_marks": [("mark_scorch", 10), ("mark_snow", 10)],
    "shield_shards": [("shard_0", 6), ("shard_1", 6), ("shard_2", 6), ("shard_3", 6), ("shard_4", 6), ("shard_5", 6)],
    "zone_frost": [("zone_frost", 12)],
    "zone_snow": [("zone_snow", 12)],
    "zone_hole": [("zone_hole", 14)],
    "zone_holearms": [("zone_holearms", 14)],
    "zone_potion": [("zone_ooze", 12)],
    "zone_puddle": [("zone_puddle", 12)],
    "shield_dome": [("shield_dome", 10)],
    "shield_crack1": [("shield_crack1", 14)],
    "shield_crack2": [("shield_crack2", 14)],
}

# Explicit cut windows (x0, y0, x1, y1) in the sheet's pixels, in the same order as SHEETS lists them.
WINDOWS: dict[str, list[tuple[int, int, int, int]]] = {
    "sheet_shots_b": [
        (0, 0, 385, 440), (385, 0, 905, 440), (905, 0, 1400, 440), (1400, 0, 1774, 440),
        (0, 430, 440, 887), (440, 430, 860, 887), (860, 430, 1420, 887), (1420, 430, 1774, 887),
    ],
}
# Uniform grids (columns, rows) for sheets whose cells are the same size.
GRIDS: dict[str, tuple[int, int]] = {"sheet_bolts": (2, 3), "sheet_foe_rings": (2, 1)}

# Pieces that are not cut from a sheet's clusters but redrawn from what the picture has: the crack overlays are thin white lines.
LINE_ONLY = {"shield_crack1", "shield_crack2"}

CORE_ALPHA = 70
JOIN = 28


def clusters(alpha: np.ndarray, want: int) -> list[tuple[int, int, int, int]]:
    core = alpha >= CORE_ALPHA
    joined = ndimage.binary_dilation(core, iterations=JOIN)
    lab, n = ndimage.label(joined)
    boxes = []
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        if sl is None:
            continue
        area = int((core[sl] & (lab[sl] == i)).sum())
        if area < 400:
            continue
        boxes.append((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop, area))
    # keep the biggest `want` clusters, then order them in reading order
    boxes = sorted(boxes, key=lambda b: -b[4])[:want]
    if not boxes:
        return []
    rows = max(1, round(want ** 0.5)) if want > 3 else 1
    if want == 6:
        rows = 2
    if want == 8:
        rows = 2
    if want == 2:
        rows = 1
    boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
    per_row = -(-len(boxes) // rows)
    ordered: list[tuple[int, int, int, int]] = []
    for r in range(rows):
        row = sorted(boxes[r * per_row:(r + 1) * per_row], key=lambda b: (b[0] + b[2]) / 2)
        ordered += [(b[0], b[1], b[2], b[3]) for b in row]
    return ordered


def clean(im: Image.Image, halo: int) -> Image.Image:
    """Keep the solid object and a soft falloff of `halo` px of its glow; drop the speckled fringe beyond."""
    arr = np.asarray(im.convert("RGBA")).astype(np.float32)
    alpha = arr[..., 3]
    core = alpha >= CORE_ALPHA
    # drop stray specks that are not part of the biggest bodies
    lab, n = ndimage.label(ndimage.binary_dilation(core, iterations=6))
    if n > 1:
        sizes = ndimage.sum(core, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool)
        for i, s in enumerate(sizes, start=1):
            keep[i] = s >= 0.01 * sizes.max()
        core = core & keep[lab]
    dist = ndimage.distance_transform_edt(~core)
    fall = np.clip(1.0 - dist / max(1, halo), 0.0, 1.0) ** 1.6 if halo > 0 else (dist <= 1.5).astype(np.float32)
    out = arr.copy()
    out[..., 3] = np.where(core, alpha, alpha * fall)
    return Image.fromarray(np.clip(decontaminate(out), 0, 255).astype(np.uint8), "RGBA")


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


def glass(im: Image.Image) -> Image.Image:
    """Make the dome's frosted body see-through (a thin film that thickens toward the edge) and keep its seams, nodes and rim solid."""
    arr = np.asarray(im.convert("RGBA")).astype(np.float32)
    h, w = arr.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.hypot(xx - w / 2, yy - h / 2) / (min(w, h) / 2)
    white = arr[..., :3].min(axis=2)
    line = np.clip((white - 205) / 40.0, 0.0, 1.0)
    film = 0.16 + 0.5 * np.clip(r, 0.0, 1.0) ** 2.5
    a = arr[..., 3] / 255.0
    out = arr.copy()
    out[..., 3] = np.clip(a * (film + (1.0 - film) * line), 0.0, 1.0) * 255.0
    # The glass is steel blue and its seams, nodes and rim white: the colour is in the picture, so the game does not tint it.
    steel = np.array([92, 146, 232], np.float32)
    k = line[..., None]
    out[..., :3] = steel * (1.0 - k) + 255.0 * k
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), "RGBA")


def hairlines(im: Image.Image) -> Image.Image:
    """Keep only the white crack lines of an overlay and give them a soft pale-blue glow (the generator drew a fat blue band round them)."""
    arr = np.asarray(im.convert("RGBA")).astype(np.float32)
    white = arr[..., :3].min(axis=2)
    line = ((white > 205) & (arr[..., 3] > 110)).astype(np.float32)
    # the picture is only trustworthy inside its circle: nothing is kept near the rim
    h, w = line.shape
    yy, xx = np.mgrid[0:h, 0:w]
    inside = (np.hypot(xx - w / 2, yy - h / 2) < 0.47 * min(w, h)).astype(np.float32)
    line *= inside
    core = ndimage.gaussian_filter(line, 0.9)
    glow = ndimage.gaussian_filter(line, 5.0)
    a = np.clip(core * 1.5 + glow * 1.6, 0.0, 1.0)
    rgb = np.empty((h, w, 3), np.float32)
    k = np.clip(core * 1.6, 0.0, 1.0)[..., None]
    rgb[:] = np.array([150, 205, 255], np.float32) * (1 - k) + np.array([255, 255, 255], np.float32) * k
    return Image.fromarray(np.dstack([rgb, a * 255]).clip(0, 255).astype(np.uint8), "RGBA")


def windows(sheet: str, im: Image.Image, want: int) -> list[tuple[int, int, int, int]]:
    if sheet in WINDOWS:
        return WINDOWS[sheet]
    if sheet in GRIDS:
        cols, rows = GRIDS[sheet]
        cw, ch = im.width // cols, im.height // rows
        return [(c * cw, r * ch, (c + 1) * cw, (r + 1) * ch) for r in range(rows) for c in range(cols)]
    return []


def cut() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for sheet, items in SHEETS.items():
        src = HERE / f"{sheet}.png"
        if not src.exists():
            print(f"[fx] missing {src.name}")
            continue
        im = Image.open(src).convert("RGBA")
        if sheet in LINE_ONLY:
            piece = hairlines(im)
            piece.save(RAW / f"fx_{items[0][0]}.png")
            print(f"[fx] {sheet} -> fx_{items[0][0]}.png {piece.size} (lines only)")
            continue
        wins = windows(sheet, im, len(items))
        if wins:
            for (name, halo), win in zip(items, wins):
                piece = clean(trim_to_content(im.crop(win)), halo)
                piece = trim_to_content(piece)
                piece.save(RAW / f"fx_{name}.png")
                print(f"[fx] {sheet} -> fx_{name}.png {piece.size}")
            continue
        if sheet == "shield_dome":
            piece = glass(clean(im, items[0][1]))
            piece.save(RAW / f"fx_{items[0][0]}.png")
            print(f"[fx] {sheet} -> fx_{items[0][0]}.png {piece.size} (glass)")
            continue
        alpha = np.asarray(im)[..., 3]
        boxes = clusters(alpha, len(items))
        if len(boxes) != len(items):
            print(f"[fx] {sheet}: found {len(boxes)} clusters, wanted {len(items)}")
        for (name, halo), (x0, y0, x1, y1) in zip(items, boxes):
            pad = max(halo, 4) + 6
            box = (max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad))
            piece = clean(im.crop(box), halo)
            piece.save(RAW / f"fx_{name}.png")
            print(f"[fx] {sheet} -> fx_{name}.png {piece.size}")


def trim_to_content(im: Image.Image, pad: int = 6) -> Image.Image:
    """Crop to the pixels that are at least faintly there."""
    a = np.asarray(im.convert("RGBA"))[..., 3]
    ys, xs = np.where(a > 10)
    if len(xs) == 0:
        return im
    return im.crop((max(0, int(xs.min()) - pad), max(0, int(ys.min()) - pad), min(im.width, int(xs.max()) + 1 + pad), min(im.height, int(ys.max()) + 1 + pad)))


def contact_sheet() -> None:
    files = sorted(RAW.glob("fx_*.png"))
    if not files:
        return
    cell = 200
    cols = 8
    rows = -(-len(files) // cols)
    backs = [(120, 120, 120), (150, 104, 66)]
    out = Image.new("RGB", (cols * cell, rows * cell * len(backs)), (0, 0, 0))
    d = ImageDraw.Draw(out)
    for bi, bg in enumerate(backs):
        for i, f in enumerate(files):
            x, y = (i % cols) * cell, (i // cols) * cell + bi * rows * cell
            d.rectangle((x, y, x + cell - 1, y + cell - 1), fill=bg)
            im = Image.open(f).convert("RGBA")
            s = min((cell - 24) / im.width, (cell - 24) / im.height)
            im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
            out.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2), im)
            d.text((x + 4, y + 3), f.stem[3:], fill=(255, 255, 255))
    out.save(HERE / "_sheet.png")
    print(f"[fx] _sheet.png {out.size}, {len(files)} sprites")


if __name__ == "__main__":
    if "--sheet-only" not in sys.argv:
        cut()
    contact_sheet()
