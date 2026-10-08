/**
 * The colours of the battle effects. They are flat cartoon colours, drawn with the same dark-brown outline as the cats and the enemies
 * (the outline comes with the drawings; the shapes the code draws use `Color.ink`), so none of them is a light: nothing here is
 * added to the picture, it is laid on it. Friendly effects are cool or magical (ice, lime, violet and ember); hostile ones are small
 * and quiet (the thin ring of an aura carrier wears the coral or berry of the sticker its helped enemies wear); an enemy's shield is its
 * own cobalt blue, which no friendly effect wears.
 */
export const Light = {
  /** Blizzard: ice, the mid blue its rim is drawn in so it shows on a pale floor too, and the white of snow. */
  ice: 0xbfe6ff,
  iceEdge: 0x7ec8ff,
  iceWhite: 0xf3faff,
  /** Potion cloud. */
  lime: 0xa6e65c,
  /** Black hole: the lavender of its rim, and the scraps that fall in. */
  voidRim: 0xb69cff,
  voidScraps: [0xffd9a0, 0xff7ac8, 0xa987ff, 0xfff2d6] as readonly number[],
  /** The star where lightning lands. */
  zapFlash: 0xfff1a0,
  /** An enemy's shield: its cobalt outline, the pale blue of its highlight, and the white of a hit on it. */
  shield: 0x2f66e8,
  shieldRim: 0x9dbcff,
  /** What a shot sheds: dust, steam and gunsmoke. */
  dust: 0xd8c8a8,
  steam: 0xf4ecdd,
  smoke: 0xcfc6b8,
  /** The streaks behind a shot: flat mid tones that show on cream and on the lane. */
  trailDust: 0xb59b78,
  trailGrass: 0x8fd07c,
  trailCork: 0xe9b36a,
  trailCold: 0x8fd0ff,
  trailFire: 0xff8a2a,
  trailMoon: 0x9cc0ff,
  trailVoid: 0x8a5cf0,
  /** The colours of what is shed: embers, coins and bells, the moon's sparkle, a note. */
  warm: 0xffa24a,
  gold: 0xffd45a,
  moon: 0xdce9ff,
  note: 0xff6fae,
} as const;
