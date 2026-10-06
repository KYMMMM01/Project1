/**
 * The compact paper photo frame the cats line and the chest reveal share: a cream border, a mat in the rarity colour,
 * a window for the picture and the ornaments that pile up with the tier (dashed line, corner mounts, tape, gold
 * star), so a rarity can be told without colour. Geometry is baked once per plate.
 */
import { Container, Graphics } from 'pixi.js';
import { mixColor } from '@/core/math';
import { cacheStatic, Color, drawDashedRect, drawIcon, drawPaper, drawPaperFace, paperSeed, Rarity, RARITY_GOLD, tapeStrip, type RarityId } from '@/ui';

export interface PlateOpts {
  /** Outer size; origin = centre. */
  w: number;
  h: number;
  /** Height of the mat (the rarity-coloured part); the rest below it is cream. */
  matH: number;
  rarity: RarityId;
  /** 0 common ... 4 mythic. */
  tier: number;
  seed?: number;
}

export interface Plate {
  /** The paper: border, mat, window, dashed line and corner mounts. Cached. */
  base: Graphics;
  /** Tape and star, to sit above the picture. */
  over: Container;
  /** The picture window, relative to the plate's centre. */
  win: { x: number; y: number; w: number; h: number };
}

export function buildPlate(o: PlateOpts): Plate {
  const { w, h, matH, tier } = o;
  const rar = Rarity[o.rarity];
  const seed = o.seed ?? paperSeed();
  const win = { x: -w / 2 + 11, y: -h / 2 + 11, w: w - 22, h: matH - 10 };
  const g = new Graphics();
  drawPaper(g, -w / 2, -h / 2, { w, h, radius: 18, fill: Color.paperLight, edge: Color.kraftDark, shadow: 5, grain: false, seed });
  drawPaperFace(g, -w / 2 + 6, -h / 2 + 6, { w: w - 12, h: matH, radius: 13, fill: rar.color, edge: rar.dark, grain: false, seed: seed + 1, wobble: 0.7 });
  drawPaperFace(g, win.x, win.y, { ...win, radius: 9, fill: mixColor(rar.light, Color.paper, 0.62), edge: rar.dark, grain: false, seed: seed + 2, wobble: 0.6 });
  if (tier >= 1) drawDashedRect(g, -w / 2 + 3.5, -h / 2 + 3.5, w - 7, h - 7, { radius: 15, color: tier === 4 ? RARITY_GOLD : rar.dark, width: 2, dash: 8, gap: 6, alpha: 0.8, seed: seed + 3 });
  if (tier >= 2) {
    const c = 13;
    const mount = tier === 4 ? RARITY_GOLD : rar.dark;
    for (const sx of [-1, 1] as const) {
      for (const [cy, sy] of [[-h / 2 + 6, -1], [-h / 2 + 6 + matH, 1]] as const) {
        const cx = sx * (w / 2 - 6);
        g.poly([cx, cy, cx - sx * c, cy, cx, cy - sy * c]).fill(mount);
      }
    }
  }
  cacheStatic(g);

  const over = new Container();
  if (tier >= 3) {
    const tape = tapeStrip({ name: tier === 3 ? 'yellow' : 'pink', w: w * 0.42, h: w * 0.13, angle: -3, pattern: tier === 3 ? 'dots' : 'gingham', seed });
    tape.position.set(0, -h / 2 + 2);
    over.addChild(tape);
  }
  if (tier >= 4) {
    const star = drawIcon('star', w * 0.26, RARITY_GOLD);
    star.position.set(-w / 2 + w * 0.1, -h / 2 + w * 0.08);
    star.rotation = -0.2;
    over.addChild(star);
  }
  return { base: g, over, win };
}
