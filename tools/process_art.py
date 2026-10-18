#!/usr/bin/env python
"""Turn raw generated art (art/raw/*.png) into game-ready WebP files in src/assets/img/.

The file-name prefix selects the treatment:
    unit_*    trim to the opaque bounding box, fit inside 320 px, alpha WebP
    enemy_*   trim, fit inside 240 px
    boss_*    trim, fit inside 480 px
    icon_*    trim, fit inside 192 px
    relic_*   trim, fit inside 192 px
    cell_*    trim, fit inside 256 px (the special board cells of art/cells_v1)
    fx_*      trim, fit inside 256 px (fx_zone_ and fx_foe_: 384 px, fx_shield_: 320 px; these keep the picture's centre
              at the middle of the file, because particles and enemies are placed against that point)
              The skill scenes' pictures (art/skills_v1, chosen 2026-10-18) are fx_* too, with their own treatment:
                fx_capsule_<kind>   one whole closed shell, cut along its brown band into fx_capsule_<kind>_lid and
                                    fx_capsule_<kind>_base (same canvas, seam centre at the middle, the bowl's inside painted on the base)
                fx_cloud_<mood>     grumpy / zap / sigh: the cloud's body centred in the file, every mood at the same size
                fx_clone, fx_clone_pair   320 / 350 px (one scale for both, so a figure is the same size in either)
                fx_cut_*            320 px;  fx_meteor_ring 512 px;  fx_meteor_* 384 px
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
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "art" / "raw"
OUT = ROOT / "src" / "assets" / "img"

SPRITE_MAX = {
    "unit_": 320,
    "enemy_": 240,
    "boss_": 480,
    "icon_chest_": 360,  # drawn large in the chest opening; listed before "icon_" because the first prefix wins
    "icon_": 192,
    "relic_": 192,
    "fx_zone_": 384,
    "fx_foe_": 384,
    "fx_shield_": 320,
    "fx_clone_pair": 350,
    "fx_clone": 320,
    "fx_cut_": 320,
    "fx_meteor_ring": 512,
    "fx_meteor_": 384,
    "fx_cloud_bolt": 256,
    "fx_": 256,
    "cell_": 256,  # a chapter's special board cell: a floor tile drawn about 100 x 88 px
    "ui_": 512,
    "logo_": 640,
}
ALPHA_THRESHOLD = 12
PAD = 4
# Pictures with a meaningful middle (a black hole's core, a shield dome): trimmed to a square round the centre, not to the bounding box.
KEEP_CENTRE = ("fx_zone_", "fx_foe_", "fx_shield_")


def trim_alpha(im: Image.Image) -> Image.Image:
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > ALPHA_THRESHOLD)
    if len(xs) == 0:
        return im
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    return im.crop((int(x0), int(y0), int(x1), int(y1)))


def trim_centred(im: Image.Image) -> Image.Image:
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > ALPHA_THRESHOLD)
    if len(xs) == 0:
        return im
    cx, cy = im.width / 2, im.height / 2
    half = int(np.ceil(max(cx - xs.min(), xs.max() + 1 - cx, cy - ys.min(), ys.max() + 1 - cy)))
    return im.crop((int(cx - half), int(cy - half), int(cx + half), int(cy + half)))


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
    im = clean_alpha(im)
    im = trim_centred(im) if src.name.startswith(KEEP_CENTRE) else trim_alpha(im)
    w, h = im.size
    scale = min(1.0, max_side / max(w, h))
    if scale < 1.0:
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (im.width + PAD * 2, im.height + PAD * 2), (0, 0, 0, 0))
    canvas.paste(im, (PAD, PAD))
    canvas.save(dst, "WEBP", quality=92, method=6, exact=False)
    return f"{canvas.width}x{canvas.height}"


# ---------------------------------------------------------------------------------------------------------------------
# The skill scenes' pictures (art/skills_v1): the lucky cat's capsules and the storm cat's cloud need more than a trim.
# ---------------------------------------------------------------------------------------------------------------------

CAPSULE_BASE_PX = 180  # width of the bowl (the lower half of the shell, white sticker edge included) in the final file
CAPSULE_KINDS = ("fish", "purr", "partner", "more", "toy", "guardian")
CLOUD_MOODS = ("grumpy", "zap", "sigh")
CLOUD_BODY_PX = 150  # width of the cloud's slate body (ears and ink included, sticker edge and extras not) in the final file


def _largest(mask: np.ndarray, opening: int = 0) -> np.ndarray:
    m = ndimage.binary_opening(mask, iterations=opening) if opening else mask
    lab, n = ndimage.label(m)
    if n == 0:
        return m
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    return lab == (int(np.argmax(sizes)) + 1)


def split_capsule(im: Image.Image) -> tuple[Image.Image, Image.Image, tuple[float, float]]:
    """Cut a closed shell along its brown band into a lid and a base. Both come back on the full canvas of `im` (so they register
    when drawn at the same place), the lid keeping everything down to the end of the band's lower ink line, the base everything from
    the start of that line (the two overlap by the line, so no hairline shows between them while the shell is closed). The base also
    gets the inside of the bowl painted above its rim (a darker lens between the rim and its reflection through the seam centre),
    which the lid hides until it leaves. Returns (lid, base, seam centre in pixels of `im`)."""
    a = np.asarray(im).astype(int)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    brown = (al > 200) & (r > 85) & (r < 160) & (g > 45) & (g < 100) & (b > 35) & (b < 90) & (r > g + 15)
    band = ndimage.binary_dilation(_largest(brown, 2), iterations=2) & brown
    cols = np.where(band.any(0))[0]
    x0, x1 = int(cols.min()), int(cols.max())
    xs = np.arange(im.width)
    bottom = np.full(im.width, np.nan)
    for x in cols:
        bottom[x] = np.where(band[:, x])[0].max()
    ok = ~np.isnan(bottom)
    bottom = np.interp(xs, xs[ok], bottom[ok])
    k = 15
    bottom = np.convolve(np.pad(bottom, k // 2, mode="edge"), np.ones(k) / k, mode="valid")
    bottom[:x0] = bottom[x0]
    bottom[x1 + 1:] = bottom[x1]
    # the dark ink line under the band
    dark = (al > 200) & (r < 115) & (g < 75) & (b < 70)
    ink_end = np.zeros(im.width)
    for x in range(im.width):
        y = int(round(bottom[x])) + 1
        while y < im.height - 1 and dark[y, x]:
            y += 1
        ink_end[x] = y - 1 if y - 1 > bottom[x] else bottom[x] + 8
    yy, xx = np.mgrid[0:im.height, 0:im.width]
    lid = a.copy()
    lid[yy > ink_end[xx] - 1] = 0
    base = a.copy()
    base[yy < bottom[xx] + 2] = 0
    cx = (x0 + x1) / 2
    cy = (bottom[x0] + bottom[x1]) / 2 + 5
    # the inside of the bowl
    rim = bottom + 5
    lens = np.zeros((im.height, im.width), bool)
    for x in range(x0, x1 + 1):
        xr = int(round(2 * cx - x))
        if xr < x0 or xr > x1:
            continue
        far = 2 * cy - rim[xr]
        lens[int(round(min(far, rim[x]))):int(round(max(far, rim[x]))) + 1, x] = True
    lens &= al > 200
    inside = lens & (yy < bottom[xx] + 2)
    base[inside] = (188, 150, 120, 255)
    far_rim = np.zeros_like(lens)
    for x in range(x0, x1 + 1):
        col = np.where(lens[:, x])[0]
        if len(col):
            far_rim[col.min():col.min() + 6, x] = True
    base[far_rim & lens] = (63, 31, 22, 255)
    return Image.fromarray(lid.astype(np.uint8), "RGBA"), Image.fromarray(base.astype(np.uint8), "RGBA"), (cx, cy)


def process_capsule(src: Path, kind: str, out: Path) -> str:
    im = clean_alpha(Image.open(src).convert("RGBA"))
    lid, base, (cx, cy) = split_capsule(im)
    box = np.asarray(im)[..., 3] > ALPHA_THRESHOLD
    ys, xs = np.where(box)
    half_w = max(cx - xs.min(), xs.max() + 1 - cx)
    half_h = max(cy - ys.min(), ys.max() + 1 - cy)
    bys, bxs = np.where(np.asarray(base)[..., 3] > ALPHA_THRESHOLD)
    # one scale for every kind: the width of the bowl (its lower part, below the seam centre)
    low = bys > cy
    scale = CAPSULE_BASE_PX / float(bxs[low].max() + 1 - bxs[low].min())
    w = int(np.ceil(2 * half_w * scale)) + 2 * PAD
    h = int(np.ceil(2 * half_h * scale)) + 2 * PAD
    w += w % 2
    h += h % 2
    info = f"{w}x{h}"
    for part, pic in (("lid", lid), ("base", base)):
        canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        small = pic.resize((max(1, round(pic.width * scale)), max(1, round(pic.height * scale))), Image.LANCZOS)
        # put the seam centre at the middle of the canvas
        canvas.paste(small, (round(w / 2 - cx * scale), round(h / 2 - cy * scale)), small)
        dst = out / f"fx_capsule_{kind}_{part}.webp"
        canvas.save(dst, "WEBP", quality=92, method=6, exact=False)
        info += f", {part} {dst.stat().st_size / 1024:.0f} KB"
    return info


def process_cloud(src: Path, dst: Path) -> str:
    """A cloud mood: the file is centred on the cloud's slate body (not on the picture) and scaled so that the body is always
    CLOUD_BODY_PX wide, so the three moods lie on each other whatever each one carries (a bolt below, a puff to the side, a tear)."""
    im = clean_alpha(Image.open(src).convert("RGBA"))
    a = np.asarray(im).astype(int)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    sat = (mx - mn) / np.maximum(mx, 1)
    slate = (al > 200) & (b >= r) & (mx < 210) & (mx > 70) & (sat < 0.3) & (sat > 0.05)
    body = _largest(ndimage.binary_closing(slate, iterations=3), 3)
    ys, xs = np.where(body)
    bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
    scale = CLOUD_BODY_PX / float(bx1 - bx0)
    ay, ax = np.where(al > ALPHA_THRESHOLD)
    half_w = max(cx - ax.min(), ax.max() + 1 - cx)
    half_h = max(cy - ay.min(), ay.max() + 1 - cy)
    w = int(np.ceil(2 * half_w * scale)) + 2 * PAD
    h = int(np.ceil(2 * half_h * scale)) + 2 * PAD
    w += w % 2
    h += h % 2
    small = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.paste(small, (round(w / 2 - cx * scale), round(h / 2 - cy * scale)), small)
    canvas.save(dst, "WEBP", quality=92, method=6, exact=False)
    return f"{w}x{h}"


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
        capsule = name[len("fx_capsule_"):] if name.startswith("fx_capsule_") else None
        if capsule is not None:
            if capsule not in CAPSULE_KINDS:
                print(f"[art] skip {name}: unknown capsule kind")
                continue
            lid, base = OUT / f"{name}_lid.webp", OUT / f"{name}_base.webp"
            if lid.exists() and base.exists() and not args.force and min(lid.stat().st_mtime, base.stat().st_mtime) >= src.stat().st_mtime:
                continue
            print(f"[art] {name}: {process_capsule(src, capsule, OUT)}")
            continue
        dst = OUT / f"{name}.webp"
        if dst.exists() and not args.force and dst.stat().st_mtime >= src.stat().st_mtime:
            continue
        if name.startswith("fx_cloud_") and name[len("fx_cloud_"):] in CLOUD_MOODS:
            info = process_cloud(src, dst)
        elif name.startswith("bg_"):
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
