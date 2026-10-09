#!/usr/bin/env python
"""Turn the generated pictures of art/cells_v1 (see make_jobs.py) into the files tools/process_art.py reads:

    python art/cells_v1/build_cells.py       writes art/raw/cell_<id>.png and art/raw/icon_cell_<id>.png
    python tools/process_art.py --only cell_sun,cell_bowl,...   (trims, fits and writes src/assets/img/*.webp)

A tile is cut to the rounded rectangle itself: anything that sticks out above or below the tile (the bath mat's steam) is cut away, because the
game draws steam as moving particles. A badge keeps its whole picture.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
RAW = HERE.parent / "raw"
IDS = ["sun", "bowl", "bubble", "stump", "treat"]
ALPHA = 40


def body_rows(alpha: np.ndarray) -> tuple[int, int]:
    """The first and last rows whose opaque width is at least 80 percent of the widest row: the tile without what sticks out of it."""
    width = (alpha > ALPHA).sum(axis=1)
    wide = np.where(width >= 0.8 * width.max())[0]
    return int(wide.min()), int(wide.max()) + 1


def cut_tile(im: Image.Image) -> Image.Image:
    a = np.asarray(im)[..., 3]
    y0, y1 = body_rows(a)
    # The outline of the tile's top edge is a few rows above the first row that is 80 percent wide (the corners are round): take them in.
    margin = max(2, int(0.03 * (y1 - y0)))
    return im.crop((0, max(0, y0 - margin), im.width, min(im.height, y1 + margin)))


def main() -> None:
    for id_ in IDS:
        tile = Image.open(HERE / f"cell_{id_}.png").convert("RGBA")
        cut_tile(tile).save(RAW / f"cell_{id_}.png")
        Image.open(HERE / f"icon_cell_{id_}.png").convert("RGBA").save(RAW / f"icon_cell_{id_}.png")
        print("[cells]", id_)


if __name__ == "__main__":
    main()
