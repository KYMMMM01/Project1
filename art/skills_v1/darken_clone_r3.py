#!/usr/bin/env python
"""Round 3 of the ninja's clone (2026-10-18): the owner picked round 2's tone B (lilac-indigo) and asked for it darker
("저건 외관이 생각보다 너무 잘보인다 좀 더 진하게 해도 될듯 색감은 B로"). Instead of a new generation, the B images are
darkened in code at three strengths so the drawing stays exactly the one he picked:

    python art/skills_v1/darken_clone_r3.py   -> art/skills_v1/clone3_{1,2,3}.png, pair3_{1,2,3}.png, _sheet_r3.png

The figure keeps its outline and its white sticker border; only the figure inside the border is multiplied towards a deep
lilac-indigo shadow, so the face and outfit read less and the shape still reads.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent.parent
DIR = ROOT / "art" / "skills_v1"
SHADOW = (58, 48, 102)  # deep lilac-indigo
LEVELS = [(1, 0.35), (2, 0.55), (3, 0.72)]
CREAM = (248, 238, 214)
WOOD = (196, 140, 84)
INK = (74, 52, 38)


def inner_mask(im: Image.Image) -> Image.Image:
    """Pixels of the figure itself: opaque and not the near-white sticker border."""
    rgba = im.convert("RGBA")
    px = rgba.load()
    mask = Image.new("L", rgba.size, 0)
    mp = mask.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 40:
                continue
            if r > 232 and g > 232 and b > 232:
                continue  # the white sticker border
            mp[x, y] = 255
    return mask


def darken(im: Image.Image, mask: Image.Image, k: float) -> Image.Image:
    rgba = im.convert("RGBA")
    px = rgba.load()
    mp = mask.load()
    w, h = rgba.size
    out = rgba.copy()
    op = out.load()
    for y in range(h):
        for x in range(w):
            if not mp[x, y]:
                continue
            r, g, b, a = px[x, y]
            # multiply towards the shadow colour, then mix by k
            mr, mg, mb = r * SHADOW[0] // 255, g * SHADOW[1] // 255, b * SHADOW[2] // 255
            op[x, y] = (round(r + (mr - r) * k), round(g + (mg - g) * k), round(b + (mb - b) * k), a)
    return out


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in ("C:/Windows/Fonts/malgunbd.ttf", "C:/Windows/Fonts/malgun.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def fit(im: Image.Image, box: tuple[int, int]) -> Image.Image:
    c = im.copy()
    c.thumbnail(box, Image.LANCZOS)
    return c


def main() -> None:
    clone = Image.open(DIR / "clone2_b.png")
    pair = Image.open(DIR / "pair2_b.png")
    cm, pm = inner_mask(clone), inner_mask(pair)
    clones, pairs = [], []
    for n, k in LEVELS:
        c = darken(clone, cm, k)
        p = darken(pair, pm, k)
        c.save(DIR / f"clone3_{n}.png")
        p.save(DIR / f"pair3_{n}.png")
        clones.append(c)
        pairs.append(p)

    W = 1080
    col = W // 4
    sheet = Image.new("RGB", (W, 1500), CREAM)
    d = ImageDraw.Draw(sheet)
    d.text((40, 30), "닌자 분신 · 3차 (B 색감을 더 진하게)", fill=INK, font=font(48))
    d.text((40, 100), "\"외관이 생각보다 너무 잘 보인다 좀 더 진하게 해도 될 듯, 색감은 B로\"", fill=INK, font=font(28))
    heads = ["2차 B", "1 (조금)", "2 (중간)", "3 (진하게)"]
    row_y = [170, 820]
    singles = [clone] + clones
    doubles = [pair] + pairs
    for i in range(4):
        x0 = i * col
        d.text((x0 + 30, row_y[0]), heads[i], fill=INK, font=font(34))
        big = fit(singles[i], (col - 40, 360))
        sheet.paste(big, (x0 + (col - big.width) // 2, row_y[0] + 60), big)
        for j, bg in enumerate((CREAM, WOOD)):
            sw = Image.new("RGB", (110, 120), bg)
            small = fit(singles[i], (104, 114))
            sw.paste(small, ((110 - small.width) // 2, (120 - small.height) // 2), small)
            sheet.paste(sw, (x0 + 22 + j * 118, row_y[0] + 450))
        d.text((x0 + 30, row_y[1]), heads[i] + " · 쌍", fill=INK, font=font(34))
        bigp = fit(doubles[i], (col - 40, 360))
        sheet.paste(bigp, (x0 + (col - bigp.width) // 2, row_y[1] + 60), bigp)
        for j, bg in enumerate((CREAM, WOOD)):
            sw = Image.new("RGB", (110, 98), bg)
            small = fit(doubles[i], (106, 94))
            sw.paste(small, ((110 - small.width) // 2, (98 - small.height) // 2), small)
            sheet.paste(sw, (x0 + 22 + j * 118, row_y[1] + 440))
    d.text((40, 1440), "작은 그림 = 게임 속 크기(2배 화면). 게임에서는 던질수록 점점 옅어진다.", fill=INK, font=font(26))
    sheet.save(DIR / "_sheet_r3.png")
    print("ok", DIR / "_sheet_r3.png")


if __name__ == "__main__":
    main()
