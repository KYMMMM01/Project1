#!/usr/bin/env python
"""Builds art/jobs.json — the full generation list for tools/gen_image.py.

Every prompt is assembled from a shared style block plus a short subject line, and each family
carries a style-reference image, so the whole set reads as one hand. Edit the tables below and
re-run:  python art/build_jobs.py && python tools/gen_image.py --batch art/jobs.json --parallel 4
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
UNIT_REF = "art/ref/unit_style.png"
ENEMY_REF = "art/ref/enemy_style.png"

UNIT_STYLE = (
    "Style: exactly the style of the reference image: bold vector sticker illustration like a top casual "
    "mobile game, thick dark outline, then a clean white sticker border around the whole silhouette, flat "
    "bright colours with a single soft gradient per shape, glossy highlight on the head, extremely simple "
    "large shapes that read instantly at thumbnail size.\n"
    "Proportions: super-deformed chibi, HUGE round head (2-heads-tall), tiny body, short stubby limbs, "
    "big round glossy eyes.\n"
    "Composition: full body, front view facing slightly right, centred, generous padding, no ground shadow.\n"
    "Background: genuinely transparent background (alpha) outside the white sticker border.\n"
    "Constraints: single character, no text, no letters, no watermark, nothing cropped."
)

ENEMY_STYLE = (
    "Style: the same 2D cartoon mobile game art as the reference image: bold clean dark outline (NO white "
    "sticker border), cel shading with soft gradients, vibrant saturated colours, glossy highlights, simple "
    "chunky shapes that stay readable when shown very small (about 70 px tall). Mischievous cartoon villain "
    "mood: funny, never scary or gross.\n"
    "Composition: full body, 3/4 view walking toward the right, centred, generous padding, no ground shadow.\n"
    "Background: genuinely transparent background (alpha).\n"
    "Constraints: single character, no text, no letters, no watermark, nothing cropped."
)

ICON_STYLE = (
    "Style: glossy 2D cartoon mobile game item icon, bold dark outline, cel shading with soft gradients and "
    "a bright highlight, saturated colours, chunky simple shape readable at 64 px, slight 3/4 tilt.\n"
    "Composition: single object, centred, generous padding, no ground shadow.\n"
    "Background: genuinely transparent background (alpha).\n"
    "Constraints: no text, no letters, no numbers, no watermark, no frame, nothing cropped."
)

# id -> subject description
UNITS = {
    # warriors
    "w_paw": "a white cat with a determined smile wearing oversized red boxing gloves, one paw punching forward",
    "w_sword": "an orange tabby cat with a happy open-mouth smile and one tiny fang, a simple red bandana scarf, holding one small chunky wooden sword raised",
    "w_viking": "a fluffy brown Maine Coon cat with a small horned viking helmet and a round wooden shield on its back, holding a chunky one-handed axe, tough grin",
    "w_samurai": "a black-and-white tuxedo cat in simple red samurai armour with a small crested helmet, holding a katana in a ready stance, calm serious eyes",
    "w_tiger": "a majestic orange cat with bold black tiger stripes, wearing a golden general's helmet with a red tassel and a flowing red cape, holding a big crescent-blade glaive, proud fierce grin, a few small golden sparkles inside the outline",
    # rangers
    "r_sling": "a grey tabby kitten wearing a backwards blue cap, pulling back a wooden slingshot, playful tongue-out smile",
    "r_archer": "a cream Siamese cat with a green Robin Hood hood and a feather, drawing a small wooden bow, focused one-eye-closed aim",
    "r_ninja": "a black cat in a dark blue ninja outfit with a long red scarf, only the big yellow eyes visible, holding a metal throwing star",
    "r_gunner": "a calico cat with a brown cowboy hat and a sheriff star badge, holding a toy cork pop-gun, cool confident smirk",
    "r_star": "an elegant white cat with a starry midnight-blue hooded cloak and a tiny star tiara, drawing a glowing golden crescent-moon bow, serene confident look, a few tiny stars inside the outline",
    # mages
    "m_snow": "a fluffy light-grey kitten with blue earmuffs and a striped scarf, holding a big snowball above its head, cheerful grin",
    "m_fire": "a ginger cat with a pointy red wizard hat and a short wand tipped with a small cartoon flame, excited sparkling eyes",
    "m_storm": "a blue-grey Russian Blue cat with a yellow raincoat hood, holding a staff topped with a little lightning bolt, mischievous smile, two tiny sparks",
    "m_frost": "an elegant fluffy white Persian cat with an ice-crystal crown and a pale blue royal cape, holding a snowflake sceptre, cool gentle smile",
    "m_cosmo": "a deep purple cat whose fur is patterned like a starry galaxy, wearing a round glass astronaut helmet, floating with tiny ringed planets orbiting around it, wide amazed eyes",
    # tricksters
    "t_bell": "a small calico kitten with a very big golden bell on a red collar, ringing a little jingle bell in one paw, joyful closed-eye smile",
    "t_chef": "a chubby grey-and-white cat with a tall white chef hat and a small apron, holding a frying pan with a whole fish on it, proud smile",
    "t_bard": "a brown tabby cat with a green feathered minstrel hat, strumming a tiny lute, singing with a happy open mouth, one music note next to it",
    "t_alch": "a black-and-orange tortoiseshell cat with round brass goggles on its forehead and a little lab coat, holding a round flask of bubbling green potion, clever grin",
    "t_lucky": "a maneki-neko lucky cat: plump white cat with red inner ears, a red collar with a gold bell, one paw raised in the beckoning gesture and the other holding a big oval gold coin, golden accents, blissful smile, a few small golden sparkles inside the outline",
}

ENEMIES = {
    "cucumber": "a mischievous living cucumber monster: chubby green cucumber with stubby legs and arms, angry cartoon eyes with thick eyebrows, sneaky toothy grin, a few bumps on its skin",
    "dust": "a living dust bunny monster: a round grey fluffy ball of dust and lint with tiny stick legs, small annoyed eyes and a few stray hairs sticking out",
    "drop": "a living water droplet monster: a shiny blue teardrop of water with little running legs, cheeky wide grin, a tiny splash behind it",
    "roomba": "a robot vacuum cleaner monster: a flat round disc-shaped robot vacuum with a metal bumper, angry red LED eyes on top, small wheels and two tiny side brushes like arms, sturdy armoured look",
    "tangerine": "a living tangerine monster: a round bright orange citrus fruit with a green leaf on top, smug half-closed eyes, short legs, crossed little arms, a faint ring of sparkling citrus mist around it",
    "balloon": "a living red party balloon monster: a round red balloon with a goofy puffed-cheek face, a knotted bottom and a curly string trailing like a tail, tiny feet",
    "clock": "a living alarm clock monster: a round twin-bell alarm clock ringing hard with motion lines, wide startled-angry eyes on the dial, short metal legs, small hammer between the bells",
    "pill": "a living medicine bottle monster: a small white pill bottle with a green cap and a blank green label, smug sneaky face, little arms holding one capsule, short legs",
    "cone": "a living pet cone collar monster: a translucent white plastic cone-of-shame walking upside-down on stubby legs, grumpy eyes peeking from inside the cone",
    "dryer": "a living hair dryer monster: a chunky pink hair dryer with an angry puffed-cheek face on its body, blowing a visible swirl of hot air from its nozzle, a power cord whipping behind like a tail, stubby legs",
    "spray": "a living spray bottle monster: a blue plastic trigger spray bottle with an evil grin, squinting eyes, spraying a small puff of water mist from its nozzle, stubby legs",
    "firecracker": "a living firecracker monster: a red cylindrical firecracker with a sparking lit fuse on top, crazy wide excited eyes, zig-zag grin, tiny legs",
}

BOSSES = {
    "boss_cucumber": "a giant king cucumber boss monster: a huge fat cucumber wearing a small golden crown and a tattered green cape, furious thick eyebrows, big jagged grin, clenched fists, imposing stance",
    "boss_vacuum": "a giant upright vacuum cleaner boss monster: a big red-and-grey upright vacuum with a glowing angry visor for eyes, a flexible hose arm ending in a wide sucking nozzle, dust swirling into it, heavy wheels, menacing but funny",
    "boss_blender": "a giant kitchen blender boss monster: a chunky blender with an angry face on its base, a glass jar full of swirling orange smoothie with spinning blades, lid rattling, power-cord tail whipping, wild eyes",
    "boss_bath": "a giant bathtub boss monster: a white clawfoot bathtub overflowing with foamy bubbles, a shower-head neck rising like a snake with a grumpy face, a rubber duck floating on top, water sloshing over the rim, stubby clawed feet",
    "boss_cloud": "a giant thundercloud boss monster: a big dark purple-grey storm cloud with a furious glowing-eyed face, crackling yellow lightning bolts shooting from underneath, small rain streaks",
    "boss_needle": "a giant cartoon syringe boss monster: a big friendly-looking but mischievous toy syringe character wearing a round doctor's head mirror, half-filled with glowing green liquid, cartoon gloved hands, a smug know-it-all smile",
}

BACKGROUNDS = {
    "bg_livingroom": "a cosy living-room floor at golden hour: warm honey-coloured wooden planks. Along the outer edges only: the corner of a teal sofa, a potted monstera, a cat scratching post, a yarn ball, a toy mouse, a cat food bowl, warm window-light patches",
    "bg_kitchen": "a bright kitchen floor: cream and mint checkerboard tiles. Along the outer edges only: the bottom of white cabinets, a red fridge corner, a small trash bin, a spilled cereal bowl, a fallen wooden spoon, a floor mat by the sink",
    "bg_bathroom": "a clean bathroom floor: small pale-blue hexagon tiles, slightly wet and shiny. Along the outer edges only: the side of a white bathtub, a fluffy bath mat, a rubber duck, a laundry basket, soap bubbles, a towel dropped on the floor",
    "bg_garden": "a sunny backyard lawn: soft green grass with a few daisies and stepping stones. Along the outer edges only: a wooden fence, a flower bed, a garden hose, a watering can, a doghouse corner, scattered autumn leaves",
    "bg_vet": "a pet clinic floor: clean light-teal vinyl with a subtle paw-print pattern. Along the outer edges only: the legs of an exam table, a pet carrier, a weighing scale, a cabinet with jars, a waiting-room chair, a potted plant",
}

RUGS = {
    "ui_rug_livingroom": "a rectangular soft cream rug with a simple teal border and very subtle tone-on-tone woven pattern, short tassels on the two short edges",
    "ui_rug_kitchen": "a rectangular woven straw kitchen mat in warm beige with a thin red stripe border, very subtle weave texture",
    "ui_rug_bathroom": "a rectangular fluffy bath mat in soft lavender with a slightly darker plain border, very subtle fluffy texture",
    "ui_rug_garden": "a rectangular red-and-white gingham picnic blanket with soft low-contrast checks, slightly wrinkled edges",
    "ui_rug_vet": "a rectangular smooth rubber exam mat in pale mint green with a thin darker green border and rounded corners, very subtle texture",
}

ICONS = {
    "icon_fish": "a small shiny blue-silver fish treat (whole little sardine) with a cute round eye",
    "icon_clover": "a lucky four-leaf clover, bright green with heart-shaped leaves and a tiny sparkle",
    "icon_gold": "a thick gold coin embossed with a cat paw print",
    "icon_gem": "a faceted pink-magenta gemstone shaped like a cat head with pointy ears",
    "icon_chest_wood": "a small wooden treasure chest with iron bands and a paw-print lock, closed",
    "icon_chest_silver": "a silver treasure chest with blue gem inlay and a paw-print lock, closed, slightly glowing",
    "icon_chest_gold": "an ornate golden treasure chest with red gems and cat-ear shaped lid corners, closed, radiating a soft glow",
    "icon_card": "a single collectible trading card seen at a slight angle, purple back with a golden cat paw emblem",
    "icon_capsule": "a round gachapon capsule toy, top half translucent pink and bottom half white, with a tiny star inside",
    "icon_xp": "a glowing blue star badge with a small upward arrow shape embossed",
}

RELICS = {
    "yarn_ball": "a red ball of yarn with a loose strand",
    "glitter_ball": "a translucent bouncy cat toy ball filled with colourful glitter and tiny stars",
    "cardboard_box": "an open brown cardboard box with flaps up",
    "bell_collar": "a red pet collar with a golden bell",
    "fishing_rod": "a cat teaser fishing-rod toy with a dangling felt fish",
    "scratcher": "a cardboard cat scratcher pad with claw marks",
    "mouse_toy": "a grey plush toy mouse with a pink string tail",
    "feather_wand": "a cat wand toy with colourful feathers on the tip",
    "cat_tower": "a small carpeted cat tree tower with two platforms and a hanging pom-pom",
    "kneading_cushion": "a soft plump pink cushion with paw-shaped dents pressed into it",
    "cat_tunnel": "a collapsible striped fabric cat tunnel with a round opening",
    "heating_pad": "a cosy orange heated pet mat with a power cord and little warmth waves",
    "batteries": "two cartoon AA batteries side by side, one yellow and one blue, with a small lightning bolt symbol and no lettering",
    "snack_stick": "a tube of creamy cat treat paste, plain orange squeeze pouch with the tip torn open, no label text",
    "tuna_cans": "a stack of three round tuna cans with plain blue labels and a fish silhouette",
    "window_perch": "a small suction-cup window hammock bed for cats, beige fabric",
    "purr_pillow": "a plump round pink cushion with a sleeping cat face embroidered on it and little vibration lines around it",
    "silvervine": "a bundle of silvervine sticks tied with a red ribbon, with green leaves",
    "auto_feeder": "an automatic pet food dispenser machine with a transparent kibble container and a bowl",
    "glass_marble": "a shiny swirled glass marble, blue and white",
    "nap_blanket": "a folded fluffy blanket in soft blue with a crescent moon pattern",
    "twin_bells": "two golden jingle bells joined by a red ribbon bow",
    "lucky_coin": "an old gold coin with a square hole in the middle and a red tassel",
    "sardine_crate": "a small wooden crate packed with shiny sardines on ice",
    "sunny_spot": "a warm glowing patch of golden sunlight in the shape of a window pane with a small smiling sun above it",
    "nine_lives": "a glowing red heart with a white cat silhouette inside and tiny wings",
    "shooting_star": "a bright yellow shooting star with a sparkling rainbow tail",
    "golden_catnip": "a sprig of golden glowing catnip leaves with sparkles",
    "royal_crown": "a tiny golden royal crown with red gems and cat-ear shaped points",
    "hourglass": "a brass hourglass with blue sand flowing",
}


def unit_job(uid: str, subject: str) -> dict:
    prompt = (
        "Use case: stylized-concept\n"
        "Asset type: mobile game unit sprite that will be displayed small (about 90 px tall)\n"
        f"Subject: {subject}.\n" + UNIT_STYLE
    )
    return {"name": f"unit_{uid}", "prompt": prompt, "ref": [UNIT_REF]}


def enemy_job(eid: str, subject: str, boss: bool) -> dict:
    kind = "boss enemy sprite (displayed about 150 px tall)" if boss else "enemy sprite"
    prompt = f"Use case: stylized-concept\nAsset type: mobile game {kind}\nSubject: {subject}.\n" + ENEMY_STYLE
    prefix = "" if boss else "enemy_"
    return {"name": f"{prefix}{eid}", "prompt": prompt, "ref": [ENEMY_REF]}


def bg_job(name: str, scene: str) -> dict:
    prompt = (
        "Use case: stylized-concept\n"
        "Asset type: mobile game battlefield background, portrait 9:16\n"
        f"Scene: straight top-down bird's-eye view of {scene}.\n"
        "Layout: the whole central area (about 80% of the width and the middle 70% of the height) is EMPTY "
        "plain floor with nothing on it, because game pieces are drawn there. All props stay tucked against "
        "the four outer edges and corners and are partly cut off by the frame.\n"
        "Style: 2D cartoon mobile game art, clean shapes, soft cel shading, warm inviting colours, slightly "
        "muted and low-contrast so that characters placed on top stand out, no heavy outlines on the floor.\n"
        "Constraints: no characters, no animals, no people, no text, no UI, no watermark."
    )
    return {"name": name, "prompt": prompt}


def rug_job(name: str, subject: str) -> dict:
    prompt = (
        "Use case: stylized-concept\n"
        "Asset type: mobile game board mat, seen exactly from above\n"
        f"Subject: {subject}, landscape orientation with width to height ratio 6 to 5, perfectly straight and "
        "axis-aligned, filling most of the frame.\n"
        "Style: 2D cartoon mobile game art, soft cel shading, calm low-contrast surface (game characters "
        "stand on it, so the pattern must stay very quiet), thin soft dark outline.\n"
        "Background: genuinely transparent background (alpha) around the mat.\n"
        "Constraints: single object, no shadow, no text, no characters, no watermark."
    )
    return {"name": name, "prompt": prompt}


def icon_job(name: str, subject: str) -> dict:
    prompt = f"Use case: stylized-concept\nAsset type: mobile game item icon\nSubject: {subject}.\n" + ICON_STYLE
    return {"name": name, "prompt": prompt, "ref": [ENEMY_REF]}


def main() -> None:
    jobs: list[dict] = []
    jobs += [unit_job(k, v) for k, v in UNITS.items()]
    jobs += [enemy_job(k, v, False) for k, v in ENEMIES.items()]
    jobs += [enemy_job(k, v, True) for k, v in BOSSES.items()]
    jobs += [bg_job(k, v) for k, v in BACKGROUNDS.items()]
    jobs += [rug_job(k, v) for k, v in RUGS.items()]
    jobs += [icon_job(k, v) for k, v in ICONS.items()]
    jobs += [icon_job(f"relic_{k}", v) for k, v in RELICS.items()]
    names = [j["name"] for j in jobs]
    assert len(names) == len(set(names)), "duplicate job names"
    out = HERE / "jobs.json"
    out.write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(jobs)} jobs -> {out}")


if __name__ == "__main__":
    main()
