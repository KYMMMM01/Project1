/**
 * Meteor Drop, the cosmo cat's scene (docs/design_skills_v2.md 3.9). The simulation says where the meteor will land and when (`impactX / impactY`,
 * `at + warn`), deals nothing for the second in between, then lands the inner ring, 0.25 s later the outer one, and burns a crater for `craterLife`.
 * Everything here is drawn from those events and numbers:
 *
 *   1. THE WARNING (the cast, `warn` = 1 s). The screen dims gently (a warm dusk, never a flash) and a RED CIRCLE grows on the spot: a flat translucent
 *      disc at the inner radius inside a dashed rim that turns, with a faint thin ring at the outer radius for the wide, weaker blow. It is drawn at once
 *      and grows by the battle's clock, so at 3x it simply grows three times as fast. In its last moments the meteor itself comes down out of the sky
 *      (the owner's painted rock with its flame tail, `fx_meteor_rock`, turned along its fall and growing as it nears) and a shadow grows under it on the ground; it reaches the
 *      circle exactly at the landing event, at any game speed (the fall takes at least a fifth of a real second where the warning allows).
 *   2. THE LANDING (`meteorLand` `inner`). A cream flash disc and the painted flash (`fx_meteor_flash`), the painted blast ring (`fx_meteor_ring`) that spreads over the inner radius, sparks,
 *      chips of dark paper and a pillar of smoke, ember sparks on every enemy the ring touches, a nudge of the camera, one screen flash through the
 *      existing guard and the boom; the dusk lifts. The crater begins in the same breath.
 *   3. THE SHOCK (`meteorLand` `outer`, 0.25 s later). The blast ring sweeps out again to the outer radius with a ring of dust at its edge.
 *   4. THE CRATER (`craterEnd` ends it). The painted scorch (`mark_scorch`, existing art) pops onto the road, an ember glow breathes under it every 0.5 s,
 *      the burn's own tick, and sparks and a wisp of smoke rise on each beat; in its last 0.6 s the glow dims; at `craterEnd` the scorch fades away.
 *
 * Everything is paired by `meteorId`: two cosmo cats' meteors can be alive together, and with the laser both fall on the same dot. A cast that lost
 * the stage rule never reaches the scene, so the events of a meteor that was not shown are ignored; a meteor that WAS shown but was cleared by a
 * defeat still lands after a revive (drawn from the event's own numbers). Every picture is timed by the battle's clock with a floor in real time
 * (`span.ts`); the warning's growth and the fall are pure functions of it, so they are where the simulation is at 1x, 2x and 3x and stand still under
 * a popup. Reduced motion: no dusk, no falling meteor, no camera nudge, no screen flash; the circle is simply there and fills in, the rings fade in
 * place, the crater is still. Low tier: no chips and no smoke, fewer sparks, no crater sparks. Nothing here moves an enemy or a cat.
 */
import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';
import { tex } from '@/core/assets';
import { TAU, clamp01, lerp, lighten } from '@/core/math';
import { Ease, type Tween } from '@/core/tween';
import { Trauma, fxTex, paint, screenFx, type EmitDef } from '@/fx';
import { Hue } from '@/fx/palette';
import type { BattleEvents, StrikePoint } from '@/game';
import { FIELD_H, FIELD_W } from '@/game/geometry';
import { Color } from '@/ui/theme';
import { CLASS_COLOR } from '../palette';
import { Gate } from '../stage';
import { Piece, Pieces } from './runPieces';
import { Age } from './span';
import { NIGHT_LABEL, type SpCastOf, type SpEnv, type SpScene, type SpSceneFactory } from './types';

type Span = readonly [number, number];

/** The label of the dusk sheet (the first child of the front layer while the scene exists). */
export const DUSK_LABEL = 'sp-dusk';
/** The dusk: a warm dark paper over the field at most this opaque (under the flash guide's 0.45; the star archer's night is 0.35, and where they overlap the two add to no more than 0.42). */
export const DUSK_COLOR = Color.inkDeep;
export const DUSK_ALPHA = 0.3;
const DUSK_IN: Span = [0.25, 0.15];
const DUSK_OUT: Span = [0.5, 0.3];
/** When the scene is cut off the dusk lifts over this many REAL seconds. */
const DUSK_CUT = 0.3;
/** Where the meteor comes from: it travels along this angle (radians; down and a little to the right) from `FALL_DIST` px away. */
export const FALL_ANGLE = 1.25;
export const FALL_DIST = 460;
/** The fall takes this many battle seconds at 1x and at least this many REAL seconds at any speed (never more than the warning). */
export const FALL_BATTLE = 0.36;
export const FALL_REAL = 0.22;
/** The rock is this many px across at the landing. */
const BALL = 120;
/** The pictures: the rock (head to the right, flame tail to the left, so it is turned by the fall's angle), the landing flash and the blast ring. */
export const ROCK_KEY = 'fx_meteor_rock';
export const FLASH_KEY = 'fx_meteor_flash';
export const RING_KEY = 'fx_meteor_ring';
/** Where the rock's middle is in its file (shares of the width and of the height) and how many px of the file it is across. */
const ROCK_AT = { x: 0.695, y: 0.655 } as const;
const ROCK_PX = 150;
/**
 * Where the blast ring's outer edge is in its file: the puffs reach this share of the file's width from the centre. The sprite is laid so that this edge is
 * on the ring's radius (the damage's edge), so the ring's puffs spread INSIDE the circle that was warned and the picture does not swell past it.
 */
const RING_EDGE = 0.45;
/** The most opaque a ring is: the inner blow's, and the outer one's (the wide, weaker blow is quieter, so that a ring 400 px across does not bury the board). */
const RING_ALPHA_INNER = 0.95;
const RING_ALPHA_OUTER = 0.6;
/** [battle seconds, real floor] of each picture. */
const LAND: Span = [0.34, 0.22];
const WAVE_INNER: Span = [0.4, 0.26];
const WAVE_OUTER: Span = [0.5, 0.32];
const SCORCH_IN: Span = [0.2, 0.12];
const SCORCH_OUT: Span = [0.5, 0.3];
/** The crater's glow beats on the burn's own 0.5 s and dims in its last 0.6 s. */
export const PULSE_EVERY = 0.5;
const GLOW_DIM = 0.6;
/** A crater whose end never came is retired this many battle seconds after it should have ended. */
const CRATER_GRACE = 1;
const WARNS = 3;
const LANDINGS = 3;
const WAVES = 6;
const CRATERS = 4;
/** Ember sparks on the enemies a ring touches, by quality tier. */
const POINTS_MAX = [4, 8, 12] as const;

const LAND_SPARKS: EmitDef = {
  tex: 'spark', prio: 1, count: 14, life: [0.3, 0.6], shape: { type: 'circle', r: 14 }, speed: [160, 420], drag: 2.6, gravity: 220, alignVel: true, stretch: 0.002,
  size: [18, 30], sizeEnd: [4, 8], colors: [Hue.cream, Hue.sun, Hue.fire], fadeIn: 0, fadeOut: 0.5,
};
const LAND_CHIPS: EmitDef = {
  tex: 'shard', prio: 1, count: 8, life: [0.5, 0.9], shape: { type: 'circle', r: 10 }, speed: [120, 300], drag: 1.2, gravity: 520, spin: [-8, 8], rot: [0, TAU],
  size: [14, 22], sizeEnd: [10, 16], colors: [Hue.smokeDark, Color.kraftDark], fadeIn: 0, fadeOut: 0.35,
};
const LAND_SMOKE: EmitDef = {
  tex: 'smoke', prio: 1, count: 6, life: [0.7, 1.2], shape: { type: 'circle', r: 40 }, speed: [20, 70], dir: -Math.PI / 2, spread: 1.3, drag: 2, gravity: -30,
  size: [50, 70], sizeEnd: [110, 150], rot: [0, TAU], spin: [-1, 1], colors: [Hue.smoke, Hue.smokeDark], alpha: 0.55, fadeIn: 0.1, fadeOut: 0.6,
};
/** A ring of dust at the outer ring's edge (built at radius 200; the burst's `scale` sets the real one). */
const OUTER_DUST: EmitDef = {
  tex: 'smoke', prio: 0, count: 12, life: [0.4, 0.7], shape: { type: 'ring', r: 200, width: 14 }, speed: [30, 90], dir: 'out', drag: 3, size: [22, 32], sizeEnd: [46, 70],
  rot: [0, TAU], spin: [-1.2, 1.2], colors: [lighten(Hue.dust, 0.2), Hue.dust], alpha: 0.5, fadeIn: 0.08, fadeOut: 0.6,
};
const HIT_EMBERS: EmitDef = {
  tex: 'spark', prio: 0, count: 3, life: [0.25, 0.45], shape: { type: 'circle', r: 8 }, speed: [60, 170], drag: 3, gravity: 140, alignVel: true, stretch: 0.002,
  size: [12, 20], sizeEnd: [3, 5], colors: [Hue.sun, Hue.fire], fadeIn: 0, fadeOut: 0.5,
};
const CRATER_EMBERS: EmitDef = {
  tex: 'spark', prio: 0, count: 3, life: [0.5, 0.9], shape: { type: 'circle', r: 55 }, speed: [20, 60], dir: -Math.PI / 2, spread: 0.6, drag: 1.5, gravity: -40,
  size: [10, 16], sizeEnd: [2, 4], colors: [Hue.sun, Hue.fire], fadeIn: 0, fadeOut: 0.6,
};
const CRATER_WISP: EmitDef = {
  tex: 'smoke', prio: 0, count: 1, life: [0.8, 1.2], shape: { type: 'circle', r: 45 }, speed: [10, 30], dir: -Math.PI / 2, spread: 0.5, drag: 1, gravity: -30,
  size: [24, 34], sizeEnd: [50, 70], rot: [0, TAU], colors: [Hue.smoke], alpha: 0.35, fadeIn: 0.15, fadeOut: 0.6,
};
const CAST_GLINT: EmitDef = {
  tex: 'sparkle', prio: 1, count: 5, life: [0.3, 0.5], shape: { type: 'circle', r: 14 }, speed: [40, 110], dir: -Math.PI / 2, spread: 1.2, drag: 2.4, size: [12, 20],
  sizeEnd: [3, 5], rot: [0, TAU], spin: [-3, 3], colors: [Hue.cream, Hue.ice], alpha: 0.95, fadeIn: 0.05, fadeOut: 0.6,
};

const RING_RES = 3;
const RING_SIZE = 256;
/** The stroke's middle sits this far (design px) from the dashed ring texture's centre. */
const RING_R = 116;
let rimTexture: Texture | null = null;

/** The warning's rim, painted in code the first time a meteor is cast: 24 dashes in the alarm red on a cream underlay (no image file). */
export function rimArt(): Texture {
  if (rimTexture) return rimTexture;
  const canvas = document.createElement('canvas');
  canvas.width = RING_SIZE * RING_RES;
  canvas.height = RING_SIZE * RING_RES;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('meteor: 2D canvas unavailable');
  ctx.scale(RING_RES, RING_RES);
  const css = (c: number): string => `rgb(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255})`;
  const dashes = 24;
  const arc = (TAU * RING_R) / dashes;
  ctx.lineCap = 'round';
  ctx.setLineDash([arc * 0.55, arc * 0.45]);
  for (const [color, width] of [[Color.paperLight, 15], [Hue.alarm, 9]] as const) {
    ctx.strokeStyle = css(color);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(RING_SIZE / 2, RING_SIZE / 2, RING_R, 0, TAU);
    ctx.stroke();
  }
  rimTexture = new Texture({ source: new CanvasSource({ resource: canvas, resolution: RING_RES, autoGarbageCollect: false }), label: 'sp_meteor_rim' });
  return rimTexture;
}

/** Forget the baked rim (tests). */
export function resetRim(): void {
  rimTexture = null;
}

/** A centred sprite of a painted picture. */
function painted(parent: Container, key: string): Sprite {
  const s = new Sprite(tex(key));
  s.anchor.set(0.5);
  s.eventMode = 'none';
  s.visible = false;
  parent.addChild(s);
  return s;
}

/** A centred sprite of an atlas shape. */
function atlas(parent: Container, id: Parameters<typeof fxTex>[0], tint: number): Sprite {
  const s = new Sprite(fxTex(id).texture);
  s.anchor.set(0.5);
  s.tint = tint;
  s.eventMode = 'none';
  s.visible = false;
  parent.addChild(s);
  return s;
}

/** Scale a centred sprite to `diameter` design px across. */
function across(s: Sprite, diameter: number): void {
  s.scale.set(diameter / Math.max(1, s.texture.width));
}

/** The dusk: one sheet of warm dark paper over the field. Its level moves toward 0 or 1 by the battle's clock with a floor in real time. */
export class Dusk {
  readonly sprite = new Sprite(Texture.WHITE);
  /** 0..1. */
  level = 0;
  /** The star archer's night sheet, found once (it is the first child of the same layer while the lap's scene exists). */
  private night: Sprite | null = null;

  constructor(private readonly parent: Container) {
    this.sprite.label = DUSK_LABEL;
    this.sprite.tint = DUSK_COLOR;
    // Wider than the field and far taller: the shaken field never shows an edge, and a tall screen's floor above and below darkens with it.
    this.sprite.position.set(-120, -760);
    this.sprite.width = FIELD_W + 240;
    this.sprite.height = FIELD_H + 1520;
    this.sprite.eventMode = 'none';
    this.sprite.visible = false;
    parent.addChildAt(this.sprite, 0);
  }

  /** `want`: a meteor is warning. `cut`: the scene was cleared, so the dusk lifts by real time alone. */
  update(want: boolean, dt: number, battleDt: number, calm: boolean, cut: boolean): void {
    const up = want && !calm && !cut;
    const [life, floor] = up ? DUSK_IN : DUSK_OUT;
    const rate = cut || calm ? dt / DUSK_CUT : Math.min(battleDt / life, dt / floor);
    this.level = up ? Math.min(1, this.level + rate) : Math.max(0, this.level - rate);
    this.sprite.visible = this.level > 0.001;
    let alpha = DUSK_ALPHA * Ease.sineInOut(this.level);
    if (alpha > 0) {
      // Under the star archer's night the two must not stack past the flash guide: this one gives way by most of what the night already is.
      if (!this.night || this.night.destroyed) this.night = (this.parent.getChildByLabel(NIGHT_LABEL) as Sprite | null) ?? null;
      if (this.night && this.night.visible) alpha = Math.max(0, alpha - this.night.alpha * 0.6);
    }
    this.sprite.alpha = alpha;
  }

  reset(): void {
    this.level = 0;
    this.sprite.visible = false;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}

/** What the scene keeps of a meteor from the cast until its crater is gone (so a landing can be drawn even when the warning was cleared). */
interface Known {
  x: number;
  y: number;
  inner: number;
  outer: number;
  crater: number;
  life: number;
  at: number;
  warn: number;
}

/** The warning of one meteor: the circle, its rim, the thin outer ring, the shadow, and the falling rock. */
class Warn {
  on = false;
  id = 0;
  x = 0;
  y = 0;
  inner = 90;
  outer = 200;
  at = 0;
  warn = 1;
  /** 0..1 how far the warning has got, and 0..1 how far the fall (QA and tests). */
  k = 0;
  p = 0;
  /** Where the rock is drawn (QA and tests). */
  headX = 0;
  headY = 0;
  whistle: Tween | null = null;
  readonly circle = new Container();
  readonly head = new Container();
  private readonly shadow: Sprite;
  private readonly fill: Sprite;
  private readonly reach: Sprite;
  private readonly rim: Sprite;
  private readonly rock: Sprite;

  constructor(circles: Container, heads: Container) {
    this.shadow = atlas(this.circle, 'disc', Color.shadow);
    this.fill = atlas(this.circle, 'disc', Hue.alarm);
    this.reach = atlas(this.circle, 'ring', Hue.alarm);
    this.rim = new Sprite(rimArt());
    this.rim.anchor.set(0.5);
    this.rim.eventMode = 'none';
    this.circle.addChild(this.rim);
    this.circle.eventMode = 'none';
    this.circle.visible = false;
    circles.addChild(this.circle);
    this.rock = new Sprite(tex(ROCK_KEY));
    // The rock's picture has the rock at its right end and the flames behind it, pointing along +x.
    this.rock.anchor.set(ROCK_AT.x, ROCK_AT.y);
    this.rock.eventMode = 'none';
    this.head.addChild(this.rock);
    this.head.eventMode = 'none';
    this.head.visible = false;
    heads.addChild(this.head);
  }

  begin(id: number, k: Known, at: number): void {
    this.on = true;
    this.id = id;
    this.x = k.x;
    this.y = k.y;
    this.inner = k.inner;
    this.outer = k.outer;
    this.at = at;
    this.warn = Math.max(0.05, k.warn);
    this.k = 0;
    this.p = 0;
    this.circle.visible = true;
    this.circle.position.set(this.x, this.y);
    this.head.visible = false;
    this.whistle = null;
  }

  /** The circle at warning progress `k`: a disc that grows inside a turning dashed rim; the thin outer ring follows. `calm`: the full size at once, and it fills in. */
  drawCircle(k: number, calm: boolean, time: number): void {
    this.k = k;
    const grow = calm ? 1 : 0.22 + 0.78 * Ease.cubicOut(k);
    const r = this.inner * grow;
    across(this.fill, r * 2 * 0.98);
    this.fill.visible = true;
    this.fill.alpha = 0.2 + 0.22 * k;
    across(this.rim, (r * 2 * 256) / (RING_R * 2));
    this.rim.visible = true;
    this.rim.alpha = 0.55 + 0.45 * Math.min(1, k * 3);
    this.rim.rotation = calm ? 0 : time * (0.9 + 1.6 * k);
    const reach = calm ? 1 : 0.3 + 0.7 * Ease.cubicOut(clamp01(k * 1.25));
    across(this.reach, (this.outer * reach * 256) / 110);
    this.reach.visible = true;
    this.reach.alpha = 0.16 + 0.14 * k;
  }

  /** The rock and its shadow at fall progress `p` (0 = in the sky, 1 = on the circle). */
  drawFall(p: number): void {
    this.p = p;
    const on = p > 0;
    this.head.visible = on;
    this.shadow.visible = on;
    if (!on) return;
    const dx = Math.cos(FALL_ANGLE);
    const dy = Math.sin(FALL_ANGLE);
    const away = FALL_DIST * (1 - Ease.quadIn(p));
    const near = lerp(0.5, 1, Ease.quadIn(p));
    this.headX = this.x - dx * away;
    this.headY = this.y - dy * away;
    this.head.position.set(this.headX, this.headY);
    this.head.rotation = FALL_ANGLE;
    this.head.alpha = Math.min(1, p * 5);
    this.rock.scale.set((BALL * near) / ROCK_PX);
    across(this.shadow, (28 + 74 * p * p) * 2 * (this.inner / 90) * 0.6);
    this.shadow.alpha = 0.34 * p;
  }

  hide(): void {
    this.on = false;
    this.circle.visible = false;
    this.head.visible = false;
    this.whistle?.kill();
    this.whistle = null;
  }

  destroy(): void {
    this.whistle?.kill();
    this.circle.destroy({ children: true });
    this.head.destroy({ children: true });
  }
}

/** The flash of a landing: a cream disc and the painted flash. */
class Landing extends Piece {
  readonly flash: Sprite;
  readonly burst: Sprite;
  x = 0;
  y = 0;
  radius = 90;
  constructor(parent: Container) {
    super();
    this.flash = atlas(parent, 'disc', Hue.cream);
    this.burst = painted(parent, FLASH_KEY);
  }
  hide(): void {
    this.on = false;
    this.flash.visible = false;
    this.burst.visible = false;
  }
  destroy(): void {
    this.flash.destroy();
    this.burst.destroy();
  }
}

/** A ring that sweeps out over the ground: the painted blast ring (a puffy cream ring of dust and sparks). */
class Wave extends Piece {
  readonly ring: Sprite;
  x = 0;
  y = 0;
  from = 20;
  radius = 90;
  tint: number = Hue.fire;
  /** How opaque it is at its most. */
  peak = RING_ALPHA_INNER;
  constructor(parent: Container) {
    super();
    this.ring = painted(parent, RING_KEY);
  }
  hide(): void {
    this.on = false;
    this.ring.visible = false;
  }
  destroy(): void {
    this.ring.destroy();
  }
}

type CraterPhase = 'burn' | 'out' | 'done';

/** The crater: the scorch on the road, the glow that beats under it. */
class Crater {
  on = false;
  id = 0;
  phase: CraterPhase = 'done';
  x = 0;
  y = 0;
  radius = 100;
  landAt = 0;
  endAt = 0;
  private nextBeat = 0;
  private readonly inAge = new Age();
  private readonly outAge = new Age();
  readonly root = new Container();
  private readonly glow: Sprite;
  private readonly scorch: Sprite;

  constructor(parent: Container) {
    this.scorch = new Sprite(paint('mark_scorch'));
    this.scorch.anchor.set(0.5);
    this.scorch.eventMode = 'none';
    this.root.addChild(this.scorch);
    // The glow lies ON the scorch (a smaller warm disc that beats with the burn), not under it: the scorch is opaque.
    this.glow = atlas(this.root, 'disc', Hue.ember);
    this.root.eventMode = 'none';
    this.root.visible = false;
    parent.addChild(this.root);
  }

  begin(id: number, x: number, y: number, radius: number, landAt: number, life: number): void {
    this.on = true;
    this.id = id;
    this.phase = 'burn';
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.landAt = landAt;
    this.endAt = landAt + life;
    this.nextBeat = landAt + PULSE_EVERY;
    this.inAge.reset();
    this.outAge.reset();
    this.root.position.set(x, y);
    this.root.visible = true;
    this.glow.visible = true;
    this.draw(0, 1, 0, true);
  }

  /** The scorch fades away (the crater's end event, or a fallback). */
  end(): void {
    if (this.phase !== 'burn') return;
    this.phase = 'out';
    this.outAge.reset();
  }

  /** The glow's level now: 1 at the beat, down to a third between beats, dimming away in the last 0.6 s. */
  glowAt(now: number, calm = false): number {
    const dim = clamp01((this.endAt - now) / GLOW_DIM);
    if (calm) return dim * 0.55;
    const beat = ((now - this.landAt) / PULSE_EVERY) % 1;
    return dim * (0.35 + 0.65 * Math.pow(1 - beat, 2));
  }

  /** Advance by the frame; `burst` is told when a beat comes. Returns false when it is gone. */
  update(dt: number, battleDt: number, now: number, calm: boolean, burst: (c: Crater) => void): boolean {
    if (this.phase === 'burn') {
      this.inAge.tick(battleDt, dt);
      const k = this.inAge.k(SCORCH_IN[0], SCORCH_IN[1]);
      if (now >= this.endAt + CRATER_GRACE) this.end();
      while (this.nextBeat <= now) {
        this.nextBeat += PULSE_EVERY;
        if (this.phase === 'burn' && now < this.endAt) burst(this);
      }
      this.draw(k, this.glowAt(now, calm), 0, calm);
      return true;
    }
    this.outAge.tick(battleDt, dt);
    const f = this.outAge.k(SCORCH_OUT[0], SCORCH_OUT[1]);
    if (f >= 1) {
      this.hide();
      return false;
    }
    this.draw(1, 0, f, calm);
    return true;
  }

  private draw(pop: number, glow: number, out: number, calm: boolean): void {
    const grow = calm ? 1 : 0.6 + 0.4 * Ease.backOut(pop);
    across(this.scorch, this.radius * 2.35 * grow);
    this.scorch.alpha = 1 - out;
    across(this.glow, this.radius * 1.0 * grow);
    this.glow.alpha = 0.5 * glow * (1 - out);
    this.glow.visible = glow > 0.01 && out < 1;
  }

  hide(): void {
    this.on = false;
    this.phase = 'done';
    this.root.visible = false;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

class MeteorScene implements SpScene<'meteor'> {
  private readonly back = new Container();
  private readonly front = new Container();
  private readonly warns: Warn[] = [];
  private readonly landings: Pieces<Landing>;
  private readonly waves: Pieces<Wave>;
  private readonly craters: Crater[] = [];
  private readonly dusk: Dusk;
  /** The meteors whose cast was shown and whose crater has not ended (kept through a defeat: a revive lets them land). */
  private readonly known = new Map<number, Known>();
  private readonly offs: Array<() => void> = [];
  /** A listener threw: the scene shows nothing for the rest of the battle. */
  private broken = false;
  /** Set by `clear`: the dusk lifts by real time until it is gone. */
  private cut = false;

  constructor(readonly env: SpEnv) {
    const { layers } = env.ctx;
    layers.fxBack.addChild(this.back);
    // The dusk is the first child of the front layer (over the board, the enemies and the cats; the numbers a layer above stay bright), and the
    // warning circle and the rest sit over it, so the red is not dimmed by the dark that announces it.
    this.dusk = new Dusk(layers.fxFront);
    layers.fxFront.addChild(this.front);
    this.back.eventMode = 'none';
    this.front.eventMode = 'none';
    this.landings = new Pieces(() => new Landing(this.front), LANDINGS);
    this.waves = new Pieces(() => new Wave(this.front), WAVES);
    this.offs.push(
      env.battle.events.on('meteorLand', (e) => this.safe('land', () => this.onLand(e))),
      env.battle.events.on('craterEnd', (e) => this.safe('end', () => this.onEnd(e))),
    );
  }

  /**
   * The scene's own listeners are called by the simulation in the middle of a rule (`meteorLand` comes BEFORE the `hit`s of that ring), and an
   * emitter does not catch: a throw here would unwind through `Sim.tick` and lose the ring's damage. So it is logged, and the scene empties itself
   * and switches off for the rest of the battle (the way the other listening scenes do).
   */
  private safe(what: string, fn: () => void): void {
    if (this.broken) return;
    try {
      fn();
    } catch (err) {
      console.error(`[skills] meteor ${what} failed`, err);
      this.broken = true;
      this.clear();
    }
  }

  cast(e: SpCastOf<'meteor'>): void {
    if (this.broken) return;
    const { stage, battle } = this.env;
    const d = e.data;
    this.cut = false;
    const known: Known = { x: d.impactX, y: d.impactY, inner: d.innerRadius, outer: d.outerRadius, crater: d.craterRadius, life: d.craterLife, at: d.at, warn: d.warn };
    this.known.set(d.meteorId, known);
    let w = this.warns.find((x) => !x.on);
    if (!w) {
      if (this.warns.length < WARNS) {
        w = new Warn(this.front, this.front);
        this.warns.push(w);
      } else {
        w = this.warns.reduce((a, b) => (a.at <= b.at ? a : b));
        w.hide();
      }
    }
    w.begin(d.meteorId, known, d.at);
    w.drawCircle(0, stage.reduced, battle.time);
    w.drawFall(0);
    // The sky's whistle starts as the fireball does (the battle's clock: it waits under a popup too).
    const fall = this.fallWindow(known.warn);
    // The whistle is 0.4 s long and has to end as the rock lands: it is played faster when the fall is quicker than that (at 3x).
    const whistlePitch = Math.min(1.8, Math.max(1, 0.4 / (fall / Math.max(1, this.env.ctx.speed || 1))));
    if (!stage.reduced) {
      w.whistle = stage.later(Math.max(0, d.at + known.warn - fall - battle.time), () => stage.play(stage.rules.skill, 'sp_meteor_whistle', 0.8, whistlePitch, 0.02, stage.panOf(known.x))) ?? null;
    }
    // The cat's own cue: a ring in the mages' blue and a few glints rising from the tile.
    stage.fx.shockwave(e.x, e.y + 6, { color: CLASS_COLOR.mage, radius: 62 });
    if (stage.detail > 0) stage.fx.ps.burst(CAST_GLINT, e.x, e.y - 20, { count: stage.detail === 1 ? 0.7 : 1 });
    // The sky darkens: a deep hum that rises as the red circle grows (`sp_meteor_warn`).
    stage.play(stage.rules.skill, 'sp_meteor_warn', 0.85, 1, 0.02, stage.panOf(known.x));
  }

  /** How many battle seconds the fall takes: `FALL_BATTLE`, or as many as make `FALL_REAL` real ones at this game speed, never more than the warning. */
  fallWindow(warn: number): number {
    const speed = Math.max(1, this.env.ctx.speed || 1);
    return Math.min(warn, Math.max(FALL_BATTLE, FALL_REAL * speed));
  }

  private onLand(e: BattleEvents['meteorLand']): void {
    const known = this.known.get(e.meteorId);
    if (!known) return;
    if (e.ring === 'inner') this.inner(e, known);
    else this.outer(e, known);
  }

  private inner(e: BattleEvents['meteorLand'], known: Known): void {
    const { stage, battle } = this.env;
    const detail = stage.detail;
    const calm = stage.reduced;
    const warn = this.warns.find((w) => w.on && w.id === e.meteorId);
    warn?.hide();
    const r = e.radius || known.inner;
    const l = this.landings.take();
    l.start(LAND[0], LAND[1]);
    l.x = e.x;
    l.y = e.y;
    l.radius = r;
    l.flash.visible = !calm;
    l.burst.visible = true;
    this.drawLanding(l, 0, calm);
    this.wave(e.x, e.y, r, Hue.fire, WAVE_INNER, calm, 20, RING_ALPHA_INNER);
    const ps = stage.fx.ps;
    const scale = r / 90;
    ps.burst(LAND_SPARKS, e.x, e.y, { scale, count: detail === 0 ? 0.5 : 1 });
    if (detail > 0 && !calm) ps.burst(LAND_CHIPS, e.x, e.y, { scale, count: detail === 1 ? 0.7 : 1 });
    if (detail > 0) ps.burst(LAND_SMOKE, e.x, e.y - 6, { scale, count: detail === 1 ? 0.7 : 1 });
    this.embers(e.points, detail);
    // The crater begins in the same breath (a crater of this id that is still there is replaced).
    this.crater(e.meteorId, e.x, e.y, known.crater, battle.time, known.life);
    stage.play(stage.rules.skill, 'sp_meteor_boom', 1, 1, 0.02, stage.panOf(e.x));
    if (!calm) {
      stage.shake(Trauma.t2, Gate.spShake, 0.3);
      screenFx.flash(Hue.cream, 0.3, 120);
    }
  }

  private outer(e: BattleEvents['meteorLand'], known: Known): void {
    const { stage } = this.env;
    const detail = stage.detail;
    const calm = stage.reduced;
    const r = e.radius || known.outer;
    this.wave(e.x, e.y, r, Hue.sun, WAVE_OUTER, calm, known.inner, RING_ALPHA_OUTER);
    if (detail > 0 && !calm) stage.fx.ps.burst(OUTER_DUST, e.x, e.y + 4, { scale: r / 200, count: detail === 1 ? 0.6 : 1, delay: 0.12 });
    this.embers(e.points, detail === 2 ? 1 : 0);
    stage.play(stage.rules.skill, 'sp_meteor_ring', 0.8, 1, 0.03, stage.panOf(e.x));
  }

  /** A few ember sparks on the enemies a ring touched (by tier). */
  private embers(points: readonly StrikePoint[], detail: 0 | 1 | 2): void {
    const n = Math.min(points.length, POINTS_MAX[detail]);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      if (p) this.env.stage.fx.ps.burst(HIT_EMBERS, p.x, p.y, { count: detail === 0 ? 0.6 : 1 });
    }
  }

  private wave(x: number, y: number, radius: number, color: number, span: Span, calm: boolean, from: number, peak: number): void {
    const w = this.waves.take();
    w.start(span[0], span[1]);
    w.x = x;
    w.y = y;
    w.radius = radius;
    w.from = from;
    w.tint = color;
    w.peak = peak;
    // The ring is cream dust: a breath of the ring's colour (flame for the first, sun for the second), so the two still tell apart.
    w.ring.tint = lighten(color, 0.72);
    w.ring.visible = true;
    this.drawWave(w, 0, calm);
  }

  private crater(id: number, x: number, y: number, radius: number, landAt: number, life: number): void {
    let c = this.craters.find((o) => o.on && o.id === id);
    if (!c) c = this.craters.find((o) => !o.on);
    if (!c) {
      if (this.craters.length < CRATERS) {
        c = new Crater(this.back);
        this.craters.push(c);
      } else {
        c = this.craters.reduce((a, b) => (a.landAt <= b.landAt ? a : b));
        c.hide();
      }
    }
    c.begin(id, x, y, radius, landAt, life);
  }

  private onEnd(e: BattleEvents['craterEnd']): void {
    if (!this.known.delete(e.meteorId)) return;
    for (const c of this.craters) if (c.on && c.id === e.meteorId) c.end();
  }

  // ── drawing ──

  private drawLanding(l: Landing, k: number, calm: boolean): void {
    const pop = calm ? 1 : Ease.cubicOut(clamp01(k * 2.4));
    l.flash.position.set(l.x, l.y);
    across(l.flash, l.radius * 2.1 * (0.5 + 0.5 * pop));
    l.flash.alpha = 0.8 * (1 - Ease.quadIn(clamp01(k * 1.4)));
    l.burst.position.set(l.x, l.y);
    across(l.burst, l.radius * 2.6 * (0.45 + 0.55 * pop));
    l.burst.rotation = calm ? 0 : k * 0.25;
    l.burst.alpha = 0.95 * (1 - k * k);
  }

  private drawWave(w: Wave, k: number, calm: boolean): void {
    const grow = calm ? 1 : Ease.cubicOut(clamp01(k * 1.6));
    const r = calm ? w.radius : lerp(w.from, w.radius, grow);
    w.ring.position.set(w.x, w.y);
    across(w.ring, r / RING_EDGE);
    w.ring.alpha = w.peak * (1 - k * k);
  }

  update(dt: number, battleDt: number): void {
    const { stage, battle } = this.env;
    const calm = stage.reduced;
    const now = battle.time;
    let warning = false;
    for (const w of this.warns) {
      if (!w.on) continue;
      warning = true;
      const k = clamp01((now - w.at) / w.warn);
      w.drawCircle(k, calm, now);
      if (calm) w.drawFall(0);
      else {
        const win = this.fallWindow(w.warn);
        w.drawFall(clamp01((now - (w.at + w.warn - win)) / win));
      }
      // A meteor whose landing never came (the simulation stopped, or the event was lost) is dropped a second after it was due.
      if (now >= w.at + w.warn + 1) w.hide();
    }
    this.dusk.update(warning, dt, battleDt, calm, this.cut);
    this.landings.update(battleDt, dt, this.paintLanding);
    this.waves.update(battleDt, dt, this.paintWave);
    for (const c of this.craters) {
      if (!c.on) continue;
      c.update(dt, battleDt, now, calm, this.onBeat);
    }
  }

  private readonly paintLanding = (l: Landing, k: number): void => this.drawLanding(l, k, this.env.stage.reduced);
  private readonly paintWave = (w: Wave, k: number): void => this.drawWave(w, k, this.env.stage.reduced);
  private readonly onBeat = (c: Crater): void => this.beat(c);

  /** One beat of a crater's burn: sparks and a wisp rise from it (not on the low tier). */
  private beat(c: Crater): void {
    const { stage } = this.env;
    if (stage.detail === 0 || stage.reduced) return;
    const scale = c.radius / 100;
    stage.fx.ps.burst(CRATER_EMBERS, c.x, c.y, { scale, count: stage.detail === 1 ? 0.7 : 1 });
    if (stage.detail > 1) stage.fx.ps.burst(CRATER_WISP, c.x, c.y - 4, { scale });
  }

  clear(): void {
    for (const w of this.warns) w.hide();
    this.landings.clear();
    this.waves.clear();
    for (const c of this.craters) c.hide();
    this.cut = true;
    // `known` stays: a meteor whose cast was shown still lands after a revive (see the header).
  }

  destroy(): void {
    this.clear();
    for (const off of this.offs) off();
    this.offs.length = 0;
    for (const w of this.warns) w.destroy();
    for (const c of this.craters) c.destroy();
    this.landings.destroy();
    this.waves.destroy();
    this.warns.length = 0;
    this.craters.length = 0;
    this.known.clear();
    this.dusk.destroy();
    this.back.destroy();
    this.front.destroy();
  }

  /** What is on screen right now (QA and tests). */
  live(): {
    warns: Array<{ id: number; k: number; p: number; x: number; y: number; headX: number; headY: number }>;
    landings: number;
    waves: number;
    craters: Array<{ id: number; phase: string }>;
    dusk: number;
    waiting: number;
  } {
    return {
      warns: this.warns.filter((w) => w.on).map((w) => ({ id: w.id, k: w.k, p: w.p, x: w.x, y: w.y, headX: w.headX, headY: w.headY })),
      landings: this.landings.live,
      waves: this.waves.live,
      craters: this.craters.filter((c) => c.on).map((c) => ({ id: c.id, phase: c.phase })),
      dusk: this.dusk.level,
      waiting: this.known.size,
    };
  }
}

export const makeMeteor: SpSceneFactory<'meteor'> = (env) => new MeteorScene(env);
