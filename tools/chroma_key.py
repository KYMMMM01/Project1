#!/usr/bin/env python
"""Cut a sprite out of a flat chroma-key background (for generators that cannot output alpha).

    python tools/chroma_key.py art/raw/_chroma/boss_vacuum.png art/raw/boss_vacuum.png

The background colour is sampled from the image border, so it works for green, magenta or any
other flat colour. Only background-coloured regions connected to the border are removed, which
keeps same-coloured details inside the character. Edge pixels get a soft alpha and are de-spilled
so no coloured fringe remains. Add --despill-all when the subject contains none of the key colour
at all: stray key-coloured strokes inside it are then neutralised as well.
"""
from __future__ import annotations

import sys

import numpy as np
from PIL import Image
from scipy import ndimage


def key(src: str, dst: str, near: float = 38.0, far: float = 110.0, despill_all: bool = False) -> None:
    im = Image.open(src).convert("RGB")
    rgb = np.asarray(im).astype(np.float32)
    h, w, _ = rgb.shape

    # Background = median colour of a thin frame around the picture.
    frame = np.concatenate([rgb[:6].reshape(-1, 3), rgb[-6:].reshape(-1, 3), rgb[:, :6].reshape(-1, 3), rgb[:, -6:].reshape(-1, 3)])
    bg = np.median(frame, axis=0)

    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
    # Soft matte: fully transparent within `near` of the key colour, opaque beyond `far`.
    alpha = np.clip((dist - near) / (far - near), 0.0, 1.0)

    # Keep only background that is connected to the border (inner look-alikes stay opaque).
    bgish = alpha < 0.5
    labels, n = ndimage.label(bgish)
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    outside = np.isin(labels, border[border != 0])
    # Enclosed holes (between an arm and the body, inside a handle) are background too when they
    # are essentially the pure key colour.
    if n:
        idx = np.arange(1, n + 1)
        mean_dist = ndimage.mean(dist, labels, idx)
        size = ndimage.sum(bgish, labels, idx)
        holes = idx[(mean_dist < near * 0.8) & (size >= 40)]
        outside |= np.isin(labels, holes)
    # Let the soft edge extend a couple of pixels inward from the true outside region.
    reach = ndimage.binary_dilation(outside, iterations=3)
    alpha = np.where(reach, alpha, 1.0)

    # De-spill: where the key channel dominates near the edge, pull it down to the other channels.
    k = int(np.argmax(bg))
    others = [c for c in range(3) if c != k]
    limit = np.maximum(rgb[..., others[0]], rgb[..., others[1]])
    edge = ndimage.binary_dilation(alpha < 1.0, iterations=2)
    spill = (edge | despill_all) & (rgb[..., k] > limit)
    out = rgb.copy()
    out[..., k] = np.where(spill, limit, rgb[..., k])

    # Shave one pixel of matte so the anti-aliased rim of key colour disappears.
    a8 = (alpha * 255).astype(np.uint8)
    a8 = ndimage.grey_erosion(a8, size=(3, 3))
    a8 = ndimage.gaussian_filter(a8.astype(np.float32), 0.6).clip(0, 255).astype(np.uint8)

    rgba = np.dstack([out.clip(0, 255).astype(np.uint8), a8])
    rgba[a8 == 0, :3] = 0
    Image.fromarray(rgba, "RGBA").save(dst)
    print(f"keyed {src} -> {dst}  bg=({bg[0]:.0f},{bg[1]:.0f},{bg[2]:.0f})  transparent={float((a8 == 0).mean()):.2f}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    key(sys.argv[1], sys.argv[2], despill_all="--despill-all" in sys.argv)
