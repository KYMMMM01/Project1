#!/usr/bin/env python
"""Comparison sheet of the SECOND ROUND of skill art:  python art/skills_v1/compose_sheet_r2.py  ->  art/skills_v1/_sheet_r2.png

Same look and rules as compose_sheet.py (1080 px wide = one phone screen at 3x; a small preview is the piece at in-game size x2). Per item:
a title row with the owner's request quoted under it, the candidates A, B, C each with in-game-size previews (cream paper and wooden floor for
the clone, the pair, the cut and the meteor; a dark enemy colour as well for the cut), and the owner's round-one pick small, marked "1차".
Grid jobs (cut, meteor) are cut apart; every single piece is saved to art/skills_v1/_pieces_r2/.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from compose_sheet import (CORAL, DIM, INK, INK_SOFT, KRAFT, KRAFT_D, LIGHT, M, PAPER, SCALE, W, WHITE, WOOD,  # noqa: E402
                           card_bg, fit, font, split, text, trim, wrap)

PIECES = HERE / "_pieces_r2"
DARK = (66, 54, 88)  # a dark enemy (eggplant) for the cut
GREY = (150, 138, 122)
GAP = 18


# ---- the content -------------------------------------------------------------------------------------------------------
CLONE_BOX, PAIR_BOX = (52, 60), (54, 48)
CUT_BOXES = [("베임선", (56, 22)), ("벌어짐", (64, 44))]
MET_BOXES = [("운석", (60, 38)), ("착지 섬광", (48, 48)), ("충격 고리", (52, 52))]

ITEMS = [
    dict(
        title="1. 깜짝 분신술 · 닌자냥 분신 (그림자)",
        quote="“분신이 아니라 유령 같아보임 연기 꼬리 말고 다리 달아줘 색감도 그림자 느낌으로 해줘 너무 진하지는 않고 분신들의 외관이 보일 정도로”",
        kind="cols", box=CLONE_BOX, label="분신",
        cands=[("A", "clone2_a", "연한 청회색 · 서서 준비"), ("B", "clone2_b", "라일락 남보라 · 표창 던지는 중"), ("C", "clone2_c", "슬레이트 · 살짝 어설픔")],
        old=("지난번 A · B · C (연기 꼬리, 하늘색 유령)", [("clone_a", "A"), ("clone_b", "B"), ("clone_c", "C")]),
    ),
    dict(
        title="1-2. 분신 쌍 (닌자 뒤에 서 있을 때)",
        quote="“1-2. B” (어깨를 맞대고, 뒤의 분신은 더 연하게). 54 x 48 크기에서 두 마리로 읽히는지 확인",
        kind="cols", box=PAIR_BOX, label="쌍", big_h=236,
        cands=[("A", "pair2_a", "연한 청회색 쌍"), ("B", "pair2_b", "라일락 남보라 쌍"), ("C", "pair2_c", "슬레이트 쌍")],
        old=("지난번 선택 B (연기 꼬리, 하늘색)", [("pair_b", "B")]),
    ),
    dict(
        title="2. 이미 베었다냥 · 사무라이냥 베기",
        quote="“C로 잘 보이게 강조를 더 해줘”  왼쪽 = 처음 생기는 베임선, 오른쪽 = 벌어진 상처. 밝은 적 · 나무 바닥 · 어두운 적 위에서 확인",
        kind="band", grid=(2, 1), boxes=CUT_BOXES, wells=("cream", "wood", "dark"), big_h=172,
        cands=[("A", "cut2_a", "굵은 선 + 흰 불꽃 하나"), ("B", "cut2_b", "더 큰 불꽃 + 튀는 줄"), ("C", "cut2_c", "섬광 줄 + 불꽃 + 종이 조각")],
        old=("지난번 선택 C (찢어진 종이)", "cut_c"),
    ),
    dict(
        title="3. 운석 쿵! · 우주냥 운석 (얼굴 없음)",
        quote="“B인데 얼굴은 빼주고 충격 섬광이나 충격 고리를 더 진하게 그리고 충격 고리는 무슨 레이스 장식같아 보이니까 좀더 후폭풍 처럼 보이도록 해주고”",
        kind="band", grid=(3, 1), boxes=MET_BOXES, wells=("cream", "wood"), big_h=150,
        cands=[("A", "meteor2_a", "주황 섬광 + 먼지 폭풍 고리"), ("B", "meteor2_b", "붉은 섬광 + 뾰족한 충격파 고리"), ("C", "meteor2_c", "노란 섬광 + 이중 먼지 파도")],
        old=("지난번 선택 B (얼굴, 연한 섬광, 레이스 고리)", "meteor_b"),
    ),
]
WELL_COL = {"cream": DIM, "wood": WOOD, "dark": DARK}


# ---- image helpers -----------------------------------------------------------------------------------------------------
def clean(im: Image.Image, keep_frac: float = 0.02) -> Image.Image:
    """Drops stray faint specks: keeps only the alpha blobs (merged across small gaps) that are at least keep_frac of the biggest one."""
    a = np.asarray(im)[..., 3]
    solid = a > 40
    lab, n = ndimage.label(ndimage.binary_dilation(solid, iterations=3))
    if n == 0:
        return im
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= keep_frac * sizes.max()])
    keep = ndimage.binary_dilation(keep, iterations=4)
    out = np.asarray(im).copy()
    out[..., 3] = np.where(keep, out[..., 3], 0)
    # alpha that is nearly empty is just noise from the generator
    out[..., 3] = np.where(out[..., 3] < 10, 0, out[..., 3])
    return Image.fromarray(out)


def load_single(job: str) -> Image.Image:
    im = Image.open(HERE / f"{job}.png").convert("RGBA")
    return trim(clean(im), 4)


def load_grid(job: str, grid: tuple[int, int]) -> list[Image.Image]:
    im = Image.open(HERE / f"{job}.png").convert("RGBA")
    return [trim(clean(p), 2) for p in split(im, *grid)]


def save_pieces(job: str, pcs: list[Image.Image]) -> None:
    PIECES.mkdir(exist_ok=True)
    for i, p in enumerate(pcs):
        p.save(PIECES / (f"{job}.png" if len(pcs) == 1 else f"{job}_{i + 1}.png"))


def wells_row(sheet: Image.Image, im: Image.Image, box: tuple[int, int], cx: int, top: int, maxw: int, kinds: tuple[str, ...]) -> int:
    """The piece at in-game size x2 in one well per background kind, centred on cx. Returns the wells' height."""
    bw, bh = box[0] * SCALE, box[1] * SCALE
    n = len(kinds)
    pw = min(bw, (maxw - 10 * (n - 1)) // n - 24)
    ph = round(bh * pw / bw)
    wells = max(ph + 24, 56)
    d = ImageDraw.Draw(sheet)
    ww = pw + 24
    x0 = cx - (n * ww + (n - 1) * 10) // 2
    small = fit(im, pw, ph)
    for k, kind in enumerate(kinds):
        x = x0 + k * (ww + 10)
        d.rounded_rectangle((x, top, x + ww, top + wells), 14, fill=WELL_COL[kind], outline=KRAFT_D, width=2)
        sheet.alpha_composite(small, (x + (ww - small.width) // 2, top + (wells - small.height) // 2))
    return wells


def badge(sheet: Image.Image, cx: int, cy: int, label: str, r: int = 36, old: bool = False) -> None:
    d = ImageDraw.Draw(sheet)
    d.ellipse((cx - r, cy - r + 3, cx + r, cy + r + 3), fill=KRAFT_D)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=GREY if old else CORAL, outline=INK, width=3)
    text(d, (cx, cy - 2), label, font(24 if old else 46), WHITE, "mm")


# ---- layout ------------------------------------------------------------------------------------------------------------
def head(title: str, quote: str) -> Image.Image:
    f_q = font(26, False)
    lines = wrap(quote, f_q, W - 2 * M - 48)
    h = 64 + len(lines) * 33 + 16
    im = Image.new("RGBA", (W, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((M, 6, W - M, h - 4), 22, fill=KRAFT, outline=KRAFT_D, width=3)
    text(d, (M + 24, 12), title, font(40), INK)
    for i, ln in enumerate(lines):
        text(d, (M + 24, 66 + i * 33), ln, f_q, INK)
    return im


def draw_cols(item: dict) -> Image.Image:
    """Three cards in a row: big picture, in-game previews (cream and wood), one short line."""
    cands = item["cands"]
    cw = (W - 2 * M - GAP * 2) // 3
    big_h = item.get("big_h", cw - 56)
    desc_f = font(28, False)
    lines_of = [wrap(c[2], desc_f, cw - 28) for c in cands]
    nl = max(len(x) for x in lines_of)
    wells_h = max(item["box"][1] * SCALE + 24, 56)
    card_h = 84 + big_h + 14 + wells_h + 40 + nl * 36 + 14
    strip = Image.new("RGBA", (W, card_h), (0, 0, 0, 0))
    for i, (letter, job, desc) in enumerate(cands):
        x = M + i * (cw + GAP)
        card_bg(strip, x, 0, cw, card_h)
        badge(strip, x + 50, 50, letter)
        pc = load_single(job)
        save_pieces(job, [pc])
        big = fit(pc, cw - 36, big_h)
        strip.alpha_composite(big, (x + (cw - big.width) // 2, 84 + (big_h - big.height) // 2))
        yy = 84 + big_h + 14
        wells = wells_row(strip, pc, item["box"], x + cw // 2, yy, cw - 16, ("cream", "wood"))
        d = ImageDraw.Draw(strip)
        text(d, (x + cw // 2, yy + wells + 6), "게임 속 크기", font(22, False), INK_SOFT, "ma")
        for k, line in enumerate(lines_of[i]):
            text(d, (x + cw // 2, yy + wells + 40 + k * 36), line, desc_f, INK, "ma")
    return strip


def draw_old_cols(label: str, entries: list[tuple[str, str]], box: tuple[int, int]) -> Image.Image:
    """The round-one pick(s), small: a thumbnail and its in-game-size preview, in a slim grey-badged card."""
    slot = (W - 2 * M - 20) // 3
    th = 150
    wells_h = max(box[1] * SCALE + 24, 56)
    region = max(th, wells_h + 34)
    h = 62 + region + 14
    card = Image.new("RGBA", (W, h), (0, 0, 0, 0))
    card_bg(card, M, 0, W - 2 * M, h)
    badge(card, M + 46, 36, "1차", 28, old=True)
    text(ImageDraw.Draw(card), (M + 90, 36), label, font(28), INK_SOFT, "lm")
    for i, (job, tag) in enumerate(entries):
        pc = load_single(job)
        x = M + 14 + i * slot
        big = fit(pc, slot // 2 - 8, th)
        card.alpha_composite(big, (x + (slot // 2 - big.width) // 2, 62 + (region - big.height) // 2))
        wt = 62 + (region - wells_h - 34) // 2
        cx = x + slot // 2 + slot // 4 - 6
        wells_row(card, pc, box, cx, wt, slot // 2 - 10, ("cream",))
        text(ImageDraw.Draw(card), (cx, wt + wells_h + 6), "1차 " + tag, font(22, False), INK_SOFT, "ma")
    return card


def draw_band(item: dict, c: tuple) -> Image.Image:
    """One candidate of a multi-piece item: a header line (letter + what it is), then the pieces in one row, each over its in-game previews."""
    letter, job, desc = c
    pcs = load_grid(job, item["grid"])
    save_pieces(job, pcs)
    return band_card(item, pcs, badge_label=letter, desc=desc, big_h=item["big_h"], old=False)


def band_card(item: dict, pcs: list[Image.Image], badge_label: str, desc: str, big_h: int, old: bool) -> Image.Image:
    cols = len(pcs)
    inner_w = W - 2 * M
    colw = (inner_w - 20) // cols
    kinds = item["wells"]
    boxes = item["boxes"]
    pv_h = max(round(b[1][1] * SCALE) for b in boxes) + 24
    pv_h = max(pv_h, 56)
    row_h = 34 + big_h + 8 + pv_h + 10
    card_h = 64 + row_h + 6
    card = Image.new("RGBA", (W, card_h), (0, 0, 0, 0))
    card_bg(card, M, 0, inner_w, card_h)
    badge(card, M + 46, 38, badge_label, 28, old=old)
    text(ImageDraw.Draw(card), (M + 90, 38), desc, font(28 if old else 30), INK_SOFT if old else INK, "lm")
    d = ImageDraw.Draw(card)
    for i, (im, (label, box)) in enumerate(zip(pcs, boxes)):
        x = M + 10 + i * colw
        y = 64
        text(d, (x + colw // 2, y + 2), label + ("" if label in ("운석", "베임선", "벌어짐") else " (축소)"), font(26), INK_SOFT, "ma")
        big = fit(im, colw - 16, big_h)
        card.alpha_composite(big, (x + (colw - big.width) // 2, y + 34 + (big_h - big.height) // 2))
        wells_row(card, im, box, x + colw // 2, y + 34 + big_h + 8, colw - 6, kinds)
    return card


def draw_old_band(item: dict, label: str, job: str) -> Image.Image:
    pcs = [trim(p, 2) for p in split(Image.open(HERE / f"{job}.png").convert("RGBA"), *item["grid"])]
    return band_card(item, pcs, "1차", label, big_h=96, old=True)


def main() -> None:
    blocks: list[Image.Image] = []
    title = Image.new("RGBA", (W, 168), (0, 0, 0, 0))
    d = ImageDraw.Draw(title)
    text(d, (M, 10), "스킬 그림 후보 · 2차", font(58), INK)
    text(d, (M, 88), "집사 없는 날: 냥이 수비대 · 2026-10-18", font(28, False), INK_SOFT)
    text(d, (M, 126), "큰 그림 = 후보 / 작은 그림 = 게임 속 크기(폰 2배 화면) / 1차 = 지난번 선택", font(26, False), INK_SOFT)
    blocks.append(title)
    for item in ITEMS:
        blocks.append(head(item["title"], item["quote"]))
        if item["kind"] == "cols":
            blocks.append(draw_cols(item))
            blocks.append(Image.new("RGBA", (W, 4), (0, 0, 0, 0)))
            blocks.append(draw_old_cols(item["old"][0], item["old"][1], item["box"]))
        else:
            for c in item["cands"]:
                blocks.append(draw_band(item, c))
                blocks.append(Image.new("RGBA", (W, 4), (0, 0, 0, 0)))
            blocks.append(draw_old_band(item, item["old"][0], item["old"][1]))
        blocks.append(Image.new("RGBA", (W, 18), (0, 0, 0, 0)))
    total = sum(b.height + 6 for b in blocks) + M
    sheet = Image.new("RGBA", (W, total), PAPER + (255,))
    y = 0
    for b in blocks:
        sheet.alpha_composite(b, (0, y))
        y += b.height + 6
    out = HERE / "_sheet_r2.png"
    sheet.convert("RGB").save(out)
    print(f"sheet {sheet.size} -> {out}")


if __name__ == "__main__":
    main()
