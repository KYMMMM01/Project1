#!/usr/bin/env python
"""Comparison sheet of the skill art candidates:  python art/skills_v1/compose_sheet.py  ->  art/skills_v1/_sheet.png

One section per item, the candidates labelled A, B, C. Every piece is shown big and again at its in-game size (a phone 360 css px
wide drawn at 2x, so one game px is two sheet px) on the game's cream paper and on the wooden floor. The sheet is 1080 px wide,
exactly one phone screen at 3x, so a phone shows it edge to edge with text no smaller than about 12 pt.

Sheet jobs (capsules, clouds, cut, meteor) are cut apart by their grid; the pieces are saved to art/skills_v1/_pieces/.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

HERE = Path(__file__).resolve().parent
PIECES = HERE / "_pieces"
W, M, GAP = 1080, 24, 18
PAPER, LIGHT, DIM = (251, 243, 226), (255, 250, 238), (237, 221, 187)
KRAFT, KRAFT_D, WOOD = (217, 184, 138), (180, 143, 98), (196, 143, 80)
INK, INK_SOFT, CORAL, WHITE = (74, 50, 34), (125, 94, 69), (240, 121, 107), (255, 255, 255)
SCALE = 2  # sheet px per in-game css px (phone 360 wide)

FONT_B = "C:/Windows/Fonts/malgunbd.ttf"
FONT_R = "C:/Windows/Fonts/malgun.ttf"


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_B if bold else FONT_R, size)


# ---- the content -------------------------------------------------------------------------------------------------------
# piece: (label, in-game box in css px (w, h), True when that box is the true in-game size)
ITEMS = [
    dict(
        title="1. 깜짝 분신술 · 닌자냥 분신", sub="연한 하늘색, 비치는 느낌, 머리 위 잎사귀, 살짝 어설픔", layout="cols",
        cands=[
            ("A", "clone_a", None, [("분신", (52, 60), True)], "연기 꼬리, 팔이 삐뚤"),
            ("B", "clone_b", None, [("분신", (52, 60), True)], "발이 있고 넘어질 듯"),
            ("C", "clone_c", None, [("분신", (52, 60), True)], "머리 큰 통통 유령"),
        ],
    ),
    dict(
        title="1-2. 분신 쌍 (닌자 뒤에 서 있을 때)", sub="54 x 48 크기에서 두 마리로 읽혀야 함", layout="cols",
        cands=[
            ("A", "pair_a", None, [("쌍", (54, 48), True)], "대각선으로 어긋나게"),
            ("B", "pair_b", None, [("쌍", (54, 48), True)], "어깨를 맞대고"),
        ],
    ),
    dict(
        title="2. 이미 베었다냥 · 사무라이냥 베기", sub="왼쪽 = 처음 생기는 베임선, 오른쪽 = 벌어진 상처. 크림과 먹색", layout="band", big_h=170, wood=True,
        cands=[
            ("A", "cut_a", (2, 1), [("베임선", (56, 22), True), ("벌어짐", (64, 44), True)], "종이를 벤 틈, 말린 입술"),
            ("B", "cut_b", (2, 1), [("베임선", (56, 22), True), ("벌어짐", (64, 44), True)], "붓으로 그은 초승달 + 반짝"),
            ("C", "cut_c", (2, 1), [("베임선", (56, 22), True), ("벌어짐", (64, 44), True)], "찢어진 종이"),
        ],
    ),
    dict(
        title="3. 복 뽑기 한 판! · 복고양이 캡슐 6종", sub="색과 무늬 둘 다로 구분: 생선 · 골골 · 짝꿍 · 한 번 더 · 장난감 · 수호신", layout="band", big_h=156, show_cols=6,
        cands=[
            ("A", "capsule_a", (3, 2), [("생선", (40, 40), True), ("골골", (40, 40), True), ("짝꿍", (40, 40), True),
                                         ("한 번 더", (40, 40), True), ("장난감", (40, 40), True), ("수호신", (40, 40), True)], "동그란 공, 정면"),
            ("B", "capsule_b", (3, 2), [("생선", (40, 40), True), ("골골", (40, 40), True), ("짝꿍", (40, 40), True),
                                         ("한 번 더", (40, 40), True), ("장난감", (40, 40), True), ("수호신", (40, 40), True)], "통통하게 기울인 공, 굵은 띠, 큰 무늬"),
            ("C", "capsule_c", (3, 2), [("생선", (40, 40), True), ("골골", (40, 40), True), ("짝꿍", (40, 40), True),
                                         ("한 번 더", (40, 40), True), ("장난감", (40, 40), True), ("수호신", (40, 40), True)], "서 있는 알약 모양"),
        ],
    ),
    dict(
        title="4. 졸졸 먹구름 · 번개냥 구름", sub="작고 심술난 먹구름: 표정 셋과 작은 번개", layout="band", big_h=170, show_cols=4,
        cands=[
            ("A", "cloud_a", (2, 2), [("심술", (34, 30), True), ("지직", (34, 36), True), ("한숨", (34, 34), True), ("번개", (14, 26), True)], "보통 뭉게구름 세 덩이"),
            ("B", "cloud_b", (2, 2), [("심술", (34, 30), True), ("지직", (34, 36), True), ("한숨", (34, 34), True), ("번개", (14, 26), True)], "고양이 귀 달린 동그란 구름"),
            ("C", "cloud_c", (2, 2), [("심술", (34, 30), True), ("지직", (34, 36), True), ("한숨", (34, 34), True), ("번개", (14, 26), True)], "넓적한 식빵 구름, 볼살"),
        ],
    ),
    dict(
        title="5. 운석 쿵! · 우주냥 운석", sub="떨어지는 운석, 부드러운 착지 섬광, 충격 고리", layout="band", big_h=150,
        cands=[
            ("A", "meteor_a", (3, 1), [("운석", (60, 38), True), ("착지 섬광", (48, 48), False), ("충격 고리", (52, 52), False)], "울퉁불퉁한 바위 + 불꼬리"),
            ("B", "meteor_b", (3, 1), [("운석", (60, 38), True), ("착지 섬광", (48, 48), False), ("충격 고리", (52, 52), False)], "놀란 얼굴 달린 귀여운 바위"),
            ("C", "meteor_c", (3, 1), [("운석", (60, 38), True), ("착지 섬광", (48, 48), False), ("충격 고리", (52, 52), False)], "남색 바위에 금빛 별"),
        ],
    ),
]


# ---- image helpers -----------------------------------------------------------------------------------------------------
def trim(im: Image.Image, pad: int = 0) -> Image.Image:
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > 12)
    if len(xs) == 0:
        return im
    return im.crop((max(0, int(xs.min()) - pad), max(0, int(ys.min()) - pad), int(xs.max()) + 1 + pad, int(ys.max()) + 1 + pad))


def fit(im: Image.Image, w: int, h: int) -> Image.Image:
    s = min(w / im.width, h / im.height)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def split(im: Image.Image, cols: int, rows: int) -> list[Image.Image]:
    """Cuts a sheet into its pieces: components of the alpha (merged across small gaps) go to the grid cell holding their centre."""
    a = np.asarray(im)[..., 3] > 12
    grow = 2
    lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=grow))
    cells: dict[tuple[int, int], np.ndarray] = {}
    for i in range(1, n + 1):
        m = (lab == i) & a
        if m.sum() < 0.0003 * a.size:
            continue
        ys, xs = np.where(m)
        key = (min(rows - 1, int(ys.mean() * rows / im.height)), min(cols - 1, int(xs.mean() * cols / im.width)))
        cells[key] = cells.get(key, np.zeros_like(a)) | m
    out = []
    for r in range(rows):
        for c in range(cols):
            m = cells.get((r, c))
            if m is None:
                out.append(Image.new("RGBA", (8, 8), (0, 0, 0, 0)))
                continue
            ys, xs = np.where(m)
            box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
            piece = im.crop(box)
            keep = Image.fromarray((m[box[1]:box[3], box[0]:box[2]] * 255).astype("uint8"))
            # keep the piece's own soft edge: only cut away pixels that belong to a neighbouring piece
            alpha = np.minimum(np.asarray(piece)[..., 3], np.asarray(keep.filter(__import__("PIL.ImageFilter", fromlist=["x"]).MaxFilter(5))))
            piece.putalpha(Image.fromarray(alpha.astype("uint8")))
            out.append(piece)
    return out


def wrap(text: str, f: ImageFont.FreeTypeFont, maxw: int) -> list[str]:
    """Wraps at spaces (Korean words stay whole); a single word wider than the line breaks by character."""
    lines, cur = [], ""
    for word in text.split(" "):
        trial = (cur + " " + word) if cur else word
        if f.getlength(trial) <= maxw:
            cur = trial
            continue
        if cur:
            lines.append(cur)
        cur = ""
        for ch in word:
            if f.getlength(cur + ch) > maxw and cur:
                lines.append(cur)
                cur = ch
            else:
                cur += ch
    if cur:
        lines.append(cur)
    return lines


def text(d: ImageDraw.ImageDraw, xy, s: str, f, fill=INK, anchor="la") -> None:
    d.text(xy, s, font=f, fill=fill, anchor=anchor)


def badge(sheet: Image.Image, cx: int, cy: int, letter: str, r: int = 36) -> None:
    d = ImageDraw.Draw(sheet)
    d.ellipse((cx - r, cy - r + 3, cx + r, cy + r + 3), fill=KRAFT_D)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=CORAL, outline=INK, width=3)
    text(d, (cx, cy - 2), letter, font(46), WHITE, "mm")


def previews(sheet: Image.Image, im: Image.Image, box: tuple[int, int], cx: int, top: int, maxw: int, true_size: bool, wood: bool = False) -> int:
    """The piece at in-game size x2 in a cream well (and, with `wood`, a second well on the wooden floor), centred on cx. Returns the wells' height."""
    bw, bh = box[0] * SCALE, box[1] * SCALE
    n = 2 if wood else 1
    pw = min(bw, (maxw - 10 * (n - 1)) // n - 24)
    ph = round(bh * pw / bw)
    wells = max(ph + 24, 56)
    d = ImageDraw.Draw(sheet)
    ww = pw + 24
    x0 = cx - (n * ww + (n - 1) * 10) // 2
    small = fit(im, pw, ph)
    for k, col in enumerate((DIM, WOOD)[:n]):
        x = x0 + k * (ww + 10)
        d.rounded_rectangle((x, top, x + ww, top + wells), 14, fill=col, outline=KRAFT_D, width=2)
        sheet.alpha_composite(small, (x + (ww - small.width) // 2, top + (wells - small.height) // 2))
    return wells


def load_pieces(job: str, grid: tuple[int, int] | None) -> list[Image.Image]:
    im = Image.open(HERE / f"{job}.png").convert("RGBA")
    if grid is None:
        pcs = [trim(im, 4)]
    else:
        pcs = [trim(p, 2) for p in split(im, *grid)]
    PIECES.mkdir(exist_ok=True)
    for i, p in enumerate(pcs):
        p.save(PIECES / f"{job}_{i + 1}.png")
    return pcs


# ---- layout ------------------------------------------------------------------------------------------------------------
def card_bg(img: Image.Image, x: int, y: int, w: int, h: int) -> None:
    ImageDraw.Draw(img).rounded_rectangle((x, y, x + w, y + h), 26, fill=LIGHT, outline=KRAFT_D, width=3)


def draw_cols(item: dict) -> Image.Image:
    """A row of single-piece cards (the clones, the pairs): big picture, then its two small previews, then one line about it."""
    cands = item["cands"]
    cw = (W - 2 * M - GAP * 2) // 3  # always three-column width; fewer cards are centred
    big_h = cw - 56
    desc_f = font(30, False)
    card_h = 84 + big_h + 14 + 150 + 44 + 84
    n = len(cands)
    strip = Image.new("RGBA", (W, card_h), (0, 0, 0, 0))
    x0 = (W - (n * cw + (n - 1) * GAP)) // 2
    for i, (letter, job, grid, pieces, desc) in enumerate(cands):
        x = x0 + i * (cw + GAP)
        card_bg(strip, x, 0, cw, card_h)
        badge(strip, x + 50, 50, letter)
        pc = load_pieces(job, grid)[0]
        big = fit(pc, cw - 36, big_h)
        strip.alpha_composite(big, (x + (cw - big.width) // 2, 84 + (big_h - big.height) // 2))
        label, box, true_size = pieces[0]
        yy = 84 + big_h + 14
        wells = previews(strip, pc, box, x + cw // 2, yy, cw - 16, True, wood=True)
        d = ImageDraw.Draw(strip)
        text(d, (x + cw // 2, yy + wells + 8), "게임 속 크기", font(24, False), INK_SOFT, "ma")
        for k, line in enumerate(wrap(desc, desc_f, cw - 30)):
            text(d, (x + cw // 2, yy + wells + 46 + k * 38), line, desc_f, INK, "ma")
    return strip


def draw_band(item: dict, c: tuple) -> Image.Image:
    """One candidate of a multi-piece item: a header line (letter + what it is), then the pieces in one grid, each over its small preview."""
    letter, job, grid, pieces, desc = c
    pcs = load_pieces(job, grid)
    cols = item.get("show_cols", grid[0])
    rows = -(-len(pcs) // cols)
    inner_w = W - 2 * M
    colw = (inner_w - 20) // cols
    big_h, wood = item["big_h"], item.get("wood", False)
    pv_h = max(round(b[1] * SCALE) for _, b, _ in pieces) + 24
    row_h = 34 + big_h + 8 + pv_h + 10
    card_h = 64 + rows * row_h + 6
    card = Image.new("RGBA", (W, card_h), (0, 0, 0, 0))
    card_bg(card, M, 0, inner_w, card_h)
    badge(card, M + 46, 38, letter, 28)
    text(ImageDraw.Draw(card), (M + 90, 38), desc, font(30), INK, "lm")
    d = ImageDraw.Draw(card)
    for i, (im, (label, box, true_size)) in enumerate(zip(pcs, pieces)):
        r, cidx = divmod(i, cols)
        x = M + 10 + cidx * colw
        y = 64 + r * row_h
        text(d, (x + colw // 2, y + 2), label + ("" if true_size else " (축소)"), font(26), INK_SOFT, "ma")
        big = fit(im, colw - 16, big_h)
        card.alpha_composite(big, (x + (colw - big.width) // 2, y + 34 + (big_h - big.height) // 2))
        previews(card, im, box, x + colw // 2, y + 34 + big_h + 8, colw - 6, true_size, wood=wood)
    return card


def main() -> None:
    blocks: list[Image.Image] = []
    title = Image.new("RGBA", (W, 168), (0, 0, 0, 0))
    d = ImageDraw.Draw(title)
    text(d, (M, 10), "스킬 그림 후보", font(62), INK)
    text(d, (M, 92), "집사 없는 날: 냥이 수비대 · 2026-10-18", font(28, False), INK_SOFT)
    text(d, (M, 128), "큰 그림 = 후보 / 작은 그림 = 게임 속 크기(폰 2배 화면)", font(28, False), INK_SOFT)
    blocks.append(title)
    for item in ITEMS:
        head = Image.new("RGBA", (W, 118), (0, 0, 0, 0))
        d = ImageDraw.Draw(head)
        d.rounded_rectangle((M, 6, W - M, 114), 22, fill=KRAFT, outline=KRAFT_D, width=3)
        text(d, (M + 24, 12), item["title"], font(40), INK)
        text(d, (M + 24, 66), item["sub"], font(27, False), INK)
        blocks.append(head)
        if item["layout"] == "cols":
            blocks.append(draw_cols(item))
        else:
            for c in item["cands"]:
                blocks.append(draw_band(item, c))
                blocks.append(Image.new("RGBA", (W, 4), (0, 0, 0, 0)))
        blocks.append(Image.new("RGBA", (W, 18), (0, 0, 0, 0)))
    total = sum(b.height + 6 for b in blocks) + M
    sheet = Image.new("RGBA", (W, total), PAPER + (255,))
    y = 0
    for b in blocks:
        sheet.alpha_composite(b, (0, y))
        y += b.height + 6
    out = HERE / "_sheet.png"
    sheet.convert("RGB").save(out)
    print(f"sheet {sheet.size} -> {out}")


if __name__ == "__main__":
    main()
