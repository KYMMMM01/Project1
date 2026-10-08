/**
 * The colours of the painted battle effects. Cats, enemies and the interface are cut paper and wear the kit's tokens (`palette.ts`);
 * a battle effect is light and paint, so its colours are named here, in one place, instead of being scattered through the effects.
 * Friendly effects are cool or magical (ice, lime, violet and ember); hostile ones are hot and hard (orange, crimson, steel).
 */
export const Light = {
  /** Blizzard: pale ice, and its bright rim. */
  ice: 0xbfe6ff,
  iceRim: 0xe6f7ff,
  /** The mid blue the blizzard's edge is painted in, so it shows on a pale floor too. */
  iceEdge: 0x7ec8ff,
  /** Potion cloud. */
  lime: 0xa6f45c,
  /** Black hole: the ember at its core, the violet rim, the dark under it, and the scraps that fall in. */
  voidEmber: 0xff8a3d,
  voidRim: 0xb69cff,
  voidShade: 0x14081f,
  voidScraps: [0xffd9a0, 0xff7ac8, 0xa987ff, 0xfff2d6] as readonly number[],
  /** Hostile haste ring: heat, and its comets. */
  hot: 0xff8a2a,
  hotShade: 0xff5a1f,
  hotComet: 0xffd05a,
  /** Hostile heal ring: crimson, and its crosses. */
  blood: 0xff3a52,
  bloodShade: 0xd0102c,
  bloodCross: 0xffd3da,
  /** Lightning: the flash at a node, and the star in it. */
  boltFlash: 0xcfe4ff,
  boltStar: 0x9cc4ff,
  /** An enemy's shield: steel glass, its bright rim, and the white of a hit on it. */
  shield: 0xa8c4ec,
  shieldRim: 0xeaf4ff,
  shieldHit: 0xffffff,
  /** What a shot sheds: dust, white snow, steam and gunsmoke, of what a shot sheds. */
  dust: 0xd8c8a8,
  iceWhite: 0xeaf6ff,
  steam: 0xf4ecdd,
  smoke: 0xcfc6b8,
  /** The streaks behind a shot are painted, not light (light added to the cream of the board vanishes): mid tones that show on cream and on the lane. */
  trailDust: 0xb59b78,
  trailGrass: 0x8fd07c,
  trailCork: 0xe9b36a,
  trailCold: 0x8fd0ff,
  trailFire: 0xff8a2a,
  trailMoon: 0x7fb0ff,
  trailVoid: 0x8a5cf0,
  /** The silver of the moon arrow, deepened so it reads on cream. */
  moonBody: 0x9cc0ff,
  /** The cold lights of a snowball and a frost shard, the warm of a fireball and a coin, the soft violet of the void orb. */
  cold: 0xbfe6ff,
  warm: 0xffa24a,
  gold: 0xffd45a,
  moon: 0xb8d8ff,
  voidOrb: 0xa070ff,
  note: 0xff5aa8,
  brew: 0x8cff4a,
} as const;
