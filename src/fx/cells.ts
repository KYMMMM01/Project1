/**
 * The special board cells, one picture per kind (`art/cells_v1`, made in the game's own cartoon style: the sunlit patch of the living room,
 * the kitchen's food-bowl mat, the bathroom's fluffy mat, the garden's stump, the vet's treat blanket). A cell has to read at a glance on every
 * craft mat and chapter background, so on top of its picture it carries a soft halo of its own colour round the tile that breathes, a
 * slow pale glint across the tile, a larger emblem on the corner and a few flat sparkles (or bubbles, or hearts) rising off it. When the
 * cells arrive at the start of an act each tile drops in with a flash, a ring and its emblem popping on, one after the other.
 * Reduced motion keeps the same lit picture, still and a little brighter, with no arrival and no particles.
 */
import { Graphics, Sprite } from 'pixi.js';
import { tex } from '@/core/assets';
import { Ease } from '@/core/tween';
import { TAU, clamp01, mixColor } from '@/core/math';
import type { SpecialCellId } from '@/game/api';
import { Color, TapeColors } from '@/ui/theme';
import { Loop, type FxEnv, type FxRect, type ZoneHandle } from './loops';
import { Hue } from './palette';
import { fxSettings } from './settings';
import type { FxTexId } from './textures';

export interface CellLook {
  /** Image keys: the floor tile and its badge (the emblem on the corner and the sticker on a cat standing there). */
  tile: string;
  badge: string;
  /** The halo, the flash and the ring: a token of the paper world that stands out from the chapter's floor (violet on the blue bathroom, wood on the green garden), never white. */
  glow: number;
  /** What rises off the tile now and then, and whether it floats up (bubbles and hearts) or just twinkles in place. */
  spark: FxTexId;
  rises: boolean;
}

export const CELL_LOOKS: Readonly<Record<SpecialCellId, CellLook>> = {
  sun: { tile: 'cell_sun', badge: 'icon_cell_sun', glow: Color.mustard, spark: 'sparkle', rises: false },
  bowl: { tile: 'cell_bowl', badge: 'icon_cell_bowl', glow: Color.coral, spark: 'sparkle', rises: false },
  bubble: { tile: 'cell_bubble', badge: 'icon_cell_bubble', glow: Color.violet, spark: 'bubble', rises: true },
  stump: { tile: 'cell_stump', badge: 'icon_cell_stump', glow: Color.woodLight, spark: 'sparkle', rises: false },
  treat: { tile: 'cell_treat', badge: 'icon_cell_treat', glow: TapeColors.pink.base, spark: 'heart', rises: true },
};

/** The emblem's diameter on the corner of the tile, design px (a cat's sticker of the same picture is drawn smaller). */
export const EMBLEM = 46;
/** How far the halo reaches beyond the tile on each side, px. */
const HALO = 9;
/** How long one tile takes to land, and the pause between the arrivals of the cells of one act (the plus in the middle comes first). */
const LAND = 0.5;
export const CELL_ARRIVE_GAP = 0.09;
/** Seconds after a tile's own start when it touches down: the flourish round it (sparkles, ring, chime) belongs to this moment. */
export const CELL_TOUCHDOWN = 0.2;
/** Seconds a cell's own emblem waits after its tile has landed. */
const EMBLEM_AT = 0.18;
const BREATH = 1.7;

export interface CellOpts {
  /** Seconds to wait before this tile arrives (the cells of an act come one after the other). Omitted: no arrival, the cell is simply there. */
  delay?: number;
}

/** Halo of three nested rounded rectangles, the outermost the faintest. */
function drawHalo(g: Graphics, w: number, h: number, color: number): void {
  for (let i = 0; i < 3; i++) {
    const grow = HALO - i * 3.5;
    g.roundRect(-w / 2 - grow, -h / 2 - grow, w + 2 * grow, h + 2 * grow, 22 + grow).fill({ color, alpha: 0.2 + i * 0.1 });
  }
}

/** One special cell: its tile, halo, glint, emblem and sparkles; stop() lets it fade out. */
export function specialCell(env: FxEnv, rect: FxRect, id: SpecialCellId, o: CellOpts = {}): ZoneHandle {
  const look = CELL_LOOKS[id];
  const { w, h } = rect;
  const arrives = o.delay !== undefined && !fxSettings.reducedMotion;
  const delay = o.delay ?? 0;
  const loop = new Loop(env, rect.x + rect.w / 2, rect.y + rect.h / 2, { fadeIn: arrives ? 0.12 : 0.7, fadeOut: 0.5 });

  const halo = new Graphics();
  drawHalo(halo, w, h, look.glow);
  const ring = new Graphics();
  ring.roundRect(-w / 2, -h / 2, w, h, 22).stroke({ width: 5, color: mixColor(look.glow, Color.paperLight, 0.35) });
  const tile = new Sprite(tex(look.tile));
  tile.anchor.set(0.5);
  // The picture fills the rect whatever its own pixel size is (an image that has not loaded is 1 px: it is then just a stretched speck).
  const tileX = w / Math.max(1, tile.texture.width);
  const tileY = h / Math.max(1, tile.texture.height);
  // A pale paper sheet laid over the tile's own shape, brightening and dimming: the glint.
  const glint = new Graphics();
  glint.roundRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 18).fill(Hue.cream);
  const emblem = new Sprite(tex(look.badge));
  emblem.anchor.set(0.5);
  const emblemK = EMBLEM / Math.max(1, emblem.texture.width);
  const ex = -w / 2 + EMBLEM / 2 - 2;
  const ey = -h / 2 + EMBLEM / 2 - 2;
  emblem.position.set(ex, ey);
  loop.own(halo);
  loop.own(tile);
  loop.own(glint);
  loop.own(ring);
  loop.own(emblem);

  if (!fxSettings.reducedMotion) {
    loop.emit(
      look.rises
        ? {
            tex: look.spark, prio: 0, life: [1.1, 1.7], shape: { type: 'rect', w: w * 0.7, h: h * 0.3 }, speed: [8, 16], dir: -Math.PI / 2, spread: 0.3,
            size: [11, 15], sizeEnd: [7, 10], colors: [Hue.cream, mixColor(look.glow, Hue.cream, 0.5)], alpha: 0.9, fadeIn: 0.15, fadeOut: 0.5,
          }
        : {
            tex: look.spark, prio: 0, life: [0.9, 1.5], shape: { type: 'rect', w: w * 0.8, h: h * 0.8 }, speed: 0, size: [6, 9], sizeEnd: [16, 22],
            sizeEase: Ease.arc, spin: [-0.6, 0.6], rot: [0, TAU], colors: [Hue.cream, mixColor(look.glow, Hue.cream, 0.4)], fadeIn: 0.2, fadeOut: 0.35,
          },
      1.4,
      0,
      look.rises ? h * 0.18 : 0,
    );
  }

  const seed = (rect.x * 0.013 + rect.y * 0.029) % TAU;
  loop.step = (age) => {
    // Read per frame: the player may switch reduced motion on while the cell is lit.
    const calm = fxSettings.reducedMotion;
    const a = arrives ? age - delay : LAND + EMBLEM_AT;
    if (a < 0) {
      loop.container.alpha = 0;
      return;
    }
    const land = clamp01(a / LAND);
    const dropped = Ease.cubicOut(land);
    const breath = calm ? 0.5 : 0.5 + 0.5 * Math.sin((age / BREATH) * TAU + seed);
    // The tile drops in a little bigger and settles; a flash and a ring leave it as it lands.
    const settle = arrives ? 1 + 0.32 * (1 - dropped) : 1;
    tile.scale.set(tileX * settle, tileY * settle);
    glint.scale.set(settle);
    const flash = arrives ? Math.max(0, 1 - a / 0.45) : 0;
    glint.alpha = calm ? 0 : Math.min(0.85, 0.05 + 0.2 * breath * breath + 0.7 * flash);
    const halos = 0.5 + 0.5 * breath + 0.9 * (arrives ? Math.max(0, 1 - a / 0.9) : 0);
    halo.alpha = calm ? 0.95 : Math.min(1, 0.55 + 0.28 * halos);
    halo.scale.set(calm ? 1 : 1 + 0.025 * breath + 0.1 * (arrives ? Math.max(0, 1 - a / 0.7) : 0));
    ring.alpha = calm ? 0.6 : 0.35 + 0.35 * breath;
    const spread = arrives && land < 1 ? 1 + 0.5 * Ease.cubicOut(a / 0.6) : 1;
    ring.scale.set(arrives ? spread : 1);
    if (arrives && land < 1) ring.alpha *= 1 - land;
    const pop = arrives ? clamp01((a - EMBLEM_AT) / 0.3) : 1;
    emblem.scale.set(emblemK * (pop < 1 ? Ease.backOut(pop) : 1 + (calm ? 0 : 0.04 * Math.sin((age / BREATH) * TAU + seed))));
    emblem.rotation = calm ? 0 : 0.12 * Math.sin(age * 1.1 + seed);
    emblem.position.set(ex, ey);
  };
  return loop;
}
