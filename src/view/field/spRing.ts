/**
 * The skill ring round a cat's class sticker: the frame sheet it is cut from (painted once, the first time a cat with a skill stands on
 * the board; nothing is painted in a battle without skills) and the little view that wears it. Design: docs/design_skills_v1.md 2.3 and
 * 2.4, picture docs/design_skills_v1_ring.png.
 *
 * The sheet is ONE texture: 24 arcs (the bare track, then 1/24 to 23/24 of a turn clockwise from 12 o'clock), the closed ring of a full
 * gauge (gold, with a white line just inside it), the white ring of the flash, and the flat halo of a full ring. A ring is a sprite that swaps
 * its frame when the gauge crosses a step, a halo sprite and a flash sprite: nothing is ever drawn again per frame, and every ring of a board
 * is one batch. It tells its state without colour alone: an arc against a closed ring, a white hairline, a halo and (for the first
 * four) a swell; a stopped cat's ring is grey with two bars on it.
 */
import { CanvasSource, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { clamp01 } from '@/core/math';
import { Hue } from '@/fx/palette';
import { Color } from '@/ui/theme';
import { PULSE_SCALE, RING_FULL, RING_R, RING_RIM, RING_STEPS, RING_W, FLASH_GROW, type RingMarkId } from './spRingMath';

const TAU = Math.PI * 2;
/** The sheet is painted at this multiple of a design px. */
const RES = 3;
/** One cell of the sheet, design px: the halo (radius 25) is the widest thing in it. */
const CELL = 56;
const COLS = 7;
const ROWS = 5;
const FLASH_FRAME = RING_FULL + 1;
const GLOW_FRAME = RING_FULL + 2;
/** The closed ring of a gunner that is saving its shot (teal, no halo): a full gauge that is NOT ready. */
const HOLSTER_FRAME = RING_FULL + 3;
/**
 * The closed ring of a TRICKSTER (the bard, the alchemist, the lucky cat). Their class sticker is the mustard the gold ring is made of, so the ready ring
 * (gold, with darker gold edges) melted into the sticker it surrounds: only a white hairline set them apart (checked on the real screen, step-1 review E13).
 * This one has dark brown edges, like the ink of the rest of the art, so the ring is a clear line on the sticker inside it and on the paper outside; the other
 * three classes keep the gold ring they have.
 */
const TRICK_FRAME = RING_FULL + 4;

/** The grey a stopped cat's ring is tinted. */
const STOPPED_TINT = 0xb9b0a2;
/** The halo's opacity at rest and how much a pulse adds. */
const GLOW_BASE = 0.55;
const GLOW_SWING = 0.4;
/** How fast a ring's swell comes and goes when it starts or stops pulsing (1 / seconds). */
const AMP_RATE = 8;
const MARK_SIZE = 24;
/** Where a mark sits, from the ring's centre, and how big it is drawn (design px across). */
const MARK_AT = { x: -10, y: -17 } as const;
/** The small marks are 18 design px across; the holstered pistol is bigger (a chip of 9 px on a 360 px screen was not read as a pistol). */
const MARK_SHOWN = 18;
const MARK_SHOWN_BIG: Partial<Record<RingMarkId, number>> = { holstered: 28 };

export interface SpRingArt {
  /** Frames 0..24: the track and the arcs, then the closed ring. */
  frames: readonly Texture[];
  flash: Texture;
  glow: Texture;
  /** The teal closed ring a holstered gunner wears instead of the gold one. */
  holster: Texture;
  /** The closed ring of a trickster: gold between brown edges. */
  trick: Texture;
}

function css(color: number, alpha = 1): string {
  return `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha})`;
}

type Ctx = CanvasRenderingContext2D;

function ring(ctx: Ctx, cx: number, cy: number, r: number, width: number, color: string): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function disc(ctx: Ctx, cx: number, cy: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}

/** The arc and the track of a gauge `frac` full: a cream rim, a dark track, an orange arc over it. */
function paintArc(ctx: Ctx, cx: number, cy: number, frac: number): void {
  ring(ctx, cx, cy, RING_R, RING_W + 2 * RING_RIM, css(Color.paperLight));
  ring(ctx, cx, cy, RING_R, RING_W, css(Color.ink, 0.9));
  if (frac <= 0) return;
  ctx.beginPath();
  ctx.arc(cx, cy, RING_R, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
  ctx.lineWidth = RING_W - 0.6;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = css(Hue.ember);
  ctx.stroke();
}

/** The closed ring of a full gauge: gold with darker edges, a cream rim, and a white hairline just inside it. `trick`: the edges are the brown of the ink. */
function paintFull(ctx: Ctx, cx: number, cy: number, trick = false): void {
  ring(ctx, cx, cy, RING_R, RING_W + 2 * RING_RIM, css(Color.paperLight));
  ring(ctx, cx, cy, RING_R, RING_W, css(trick ? Color.ink : Color.mustardDark));
  ring(ctx, cx, cy, RING_R, RING_W - 1.8, css(Color.mustard));
  ring(ctx, cx, cy, RING_R - RING_W / 2 - 1.5, 1.1, css(0xffffff));
}

/** The closed ring of a full gauge that is being SAVED: teal where the ready ring is gold, with the same cream rim and white hairline, and no halo. */
function paintHolster(ctx: Ctx, cx: number, cy: number): void {
  ring(ctx, cx, cy, RING_R, RING_W + 2 * RING_RIM, css(Color.paperLight));
  ring(ctx, cx, cy, RING_R, RING_W, css(Color.tealDark));
  ring(ctx, cx, cy, RING_R, RING_W - 1.8, css(Color.teal));
  ring(ctx, cx, cy, RING_R - RING_W / 2 - 1.5, 1.1, css(0xffffff));
}

function paintFlash(ctx: Ctx, cx: number, cy: number): void {
  disc(ctx, cx, cy, RING_R, css(0xffffff, 0.55));
  ring(ctx, cx, cy, RING_R, RING_W + 3, css(0xffffff));
}

/** A flat halo of two steps (cut paper has no soft light). */
function paintGlow(ctx: Ctx, cx: number, cy: number): void {
  disc(ctx, cx, cy, 25, css(Color.mustard, 0.26));
  disc(ctx, cx, cy, 21, css(Hue.sun, 0.34));
}

let art: SpRingArt | null = null;

/** The frame sheet, painted on first use. */
export function spRingArt(): SpRingArt {
  if (art) return art;
  const canvas = document.createElement('canvas');
  canvas.width = COLS * CELL * RES;
  canvas.height = ROWS * CELL * RES;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('spRing: 2D canvas unavailable');
  ctx.scale(RES, RES);
  const at = (i: number): { x: number; y: number } => ({ x: (i % COLS) * CELL, y: Math.floor(i / COLS) * CELL });
  for (let i = 0; i <= TRICK_FRAME; i++) {
    const { x, y } = at(i);
    const cx = x + CELL / 2;
    const cy = y + CELL / 2;
    if (i < RING_STEPS) paintArc(ctx, cx, cy, i / RING_STEPS);
    else if (i === RING_FULL) paintFull(ctx, cx, cy);
    else if (i === FLASH_FRAME) paintFlash(ctx, cx, cy);
    else if (i === GLOW_FRAME) paintGlow(ctx, cx, cy);
    else if (i === HOLSTER_FRAME) paintHolster(ctx, cx, cy);
    else paintFull(ctx, cx, cy, true);
  }
  const source = new CanvasSource({ resource: canvas, resolution: RES, autoGarbageCollect: false });
  const cut = (i: number, label: string): Texture => {
    const { x, y } = at(i);
    return new Texture({ source, frame: new Rectangle(x, y, CELL, CELL), label });
  };
  const frames: Texture[] = [];
  for (let i = 0; i <= RING_FULL; i++) frames.push(cut(i, `sp_ring_${i}`));
  art = { frames, flash: cut(FLASH_FRAME, 'sp_ring_flash'), glow: cut(GLOW_FRAME, 'sp_ring_glow'), holster: cut(HOLSTER_FRAME, 'sp_ring_holster'), trick: cut(TRICK_FRAME, 'sp_ring_trick') };
  return art;
}

// ── marks ──

/** The drawing of each mark: a 24 px sticker, a cream border and a flat face with a glyph, centred in the context (already scaled). */
type MarkDraw = (ctx: Ctx, cx: number, cy: number) => void;

function sticker(ctx: Ctx, cx: number, cy: number, face: number): void {
  disc(ctx, cx + 0.6, cy + 1.4, 11, css(Color.shadow, 0.3));
  disc(ctx, cx, cy, 11, css(Color.paperLight));
  disc(ctx, cx, cy, 9.6, css(face));
}

export const MARK_DRAW: Readonly<Record<RingMarkId, MarkDraw>> = {
  /** Two bars: paused. */
  stopped(ctx, cx, cy) {
    sticker(ctx, cx, cy, Color.inkSoft);
    ctx.fillStyle = css(Color.paperLight);
    ctx.fillRect(cx - 4.2, cy - 4.4, 3, 8.8);
    ctx.fillRect(cx + 1.2, cy - 4.4, 3, 8.8);
  },
  /**
   * A pistol put back in its holster: the gunner has a full gauge and keeps the shot for the elite or boss that is coming. A teal face (no
   * other mark has one) with a bold cream pistol and a leather pouch over its grip: at nine or ten px on a phone only the colour and the
   * one big L-shaped silhouette are left, so the strokes are thick and nothing else is drawn.
   */
  holstered(ctx, cx, cy) {
    sticker(ctx, cx, cy, Color.teal);
    ctx.beginPath();
    const gun: ReadonlyArray<readonly [number, number]> = [
      [-8.4, -6.4], [3.4, -6.4], [6.2, -4.2], [6.2, 0.8], [2.8, 0.8], [2.8, 5.6], [-1.8, 5.6], [-1.8, -0.2], [-8.4, -0.2],
    ];
    gun.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(cx + x, cy + y) : ctx.lineTo(cx + x, cy + y)));
    ctx.closePath();
    ctx.fillStyle = css(Color.paperLight);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = css(Color.ink);
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(cx - 3.8, cy + 0.2, 10.2, 8, 2);
    ctx.fillStyle = css(Color.woodDark);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.stroke();
  },
  /** A four-point star: ready (a full ring under reduced motion, where nothing pulses). */
  ready(ctx, cx, cy) {
    sticker(ctx, cx, cy, Color.mustard);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      const r = i % 2 === 0 ? 7 : 2.4;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = css(Color.paperLight);
    ctx.fill();
  },
};

const markTextures = new Map<RingMarkId, Texture>();

/** The texture of a mark, painted the first time it is worn. */
export function markTexture(id: RingMarkId): Texture {
  let t = markTextures.get(id);
  if (t) return t;
  const canvas = document.createElement('canvas');
  canvas.width = MARK_SIZE * RES;
  canvas.height = MARK_SIZE * RES;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('spRing: 2D canvas unavailable');
  ctx.scale(RES, RES);
  MARK_DRAW[id](ctx, MARK_SIZE / 2, MARK_SIZE / 2);
  t = new Texture({ source: new CanvasSource({ resource: canvas, resolution: RES, autoGarbageCollect: false }), label: `sp_mark_${id}` });
  markTextures.set(id, t);
  return t;
}

// ── the view ──

/** Everything a ring needs to be drawn this frame; `SpRings` works it out from the unit and the battle clock. */
export interface RingLook {
  /** `ringFrame(gauge)`. */
  frame: number;
  /** The cat stands on a hazard cell: its gauge is standing still. */
  blocked: boolean;
  /** This full ring is among the ones allowed to pulse. */
  pulsing: boolean;
  /** `pulseWave` of the pulse clock, 0..1. */
  wave: number;
  /** Progress 0..1 of the flash after a cast, or -1. */
  flash: number;
  mark: RingMarkId | null;
  /** Reduced motion: no swell, no growing flash. */
  calm: boolean;
  /** Low quality tier: no halo, no swell, a flash that only blinks. */
  low: boolean;
  /** The cat is a trickster: its closed ring has brown edges (`TRICK_FRAME`). Absent = false. */
  trick?: boolean;
}

/**
 * The ring of one cat: a container at the sticker's place holding the ring, its halo, its flash and its mark. It reads the sticker's pop
 * (scale and opacity) so it arrives with it, and it lives inside the cat's own view, so a drag, a hop, a merge, a sale or a hide carries it along.
 */
export class SpRingView {
  readonly root = new Container();
  private readonly glow: Sprite;
  private readonly body: Sprite;
  private readonly flash: Sprite;
  private readonly mark: Sprite;
  private sticker: Sprite | null = null;
  private frame = -1;
  private markId: RingMarkId | null = null;
  private amp = 0;
  private tinted = false;

  constructor(private readonly sheet: SpRingArt) {
    this.root.label = 'sp-ring';
    this.root.eventMode = 'none';
    const make = (texture: Texture): Sprite => {
      const s = new Sprite(texture);
      s.anchor.set(0.5);
      s.eventMode = 'none';
      return s;
    };
    this.glow = make(sheet.glow);
    this.body = make(sheet.frames[0] as Texture);
    this.flash = make(sheet.flash);
    this.mark = make(Texture.EMPTY);
    this.glow.visible = false;
    this.flash.visible = false;
    this.mark.visible = false;
    this.mark.position.set(MARK_AT.x, MARK_AT.y);
    this.mark.scale.set(MARK_SHOWN / MARK_SIZE);
    this.root.addChild(this.glow, this.body, this.flash, this.mark);
  }

  /** Follow this sticker's pop-in (scale and opacity). */
  bind(sticker: Sprite): void {
    this.sticker = sticker;
  }

  /** Forget the last picture so the next `draw` sets everything (the view has been given to another cat). */
  reset(): void {
    this.frame = -1;
    this.markId = null;
    this.amp = 0;
    this.flash.visible = false;
    this.glow.visible = false;
    this.mark.visible = false;
    this.body.scale.set(1);
  }

  draw(look: RingLook, dt: number): void {
    const stick = this.sticker;
    const pop = stick ? stick.scale.x : 1;
    const alpha = stick ? clamp01(stick.alpha) : 1;
    if (this.root.alpha !== alpha) this.root.alpha = alpha;
    const full = look.frame === RING_FULL;
    // A full gauge that is being saved wears the teal closed ring: no halo, no swell, so it cannot be read as "ready".
    const holster = full && look.mark === 'holstered';

    const trick = full && look.trick === true;
    const shown = holster ? HOLSTER_FRAME : trick ? TRICK_FRAME : look.frame;
    if (shown !== this.frame) {
      this.frame = shown;
      this.body.texture = holster ? this.sheet.holster : trick ? this.sheet.trick : (this.sheet.frames[look.frame] as Texture);
    }
    if (look.blocked !== this.tinted) {
      this.tinted = look.blocked;
      this.body.tint = look.blocked ? STOPPED_TINT : 0xffffff;
      this.glow.tint = look.blocked ? STOPPED_TINT : 0xffffff;
    }

    // The swell eases in and out, so a ring that starts or stops pulsing does not jump.
    const want = full && !holster && look.pulsing && !look.blocked && !look.calm && !look.low ? 1 : 0;
    this.amp = want > this.amp ? Math.min(want, this.amp + dt * AMP_RATE) : Math.max(want, this.amp - dt * AMP_RATE);
    const swell = 1 + PULSE_SCALE * this.amp * look.wave;
    const size = pop * swell;
    if (this.body.scale.x !== size) this.body.scale.set(size);

    const halo = full && !holster && !look.low;
    if (this.glow.visible !== halo) this.glow.visible = halo;
    if (halo) {
      this.glow.alpha = GLOW_BASE + GLOW_SWING * this.amp * look.wave;
      if (this.glow.scale.x !== size) this.glow.scale.set(size);
    }

    const f = look.flash;
    const flashing = f >= 0 && (!look.low || f < 0.5);
    if (this.flash.visible !== flashing) this.flash.visible = flashing;
    if (flashing) {
      const grow = look.calm || look.low ? 1 : 0.9 + (FLASH_GROW - 0.9) * (1 - (1 - f) * (1 - f));
      this.flash.scale.set(pop * grow);
      this.flash.alpha = look.low ? 1 : (1 - f) * (1 - f) * 0.95;
    }

    if (look.mark !== this.markId) {
      this.markId = look.mark;
      this.mark.visible = look.mark !== null;
      if (look.mark) {
        this.mark.texture = markTexture(look.mark);
        this.mark.scale.set((MARK_SHOWN_BIG[look.mark] ?? MARK_SHOWN) / MARK_SIZE);
      }
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
