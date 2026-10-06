#!/usr/bin/env python
"""Currency, chest and toy (relic) icons in the v2 rendering (matte sticker).

    python art/build_icons_v2.py   -> art/icons_v2/jobs.json  (for tools/gen_image.py --batch --out-dir art/icons_v2)

Order = priority: currencies and chests, the ten toys that never had art, then redraws of the twenty
existing toy icons. Icons that already exist attach the current image so the object stays the same.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "art" / "icons_v2"
RENDER_REF = "art/units_v2/unit_t_bell.png"

REDRAW_NOTE = (
    "Image 1 is the CURRENT icon from our game: keep the same object, shape idea and main colours, but redraw it "
    "from scratch in the rendering of image 2, an approved character from the same game (image 2 is a RENDERING "
    "reference only: do not draw a cat). Do NOT copy image 1's glossy highlights, glow or sparkles."
)
NEW_NOTE = (
    "The attached image is a RENDERING reference only (outline weight, white sticker border, matte flat colours). "
    "Do not draw a cat."
)

ICONS = {
    "icon_fish": "a small blue-silver fish treat (a whole little sardine) with a round dot eye",
    "icon_gold": "a thick gold coin embossed with a cat paw print",
    "icon_gem": "a faceted pink gemstone shaped like a cat head with pointy ears, facets drawn as flat tones",
    "icon_chest_wood": "a small closed wooden treasure chest with iron bands and a paw-print lock",
    "icon_chest_silver": "a closed silver treasure chest with blue gem inlay and a paw-print lock",
    "icon_chest_gold": "an ornate closed golden treasure chest with red gems and cat-ear shaped lid corners",
    "icon_card": "a single collectible card seen at a slight angle, teal back with a cream cat paw emblem",
    "icon_xp": "a blue star badge with a small upward arrow shape embossed",
    "icon_clover": "a lucky four-leaf clover with heart-shaped green leaves",
    "icon_capsule": "a round capsule toy, top half pink and bottom half white, with a tiny star inside",
}

NEW_RELICS = {
    "nap_blanket": "a folded fluffy soft-blue blanket with a crescent moon pattern",
    "twin_bells": "two golden jingle bells joined by a red ribbon bow",
    "lucky_coin": "an old gold coin with a square hole in the middle and a red tassel, no characters on it",
    "sardine_crate": "a small wooden crate packed with silver sardines on ice",
    "sunny_spot": "a warm patch of golden sunlight in the shape of a window pane on a floor, with a small smiling sun above it",
    "nine_lives": "a red heart with a white cat silhouette inside and two tiny wings",
    "shooting_star": "a yellow shooting star with a flat rainbow tail",
    "golden_catnip": "a sprig of golden catnip leaves tied with a small ribbon",
    "royal_crown": "a tiny golden royal crown with red gems and cat-ear shaped points",
    "hourglass": "a brass hourglass with blue sand flowing",
}

OLD_RELICS = {
    "yarn_ball": "a red ball of yarn with a loose strand",
    "glitter_ball": "a bouncy cat toy ball with colourful flat confetti dots and tiny stars inside",
    "cardboard_box": "an open brown cardboard box with flaps up",
    "bell_collar": "a red pet collar with a golden bell",
    "fishing_rod": "a cat teaser fishing-rod toy with a dangling felt fish",
    "scratcher": "a cardboard cat scratcher pad with claw marks",
    "mouse_toy": "a grey plush toy mouse with a pink string tail",
    "feather_wand": "a cat wand toy with colourful feathers on the tip",
    "cat_tower": "a small carpeted cat tree tower with two platforms and a hanging pom-pom",
    "kneading_cushion": "a soft plump pink cushion with paw-shaped dents pressed into it",
    "cat_tunnel": "a collapsible striped fabric cat tunnel with a round opening",
    "heating_pad": "a cosy orange heated pet mat with a power cord and three small warmth waves",
    "batteries": "two cartoon AA batteries side by side, one yellow and one blue, with a small lightning bolt symbol and no lettering",
    "snack_stick": "a tube of creamy cat treat paste: a plain orange squeeze pouch with the tip torn open, no label text",
    "tuna_cans": "a stack of three round tuna cans with plain blue labels and a fish silhouette",
    "window_perch": "a small suction-cup window hammock bed for cats in beige fabric",
    "purr_pillow": "a plump round pink cushion with a sleeping cat face embroidered on it and little vibration lines around it",
    "silvervine": "a bundle of silvervine sticks tied with a red ribbon, with green leaves",
    "auto_feeder": "an automatic pet food dispenser with a clear kibble container and a bowl",
    "glass_marble": "a swirled blue-and-white glass marble drawn with flat tones",
}

STYLE = (
    "Style: 2D cartoon sticker icon with a thick dark-brown outline and a clean white sticker border. "
    "MATTE finish: flat colours with at most one soft shadow tone per shape, NO glossy highlights, NO specular shine, "
    "NO strong gradients, NO rim light, NO sparkle or glitter effects, NO glow; slightly muted, natural colours. "
    "One bold simple silhouette that reads at thumbnail size.\n"
    "Composition: centred, three-quarter view where it helps, generous padding, no ground shadow.\n"
    "Background: genuinely transparent background (alpha) outside the white sticker border.\n"
    "Constraints: single object, no face unless described, no text, no letters, no numbers, no watermark, nothing cropped."
)


def job(name: str, subject: str, redraw: bool) -> dict:
    return {
        "name": name,
        "ref": ([f"art/raw/{name}.png"] if redraw else []) + [RENDER_REF],
        "ref_note": REDRAW_NOTE if redraw else NEW_NOTE,
        "prompt": f"Use case: stylized-concept\nAsset type: mobile game icon shown small (about 56 px)\nSubject: {subject}.\n{STYLE}",
    }


def main() -> None:
    jobs = [job(k, v, True) for k, v in ICONS.items()]
    jobs += [job(f"relic_{k}", v, False) for k, v in NEW_RELICS.items()]
    jobs += [job(f"relic_{k}", v, True) for k, v in OLD_RELICS.items()]
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "jobs.json").write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(jobs)} jobs -> {OUT / 'jobs.json'}")


if __name__ == "__main__":
    main()
