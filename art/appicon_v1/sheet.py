"""App icon comparison sheet: each candidate as Play shows it (512 square), under the two launcher masks (circle, squircle)
at 192 px, and at home-screen sizes (96 and 48 px) on a phone-like wallpaper with the short name under it.
    python art/appicon_v1/sheet.py <out.png> <name=path> ...
"""
import sys
from PIL import Image, ImageDraw, ImageFont

FONT = 'C:/Windows/Fonts/malgunbd.ttf'
out = sys.argv[1]
items = [a.split('=', 1) for a in sys.argv[2:]]


def mask(size, kind):
    m = Image.new('L', (size * 4, size * 4), 0)
    d = ImageDraw.Draw(m)
    if kind == 'circle':
        d.ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=int(size * 4 * 0.3), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def masked(img, size, kind):
    # A launcher shows the middle 72 of the 108 dp adaptive canvas: crop the outer sixth before the mask.
    w = img.width
    c = img.crop((w // 6, w // 6, w - w // 6, w - w // 6)).resize((size, size), Image.LANCZOS)
    t = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    t.paste(c, (0, 0), mask(size, kind))
    return t


font = ImageFont.truetype(FONT, 30)
small = ImageFont.truetype(FONT, 17)
ROW_H = 600
W = 512 + 192 * 2 + 340 + 120
sheet = Image.new('RGB', (W, ROW_H * len(items) + 20), (246, 238, 224))
d = ImageDraw.Draw(sheet)
for i, (name, path) in enumerate(items):
    img = Image.open(path).convert('RGBA').resize((1024, 1024), Image.LANCZOS)
    y = 20 + i * ROW_H
    d.text((20, y), name, font=font, fill=(70, 45, 30))
    y += 50
    sheet.paste(img.resize((512, 512), Image.LANCZOS), (20, y))
    x = 552
    for kind in ('circle', 'squircle'):
        m = masked(img, 192, kind)
        sheet.paste(m, (x, y + 20), m)
        x += 212
    # Home screen: a dim blue-grey wallpaper, icon at 96 and 48 with the label.
    hx, hy = x + 10, y + 260
    d.rounded_rectangle((hx, hy - 20, hx + 330, hy + 220), radius=18, fill=(58, 74, 96))
    for size, ox in ((96, 30), (48, 200)):
        m = masked(img, size, 'squircle')
        sheet.paste(m, (hx + ox, hy + 10), m)
        tw = d.textlength('냥이 수비대', font=small)
        d.text((hx + ox + size / 2 - tw / 2, hy + 18 + size), '냥이 수비대', font=small, fill=(255, 255, 255))
sheet.save(out)
print('saved', out, sheet.size)
