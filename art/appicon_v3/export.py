"""Write every app icon from art/appicon_v3 (run compose.py first): the Play listing icon, the Android launcher icons and
splash, and the web app icons. Sizes and masks:
  - Play (store/icon-512.png): the middle 80 % of the master, 512 x 512, 32-bit with alpha (Play rounds the corners itself).
  - Android 8+ adaptive icon: foreground (cats) and background (rays) layers at 108 dp, no inset (the launcher shows the middle
    72 dp under its own mask, which is where compose.py keeps the cats). Older Android: the middle 2/3 under a rounded square
    (ic_launcher) and a circle (ic_launcher_round) at 48 dp.
  - Splash (Capacitor, Android 11 and older): the icon at 512 px with 20 % rounded corners on the cream 2732 master, cut to
    each drawable size the way it was made (scale to cover, centre crop; checked on the old master: mean difference 0.05).
  - Web: any-purpose icons (192, 512, Apple 180) from the middle 80 %, the maskable 512 from the whole master (the cats stay
    inside its 80 % safe circle).
    python art/appicon_v3/export.py
"""
import glob
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
CREAM = (251, 243, 226)
DENSITY = {'ldpi': 0.75, 'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

icon = Image.open(os.path.join(HERE, 'icon.png')).convert('RGBA')
fg = Image.open(os.path.join(HERE, 'foreground.png')).convert('RGBA')
bg = Image.open(os.path.join(HERE, 'background.png')).convert('RGBA')


def middle(img: Image.Image, share: float) -> Image.Image:
    w = img.width
    m = round(w * (1 - share) / 2)
    return img.crop((m, m, w - m, w - m))


def shape(size: int, kind: str, radius: float = 0.2) -> Image.Image:
    big = size * 4
    m = Image.new('L', (big, big), 0)
    d = ImageDraw.Draw(m)
    if kind == 'circle':
        d.ellipse((0, 0, big - 1, big - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, big - 1, big - 1), radius=round(big * radius), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def masked(img: Image.Image, size: int, kind: str, radius: float = 0.2) -> Image.Image:
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img.resize((size, size), Image.LANCZOS), (0, 0), shape(size, kind, radius))
    return out


def save(img: Image.Image, *parts: str) -> None:
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    print(os.path.relpath(path, ROOT), img.size, img.mode)


framed = middle(icon, 0.8)
visible = middle(icon, 2 / 3)

# Play listing and the Capacitor sources (kept so `npx @capacitor/assets` would start from the same pictures).
save(framed.resize((512, 512), Image.LANCZOS), 'store', 'icon-512.png')
save(fg, 'store', 'android', 'icon-foreground.png')
save(bg.convert('RGB').convert('RGBA'), 'store', 'android', 'icon-background.png')
save(icon, 'store', 'android', 'icon-only.png')

# Android launcher.
for name, k in DENSITY.items():
    layer = round(108 * k)
    legacy = round(48 * k)
    folder = f'mipmap-{name}'
    save(fg.resize((layer, layer), Image.LANCZOS), 'android', 'app', 'src', 'main', 'res', folder, 'ic_launcher_foreground.png')
    save(bg.resize((layer, layer), Image.LANCZOS), 'android', 'app', 'src', 'main', 'res', folder, 'ic_launcher_background.png')
    save(masked(visible, legacy, 'square'), 'android', 'app', 'src', 'main', 'res', folder, 'ic_launcher.png')
    save(masked(visible, legacy, 'circle'), 'android', 'app', 'src', 'main', 'res', folder, 'ic_launcher_round.png')

# Splash master and its drawable cuts.
splash = Image.new('RGBA', (2732, 2732), CREAM + (255,))
mark = masked(framed, 512, 'square', 0.2)
splash.alpha_composite(mark, ((2732 - 512) // 2, (2732 - 512) // 2))
save(splash, 'store', 'android', 'splash.png')
save(splash, 'store', 'android', 'splash-dark.png')
flat = splash.convert('RGB')
for f in glob.glob(os.path.join(RES, 'drawable*', 'splash.png')):
    w, h = Image.open(f).size
    s = max(w, h) / flat.width
    r = flat.resize((round(flat.width * s), round(flat.height * s)), Image.LANCZOS)
    x, y = (r.width - w) // 2, (r.height - h) // 2
    r.crop((x, y, x + w, y + h)).save(f, optimize=True)
print('splash cuts', len(glob.glob(os.path.join(RES, 'drawable*', 'splash.png'))))

# Web app.
save(framed.resize((192, 192), Image.LANCZOS).convert('RGB'), 'public', 'icons', 'icon-192.png')
save(framed.resize((512, 512), Image.LANCZOS).convert('RGB'), 'public', 'icons', 'icon-512.png')
save(framed.resize((180, 180), Image.LANCZOS).convert('RGB'), 'public', 'icons', 'apple-touch-icon.png')
save(icon.resize((512, 512), Image.LANCZOS).convert('RGB'), 'public', 'icons', 'icon-maskable-512.png')
