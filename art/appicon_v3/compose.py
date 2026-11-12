"""App icon v3 (2026-11-12): v2's B (the three cats) on v2's D background (the owner: "B에서 배경색을 D로").
The cats are v2 B keyed out of its teal (tools/chroma_key.py); the background is D's coral sunburst drawn in code from
colours measured on D (14 rays, light centre, deeper coral edge), so it is clean at any size.
    python art/appicon_v3/compose.py
Writes, next to this file: background.png (rays only), foreground.png (cats on transparent, adaptive-icon placement) and
icon.png (the two together), all 1024 x 1024.
"""
import math
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CUT = os.path.join(HERE, '..', 'appicon_v2', 'b_cut.png')
SIZE = 1024
RAYS = 14
# Colours measured on v2 D: the centre, the edge, and how much lighter a light ray is.
CENTRE = np.array([253.0, 140.0, 114.0])
EDGE = np.array([250.0, 88.0, 77.0])
RAY = np.array([0.0, 13.0, 11.0])
# The cats' farthest pixel from the centre, as a share of the width (the owner picked 나, 0.36: nothing cut by a launcher mask).
REACH = 0.36


def background(size: int) -> Image.Image:
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float64)
    c = (size - 1) / 2
    r = np.hypot(yy - c, xx - c) / (size / 2)
    a = np.arctan2(yy - c, xx - c)
    t = np.clip(r / 1.3, 0, 1)
    t = t * t * (3 - 2 * t)
    base = CENTRE[None, None, :] * (1 - t[..., None]) + EDGE[None, None, :] * t[..., None]
    # Soft-edged wedges: a raised cosine squeezed so each ray is flat with short blends at its sides.
    wave = np.cos(a * RAYS)
    ray = np.clip((wave + 0.15) * 3.0, 0, 1)
    fade = np.clip(r / 0.25, 0, 1)
    rgb = base + RAY[None, None, :] * (ray * fade)[..., None]
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')


def foreground(size: int) -> Image.Image:
    cut = Image.open(CUT).convert('RGBA')
    cut = cut.crop(cut.getbbox())
    alpha = np.asarray(cut.split()[3]) > 8
    ys, xs = np.nonzero(alpha)
    cx, cy = cut.width / 2, cut.height / 2
    reach = math.sqrt(((xs - cx) ** 2 + (ys - cy) ** 2).max())
    scale = REACH * size / reach
    cut = cut.resize((round(cut.width * scale), round(cut.height * scale)), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.alpha_composite(cut, ((size - cut.width) // 2, (size - cut.height) // 2))
    return out


if __name__ == '__main__':
    import sys
    # Optional: python compose.py <reach> <suffix>, a candidate with the cats at another size (icon<suffix>.png only).
    if len(sys.argv) > 2:
        REACH = float(sys.argv[1])
        icon = background(SIZE)
        icon.alpha_composite(foreground(SIZE))
        icon.save(os.path.join(HERE, f'icon{sys.argv[2]}.png'))
        print('saved', sys.argv[2], REACH)
        sys.exit(0)
    bg = background(SIZE)
    fg = foreground(SIZE)
    bg.save(os.path.join(HERE, 'background.png'))
    fg.save(os.path.join(HERE, 'foreground.png'))
    icon = bg.copy()
    icon.alpha_composite(fg)
    icon.save(os.path.join(HERE, 'icon.png'))
    print('saved', HERE)
