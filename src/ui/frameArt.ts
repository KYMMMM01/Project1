import { Container, Graphics } from 'pixi.js';
import { mixColor } from '@/core/math';
import { CARD_WOBBLE, starBox, tapeBox, type CardGeometry } from './cardMath';
import { drawIcon } from './icons';
import { drawDashRuns, drawPaper, tapeStrip } from './paper';
import { rarityIndex, Color, Rarity, RARITY_GOLD, type RarityId } from './theme';

/**
 * The paper part of a layered photo frame (CardFrame, the cats line's plate): the cream sheet, the rarity mat, the window, and the
 * ornaments that join with the tier on those layers (rare: dashed line, epic: photo corners). All of it is cut from `geo`, the one
 * outline the sheet is cut along, so every layer keeps its inset on all four sides.
 */
export function drawFrameLayers(g: Graphics, geo: CardGeometry, rarity: RarityId, shadow: number): void {
  const { spec } = geo;
  const rar = Rarity[rarity];
  const idx = rarityIndex(rarity);
  const gold = idx === 4;
  drawPaper(g, -spec.w / 2, -spec.h / 2, { w: spec.w, h: spec.h, radius: spec.radius, fill: Color.paperLight, edge: Color.kraftDark, shadow, grain: false, seed: geo.seed, wobble: CARD_WOBBLE });
  g.poly(geo.mat).fill(rar.color);
  g.poly(geo.mat).stroke({ width: 2, color: rar.dark, alpha: 0.5, alignment: 0, join: 'round' });
  g.poly(geo.window).fill(mixColor(rar.light, Color.paper, 0.62));
  g.poly(geo.window).stroke({ width: 2, color: rar.dark, alpha: 0.5, alignment: 0, join: 'round' });
  if (idx >= 1) drawDashRuns(g, geo.dashRuns, { color: gold ? RARITY_GOLD : rar.dark, width: spec.dashWidth, alpha: 0.8 });
  if (idx >= 2) geo.caps.forEach((cap, i) => { if (spec.topCaps || i >= 2) g.poly(cap).fill(gold ? RARITY_GOLD : rar.dark); });
}

/** The strip of tape across the top edge (legendary and up) and the star sticker stuck on it (mythic): they sit above the picture. */
export function frameOrnaments(geo: CardGeometry, rarity: RarityId): Container {
  const { spec } = geo;
  const idx = rarityIndex(rarity);
  const over = new Container();
  if (idx >= 3) {
    const t = tapeBox(spec);
    const tape = tapeStrip({ name: idx === 3 ? 'yellow' : 'pink', w: t.w, h: t.h, angle: -3, pattern: idx === 3 ? 'dots' : 'gingham', seed: geo.seed });
    tape.position.set(t.x + t.w / 2, t.y + t.h / 2);
    over.addChild(tape);
  }
  if (idx >= 4) {
    const s = starBox(spec);
    const star = drawIcon('star', s.w, RARITY_GOLD);
    star.position.set(s.x + s.w / 2, s.y + s.h / 2);
    star.rotation = -0.1;
    over.addChild(star);
  }
  return over;
}
