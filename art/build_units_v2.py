#!/usr/bin/env python
"""Unit roster v2 (art direction confirmed 2026-10-06): 20 cats, one breed each, in four class lines.

    python art/build_units_v2.py            -> art/units_v2/jobs.json  (for tools/gen_image.py --batch)
    python art/build_units_v2.py --table    -> prints the roster as a Markdown table

Lineage rules, so a merge (same class, next tier) reads as one consistent step up:
  * CLASS  = outfit colour + one heirloom item that every tier of the line wears.
  * TIER   = the same ladder in every class: toy gear -> plain gear -> short cape -> long gold-trimmed
             mantle -> mantle + halo.
  * BREED  = one per unit, chosen to suit that character's job.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "art" / "units_v2"

# Approved samples: the rendering every new unit must match.
STYLE_REFS = ["art/style2/v2_m_snow.png", "art/style2/v2_t_chef.png"]
REF_NOTE = (
    "The attached images are APPROVED characters from the same game and are RENDERING references only. "
    "Match exactly their outline weight, white sticker border, matte flat colouring, chibi proportions, "
    "dot eyes with eyebrows and level of detail. Draw the NEW character described below: a different cat "
    "breed with different fur and a different outfit. Do NOT copy the fur colours, clothes or props of the references."
)

CLASSES = {
    "warrior": {"ko": "전사", "colour": "warm red", "heirloom": "a red neckerchief tied at the neck"},
    "ranger": {"ko": "사수", "colour": "leaf green", "heirloom": "one green feather"},
    "mage": {"ko": "마법", "colour": "royal blue", "heirloom": "a yellow star-shaped clasp"},
    "trickster": {"ko": "재주", "colour": "golden yellow", "heirloom": "a round golden bell on the collar"},
}

TIERS = {
    1: ("꼬마", "TIER 1 of 5, the little kid: a small kitten with an extra-big head; home-made TOY-grade gear only. NO cape, NO armour, NO gold."),
    2: ("동네", "TIER 2 of 5, the neighbourhood rookie: a young cat with plain, real but simple gear. NO cape, NO gold."),
    3: ("골목대장", "TIER 3 of 5, the alley boss: sturdier gear with one metal piece and a SHORT hip-length cape in {colour}. No gold."),
    4: ("대왕", "TIER 4 of 5, the great king: regal, ornate gear with GOLD trim and a LONG flowing mantle in {colour} with a gold edge."),
    5: ("수호신", "TIER 5 of 5, the guardian deity: majestic, gold ornaments, a LONG {colour} mantle with a gold edge, and a flat matte golden ring halo floating behind the head (a plain flat ring, no glow)."),
}

BLACK_EYES = "small solid black dot eyes (no iris, no highlights, no eyelashes)"


def light_eyes(colour: str) -> str:
    return (f"small solid {colour} dot eyes with a thin dark outline (no pupils, no highlights, no eyelashes), "
            "chosen so they stay readable on the dark fur; eyebrows in a light cream colour")


# id, class, tier, Korean name, breed (Korean), why the breed suits the job (Korean),
# cat description, eyes, expression, props
UNITS = [
    # ── warrior ──
    ("w_paw", "warrior", 1, "솜방망이", "코리안 숏헤어(치즈태비)", "골목에서 구르며 큰 길냥이 꼬마 싸움꾼",
     "a Korean Shorthair street kitten: short orange 'cheese' tabby coat with darker orange stripes, white muzzle, chest and paws",
     BLACK_EYES,
     "fierce little scowl: eyebrows angled sharply down, mouth wide open in a battle shout showing one tiny fang",
     "oversized red boxing gloves on both paws raised in a guard, a red neckerchief, a sticking plaster on one cheek, a small bandage wrapped around the tail tip"),
    ("w_sword", "warrior", 2, "검사냥", "브리티시 숏헤어", "다부진 체격에 침착한 성격, 듬직한 검사",
     "a British Shorthair: dense plush solid blue-grey coat, very round head with chubby cheeks, small rounded ears set wide apart, stocky body, thick tail",
     BLACK_EYES,
     "calm and confident: one eyebrow raised, a closed-mouth smirk",
     "a chunky wooden practice sword raised in the right paw, a dented pot lid strapped to the left arm as a shield, a red neckerchief, a leather belt with a small pouch"),
    ("w_viking", "warrior", 3, "바이킹냥", "노르웨이숲", "바이킹의 배를 탔다는 북유럽 숲 고양이",
     "a Norwegian Forest Cat: long shaggy brown tabby coat, a big fluffy white chest ruff, white paws, tufted ears, a very bushy tail",
     BLACK_EYES,
     "a booming hearty laugh: thick eyebrows raised, mouth wide open showing two small fangs",
     "an iron helmet with two short horns (ears poke out beside it), a heavy double-bladed axe resting on the shoulder, a round wooden shield with an iron boss on the other arm, a red neckerchief over the ruff, a short red cape, two braided fur locks tied with red beads"),
    ("w_samurai", "warrior", 4, "사무라이냥", "재패니즈 밥테일", "일본 토종 고양이, 절도 있는 발도술의 달인",
     "a Japanese Bobtail: short white coat with a few bold black patches on the top of the head and the back, tall upright ears, slim body, and a short round pom-pom bobtail",
     BLACK_EYES,
     "stern focus: flat low eyebrows, mouth a thin straight closed line",
     "a katana in an iaido draw stance (one paw on the sheath at the hip, the other on the hilt), red lacquered shoulder armour with gold trim, a long red sleeveless surcoat with a gold edge worn like a mantle, a plain white headband tied at the back with long tails, a red neckerchief knot at the collar"),
    ("w_tiger", "warrior", 5, "호랑이 장군", "뱅갈", "호랑이 무늬를 타고난, 자기가 호랑이라고 믿는 대장",
     "a Bengal cat: short golden-orange coat with bold dark tiger-like stripes and rosettes, three strong stripes on the forehead, white muzzle and chin, muscular build",
     BLACK_EYES,
     "proud and fearless: eyebrows angled down, a wide toothy grin showing two fangs",
     "ornate golden general's armour, a golden helmet with a tall red plume (ears visible), a crescent-bladed polearm held upright, a long red cape with a gold edge, a red neckerchief knot at the collar, a small tiger-striped war banner on the back, a flat golden ring halo behind the head"),
    # ── ranger ──
    ("r_sling", "ranger", 1, "새총냥", "먼치킨", "짧은 다리로 뒤뚱대는 장난꾸러기 꼬마",
     "a Munchkin kitten: noticeably short stubby legs, long low body, cream-and-white bicolour coat with soft tan patches on the ears and back",
     BLACK_EYES,
     "cheeky and aiming: one eye is a closed curved line (winking), one eyebrow raised, tongue poking out at the corner of a grin",
     "a wooden Y-shaped slingshot pulled back with a pebble, a green baseball cap worn backwards with one green feather tucked into it, a small pouch of pebbles on a belt, a sticking plaster on one knee"),
    ("r_archer", "ranger", 2, "궁수냥", "아비시니안", "날렵하고 운동 신경 좋은 사냥꾼 체형",
     "an Abyssinian: lean athletic body, short ruddy reddish-brown ticked coat without stripes, a darker line along the back, large pointed ears, long slender tail",
     BLACK_EYES,
     "holding its breath in concentration: eyebrows knitted together, a tiny round 'o' mouth",
     "a short wooden bow drawn with an arrow nocked, a leather quiver of green-fletched arrows on the back, a green cowl hood pushed down around the neck so the ears stay visible, one green feather tucked behind an ear, a leather arm bracer"),
    ("r_ninja", "ranger", 3, "닌자냥", "봄베이", "어둠에 녹아드는 새까만 털의 '작은 흑표범'",
     "a Bombay cat: sleek short jet-black coat all over (flat black, shown with a slightly lighter charcoal shadow tone), rounded head, medium ears",
     light_eyes("golden-yellow"),
     "sly and cool: one eyebrow raised, a small one-sided smirk showing one fang",
     "three steel throwing stars fanned in one raised paw, a short straight sword strapped across the back with one green feather tied to its hilt, a dark-green ninja wrap outfit with the face mask pulled down around the neck, a green cloth headband with a plain metal plate and long fluttering tails, a short dark-green scarf-cape"),
    ("r_gunner", "ranger", 4, "총잡이냥", "이집션 마우", "가장 빠른 집고양이, 점박이 명사수",
     "an Egyptian Mau: short silver coat covered in distinct round black spots, banded legs and tail, an 'M'-shaped mark on the forehead, lean long-legged build",
     BLACK_EYES,
     "unbothered and cool: relaxed flat eyebrows, a lopsided grin chewing a fish-bone like a toothpick",
     "a long ornate TOY cork pop-gun rifle of brass and wood resting on the shoulder with a cork dangling on a string from the muzzle, a brass targeting monocle over one eye, a bandolier of corks across the chest, a long green mantle with a gold edge, one green feather pinned to the mantle clasp"),
    ("r_star", "ranger", 5, "별빛 사수", "터키시 앙고라", "달빛처럼 새하얀 비단결 털과 신비로운 오드아이",
     "a Turkish Angora: slender elegant body, pure white silky medium-long coat, large upright ears, a long fine plumed tail",
     "odd eyes: the left eye a small solid sky-blue dot and the right eye a small solid amber dot, each with a thin dark outline (no pupils, no highlights, no eyelashes)",
     "serene and gentle: softly arched eyebrows, a small closed peaceful smile",
     "a tall silver crescent-moon bow drawn with a pale flat arrow of moonlight, a quiver of star-tipped arrows, a long green mantle with a gold edge and tiny flat star dots, a small silver crescent ornament on the forehead, one green feather worn as an ear ornament, a flat golden ring halo behind the head"),
    # ── mage ──
    ("m_snow", "mage", 1, "눈덩이냥", "랙돌", "솜뭉치 같은 털, 안기면 축 늘어지는 순둥이",
     "a bicolour Ragdoll kitten: very fluffy cream-white coat, soft seal-brown ears, tail and a seal-brown mask split by a white inverted-V blaze over the nose, big fluffy cheeks",
     light_eyes("sky-blue"),
     "cheerful: eyebrows raised high, a closed happy 'w' smile",
     "blue earmuffs, a blue-and-white striped scarf fastened with a yellow star-shaped clasp, blue mittens, one big snowball held in front of the chest with BOTH paws, a tiny snowman buddy standing beside its feet"),
    ("m_fire", "mage", 2, "불꽃냥", "카오스(토터셸)", "검정에 주황이 불씨처럼 박힌 털, 불같은 성격",
     "a tortoiseshell cat: short coat of mottled black and orange patches like glowing embers in soot, with a half-black half-orange split face",
     light_eyes("amber-yellow"),
     "mischievous: one eyebrow up, an open grin, one singed curly whisker and a soot smudge on the cheek",
     "a giant matchstick used as a wand with a small flat orange flame, a short blue hooded cape with scorched brown edges and the hood down, the burnt tip of the hood trailing one wisp of smoke, a yellow star-shaped clasp at the neck, a small blue spellbook tucked under the other arm"),
    ("m_storm", "mage", 3, "번개냥", "메인쿤", "번개 모양 귀 끝 털, 정전기로 부풀어 오른 풍성한 갈기",
     "a Maine Coon: big and very fluffy, long silver-grey tabby coat with a huge white chest ruff and white paws, tall ears with long lynx tufts at the tips, a large bushy plume tail; the whole coat is puffed outward like a pom-pom from static electricity, with a few zig-zag stray hairs",
     BLACK_EYES,
     "zapped and thrilled: eyebrows shot straight up, a zig-zag wavy open grin",
     "a copper lightning-rod staff with a small grey storm cloud and one flat yellow lightning bolt on top, yellow rubber boots, a short blue cape fastened with a yellow star-shaped clasp, a copper wire coil bracelet, a tiny grumpy storm cloud floating beside the shoulder"),
    ("m_frost", "mage", 4, "얼음 여왕", "페르시안", "눈처럼 흰 긴 털, 도도한 여왕님",
     "a white Persian: very long luxurious pure white coat, a flat round face with a tiny nose, small rounded ears, a huge plumed tail",
     BLACK_EYES,
     "haughty: one eyebrow arched high, chin lifted, a small pursed mouth",
     "a sceptre topped with a large pale-blue ice crystal, a small tiara of ice crystals between the ears, a long blue mantle with a white fur collar and a gold edge, a yellow star-shaped clasp, a tiny flat snowflake spirit floating beside the paw"),
    ("m_cosmo", "mage", 5, "우주냥", "러시안 블루", "밤하늘처럼 깊은 은청색 털, 말수 적은 신비로운 성격",
     "a Russian Blue: slender body, short dense deep blue-grey coat with a soft silvery sheen drawn as a flat lighter tone, large upright ears, long fine tail",
     BLACK_EYES,
     "deadpan and mysterious: tiny flat eyebrows, a small round 'o' mouth",
     "a small flat black-hole orb with a pale ring hovering between both raised paws, a long deep-indigo-blue robe with a high collar, a gold edge and flat star dots, a yellow star-shaped clasp, a tiny ringed planet orbiting near one ear, a flat golden ring halo behind the head"),
    # ── trickster ──
    ("t_bell", "trickster", 1, "방울냥", "스코티시 폴드", "접힌 귀에 방울처럼 동그란 얼굴",
     "a Scottish Fold kitten: small ears folded forward and down flat against a very round head, pale golden-cream coat with faint tabby marks, round chubby body",
     BLACK_EYES,
     "pure joy: eyebrows up, eyes squeezed shut into two happy upward curves, a big open laughing mouth",
     "a large brass hand bell with a wooden handle swung high in one paw, a yellow collar with a round golden bell, a yellow ribbon bow on the tail, a jingle-bell anklet"),
    ("t_chef", "trickster", 2, "요리사냥", "턱시도", "정장을 차려입은 듯한 무늬의 꼬마 주방장",
     "a tuxedo cat: short black coat with a crisp white muzzle blaze reaching up between the eyes, white chest bib, white paws and white whisker pads",
     light_eyes("golden-yellow"),
     "proud of the dish: confident angled eyebrows, a closed 'w' smile with the tongue tip licking the lips",
     "a tall white chef's hat (ears visible beside it), a black frying pan with one grilled fish held out, a wooden ladle in the other paw, a white apron with a yellow pocket and a small fish-bone print, a yellow neckerchief with a round golden bell"),
    ("t_bard", "trickster", 3, "악사냥", "샴", "목청 크고 수다스럽기로 유명한 품종",
     "a Siamese: slim sleek short cream coat with dark chocolate points (face mask, ears, paws and tail), a wedge-shaped face, large pointed ears, long thin tail",
     light_eyes("sky-blue"),
     "singing with feeling: eyebrows raised together in the middle, mouth wide open in a long sung note",
     "a small round-bodied lute strummed with both paws, a short yellow cape, a yellow collar with a round golden bell, a small tambourine hanging at the hip, a yellow flower tucked behind one ear"),
    ("t_alch", "trickster", 4, "연금술사냥", "엑조틱 숏헤어", "늘 못마땅한 납작 얼굴, 수상한 물약 장인",
     "an Exotic Shorthair: plush short deep-orange red tabby coat, a flat round face with a tiny pushed-in nose and heavy cheeks, small rounded ears, a stout round body",
     BLACK_EYES,
     "grumpy and suspicious: heavy flat eyebrows pressed low, a downturned frown",
     "a bubbling yellow potion in a round glass flask held up in one paw, round brass goggles pushed up on the forehead, a bandolier of small corked vials in different colours, a long golden-yellow alchemist coat with a gold edge worn like a mantle, thick rubber gloves, a collar with a round golden bell"),
    ("t_lucky", "trickster", 5, "복고양이", "삼색이(칼리코)", "복을 부른다는 삼색 고양이, 마네키네코의 주인공",
     "a calico cat: white coat with large clear orange and black patches on the head, back and tail, a white face with one orange and one black ear patch, round friendly body",
     BLACK_EYES,
     "beaming and kind: gentle arched eyebrows, a wide curved cat smile",
     "one front paw raised high in a beckoning gesture, a big plain golden oval coin with NO markings held against the chest with the other paw, a red-and-gold braided collar with a large round golden bell, a long golden-yellow mantle with a gold edge, three small plain gold coins floating nearby, a flat golden ring halo behind the head"),
]

STYLE = (
    "Style: 2D cartoon sticker illustration with a thick dark-brown outline and a clean white sticker border. "
    "MATTE finish: flat colours with at most one soft shadow tone per shape, NO glossy highlights, NO specular shine, "
    "NO strong gradients, NO rim light, NO sparkle or glitter effects, NO glow; slightly muted, natural colours "
    "(never neon or over-saturated). Simple large shapes that read at thumbnail size.\n"
    "Proportions: chibi with a big round head (about 2 heads tall), small body, short limbs.\n"
)
TAIL = (
    "Anatomy: exactly two arms and two legs; both arms attach naturally at the shoulders on the sides of the body with "
    "believable length and bend; paws hold items in a natural grip; one tail; nothing fused, duplicated or floating "
    "unless described as floating.\n"
    "Composition: full body, standing, front view facing slightly right, centred, generous padding, no ground shadow.\n"
    "Background: genuinely transparent background (alpha) outside the white sticker border.\n"
    "Constraints: single character, no text, no letters, no numbers, no watermark, nothing cropped."
)


def prompt(u: tuple) -> str:
    uid, cls, tier, _name, _breed, _why, cat, eyes, expression, props = u
    c = CLASSES[cls]
    return (
        "Use case: stylized-concept\n"
        "Asset type: mobile game unit sprite shown small (about 90 px)\n"
        f"Subject: {cat}. The breed must be recognisable at a glance from its coat, ears, face shape, fur length and tail.\n"
        f"Expression: {expression}.\n"
        f"Props: {props}.\n"
        f"Class identity ({cls} line): the outfit's main colour is {c['colour']}, and it wears {c['heirloom']}, "
        "the heirloom every cat of this line wears.\n"
        f"Rank: {TIERS[tier][1].format(colour=c['colour'])}\n"
        + STYLE
        + f"Face: {eyes}, short simple EYEBROWS that clearly show the expression, a tiny pink nose, and the mouth described above.\n"
        + TAIL
    )


def main() -> int:
    if "--table" in sys.argv:
        print("| 직업 | 등급 | 유닛 | 고양이 종 | 고른 이유 |")
        print("|---|---|---|---|---|")
        for uid, cls, tier, name, breed, why, *_ in UNITS:
            print(f"| {CLASSES[cls]['ko']} | {TIERS[tier][0]} | {name} (`{uid}`) | {breed} | {why} |")
        return 0
    jobs = [{"name": f"unit_{u[0]}", "ref": STYLE_REFS, "ref_note": REF_NOTE, "prompt": prompt(u)} for u in UNITS]
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "jobs.json").write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(jobs)} jobs -> {OUT / 'jobs.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
