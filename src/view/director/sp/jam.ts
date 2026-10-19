/**
 * Jam Session!, the bard's scene (docs/design_skills_v2.md 3.10): the bard sweeps its lute, four golden notes leave it at once in a fan and each
 * lands on a different cat. A note that lands on a SKILL cat makes that cat's ring jump up by a fifth (`SpJamData.fill`, 0.2: a "ding" and a
 * little climb of the arc); a note that lands on a cat with no skill gives it a free attack (a golden note sticker pops on its head and its
 * ordinary attack, one tick behind the cast, is the paw that swings).
 *
 * Moment by moment (1x; every time is the battle's clock with a floor in real seconds, `span.ts`; everything is drawn from the cast's own list of
 * notes, which says for each one which cat, which kind and the gauge before and after):
 *   0.00  the strum: a gold crescent sweeps over the lute (0.24 s), a ring runs out under the bard, sparkles rise; the sound is the bard's own
 *         strummed chord, low and full, with the same chord an octave up a hair later;
 *   0.00  the notes leave the lute, one every 0.03 s in a fan (a chord is never a wall), each on a curve of its own;
 *   gauge notes (0.36 s): they float up and over and come down on the cat's RING. Until a note lands the ring keeps showing the gauge the cat had
 *         BEFORE it (the simulation has already written `after`: `holdRing`), and when the note lands the ring climbs to `after` in 0.22 s with a
 *         ping, a star and sparkles and a "ding" that climbs a pentatonic step for each note that lands;
 *   attack notes (0.13 s): they zip, because the cat's own attack comes in the very next tick and a note that landed after it would be a
 *         picture of the wrong order; a golden note sticker pops on the cat's head (0.6 s) with sparkles and a plink.
 *
 * A note is a picture painted in code (`jamArt.ts`): the game's own `shot_note` is the pink note of the bard's ordinary shot. The pieces are pooled
 * (at most twelve notes: three casts' worth), the sparkles are the particle pool's (priority 1 and 0), a lower quality tier gets fewer; under
 * reduced motion the notes do not fly (each fades in on its cat and the ring still climbs), nothing sweeps and no particle is made. A cast the stage
 * rule dropped shows nothing and holds no ring: its rings simply jump.
 */
import { Container, Sprite } from 'pixi.js';
import { TAU } from '@/core/math';
import { Ease } from '@/core/tween';
import type { EmitDef } from '@/fx';
import { Hue } from '@/fx/palette';
import { paint } from '@/fx/paint';
import { cellCenterX, cellCenterY } from '@/game/geometry';
import { NOTE_GOLD, NOTE_H, jamArt } from '../../jamArt';
import { holdRing, releaseRing, ringHeld } from '../../field/ringHold';
import { RING_AT } from '../../field/spRingMath';
import { Piece, Pieces, SpritePiece } from './runPieces';
import { climbValue, curvePoint, dingStep, noteControl, type Spot } from './jamMath';
import type { SpCastOf, SpEnv, SpScene, SpSceneFactory } from './types';

/** [battle seconds, real floor] of each moment. */
const FLY: readonly [number, number] = [0.36, 0.22];
const ZIP: readonly [number, number] = [0.13, 0.09];
const CLIMB: readonly [number, number] = [0.22, 0.12];
const SWEEP: readonly [number, number] = [0.24, 0.14];
const STICKER: readonly [number, number] = [0.6, 0.4];
/** Battle seconds between one note leaving the lute and the next: a strum is not a single instant, a wall of four notes is not a chord. */
const STAGGER = 0.03;
/** The most notes alive (three casts' worth) and stickers, climbs and sweeps. */
const NOTES = 12;
const STICKERS = 8;
const CLIMBS = 12;
const SWEEPS = 2;
/** How tall a note is drawn in flight and as a sticker, design px. */
const NOTE_SHOWN = 40;
const STICKER_SHOWN = 50;
/** Where the lute is, from the bard's tile centre, and the head of a cat above its feet (design px). */
const LUTE = { x: 14, y: 2 } as const;
const HEAD_RISE = 60;
/** A cat's feet are this far below its cell's middle (a fallback: the real views are asked first). */
const FEET_FALLBACK = 28;
/** A ring held for a note that never landed lets go this many battle seconds after the cast. */
const HOLD_MAX = 1.2;
/** A held ring whose cat's own gauge fell below what the hold showed (it cast meanwhile) lets go at once, within this slack. */
const FELL = 0.001;

const STRUM_SPARKS: EmitDef = {
  tex: 'sparkle', prio: 1, count: 7, life: [0.3, 0.55], shape: { type: 'circle', r: 8 }, speed: [50, 140], dir: -Math.PI / 2, spread: 1.3, drag: 3,
  gravity: 30, size: [14, 22], sizeEnd: [4, 8], rot: [0, TAU], spin: [-2, 2], colors: [Hue.cream, NOTE_GOLD], alpha: 0.95, fadeIn: 0.05, fadeOut: 0.5,
};
const TRAIL: EmitDef = {
  tex: 'sparkle', prio: 0, count: 1, life: [0.2, 0.34], speed: [8, 30], drag: 3, size: [10, 16], sizeEnd: [3, 6], rot: [0, TAU],
  colors: [Hue.cream, NOTE_GOLD], alpha: 0.9, fadeIn: 0, fadeOut: 0.6,
};
const LAND_SPARKS: EmitDef = {
  tex: 'sparkle', prio: 1, count: 5, life: [0.25, 0.45], shape: { type: 'circle', r: 6 }, speed: [40, 110], spread: Math.PI, drag: 3.2, gravity: 40,
  size: [12, 18], sizeEnd: [3, 7], rot: [0, TAU], spin: [-2, 2], colors: [Hue.cream, NOTE_GOLD], alpha: 0.95, fadeIn: 0.04, fadeOut: 0.5,
};

type Kind = 'gauge' | 'attack';

/** One golden note on its way to a cat. */
class Note extends SpritePiece {
  kind: Kind = 'gauge';
  uid = 0;
  cell = 0;
  lane = 0;
  /** The order it was handed out in: the pentatonic step of its ding. */
  step = 0;
  x0 = 0;
  y0 = 0;
  x1 = 0;
  y1 = 0;
  readonly ctrl: Spot = { x: 0, y: 0 };
  before = 0;
  after = 0;
  constructor(parent: Container, art: Sprite['texture']) {
    super(parent, art, 14.5 / 44, 45 / NOTE_H);
  }
}

/** The golden note stuck on the head of a cat that has no skill: its next attack is the free one. */
class Sticker extends SpritePiece {
  x = 0;
  y = 0;
}

/** The sweep of a strum over the lute. */
class Sweep extends SpritePiece {
  x = 0;
  y = 0;
}

/** A ring on its way up after a note: nothing is drawn, the ring's own frame is what moves (`ringHold.ts`). */
class Climb extends Piece {
  uid = 0;
  from = 0;
  to = 0;
  hide(): void {
    this.on = false;
  }
  destroy(): void {
    // Nothing of its own to free.
  }
}

/** A ring this scene holds: what it shows now, when it must let go anyway and what it climbs to. */
interface Held {
  val: number;
  from: number;
  deadline: number;
}

class JamScene implements SpScene<'jam'> {
  private readonly front: Container;
  private readonly notes: Pieces<Note>;
  private readonly stickers: Pieces<Sticker>;
  private readonly sweeps: Pieces<Sweep>;
  private readonly climbs: Pieces<Climb>;
  /** The rings this scene holds, by cat. */
  private readonly mine = new Map<number, Held>();
  private readonly spot: Spot = { x: 0, y: 0 };
  private readonly at: Spot = { x: 0, y: 0 };
  private frame = 0;

  constructor(private readonly env: SpEnv) {
    this.front = env.ctx.layers.fxFront;
    const art = jamArt();
    this.notes = new Pieces<Note>(() => new Note(this.front, art.note), NOTES);
    this.stickers = new Pieces<Sticker>(() => {
      const s = new Sticker(this.front, art.note, 14.5 / 44, 45 / NOTE_H);
      return s;
    }, STICKERS);
    this.sweeps = new Pieces<Sweep>(() => new Sweep(this.front, art.strum, 0.62, 0.62), SWEEPS);
    this.climbs = new Pieces<Climb>(() => new Climb(), CLIMBS);
  }

  // ── the cast ──

  cast(e: SpCastOf<'jam'>): void {
    const { stage, battle } = this.env;
    const detail = stage.detail;
    const calm = stage.reduced;
    const d = e.data;
    const lx = e.x + LUTE.x;
    const ly = e.y + LUTE.y;

    this.strum(e.x, e.y, lx, ly, calm, detail);

    // The sound: the bard's own strummed chord, lower and fuller than its ordinary shot, then the same chord an octave up a hair later.
    stage.play(stage.rules.skill, 'sp_strum', 0.95, 1, 0.02, stage.panOf(e.x));

    const lanes = d.notes.length;
    let turn = 0;
    for (let i = 0; i < lanes; i++) {
      const note = d.notes[i];
      if (!note) continue;
      const n = this.notes.take();
      const life = note.kind === 'gauge' ? FLY : ZIP;
      n.start(life[0], life[1]);
      n.kind = note.kind;
      n.uid = note.uid;
      n.cell = note.cell;
      n.lane = i;
      n.step = i;
      n.before = note.before;
      n.after = note.after;
      n.x0 = lx;
      n.y0 = ly;
      const end = note.kind === 'gauge' ? this.ringSpot(note.uid, note.cell, this.spot) : this.headSpot(note.uid, note.cell, this.spot);
      n.x1 = end.x;
      n.y1 = end.y;
      noteControl(n.x0, n.y0, n.x1, n.y1, i, lanes, n.ctrl);
      // The gauge notes leave in a fan, one beat behind the one before; the attack notes leave at once (the cat's own attack is one tick behind the cast).
      const delay = note.kind === 'attack' ? 0 : STAGGER * turn++;
      n.age.battle = -delay;
      n.age.real = -delay;
      n.sprite.visible = false;
      this.dress(n, 0, calm);
      if (note.kind === 'gauge' && note.after > note.before + 1e-9) {
        // The simulation wrote the new gauge before this event: the ring keeps the old one until the note lands.
        holdRing(note.uid, note.before);
        this.mine.set(note.uid, { val: note.before, from: note.before, deadline: battle.time + HOLD_MAX });
      }
    }
  }

  /** The lute's sweep: a gold crescent, a ring under the bard, sparkles. */
  private strum(x: number, y: number, lx: number, ly: number, calm: boolean, detail: 0 | 1 | 2): void {
    const { stage } = this.env;
    if (calm) return;
    const s = this.sweeps.take();
    s.start(SWEEP[0], SWEEP[1]);
    s.x = lx - 2;
    s.y = ly + 2;
    s.sprite.visible = true;
    this.sweepLook(s, 0);
    stage.fx.shockwave(x, y + 16, { color: NOTE_GOLD, radius: 58 });
    stage.fx.ps.burst(STRUM_SPARKS, lx, ly - 6, { count: detail === 0 ? 0.5 : 1 });
  }

  private sweepLook(s: Sweep, k: number): void {
    s.sprite.position.set(s.x, s.y);
    s.sprite.rotation = -0.85 + 1.5 * Ease.cubicOut(k);
    const grow = 0.75 + 0.4 * Ease.cubicOut(k);
    s.sprite.scale.set(grow);
    s.sprite.alpha = k < 0.25 ? 1 : 1 - (k - 0.25) / 0.75;
  }

  // ── where a note lands ──

  /** The centre of the ring on the cat `uid` (its place on the field), or from its cell when the cat's view is not there to ask. */
  private ringSpot(uid: number, cell: number, out: Spot): Spot {
    const ring = this.env.ctx.unitView?.(uid)?.getChildByLabel('sp-ring', true);
    if (ring && !ring.destroyed) {
      const p = this.front.toLocal(ring.getGlobalPosition());
      out.x = p.x;
      out.y = p.y;
      return out;
    }
    out.x = cellCenterX(cell) + RING_AT.x;
    out.y = cellCenterY(cell) + FEET_FALLBACK + RING_AT.y;
    return out;
  }

  /** Just over the head of the cat `uid`. */
  private headSpot(uid: number, cell: number, out: Spot): Spot {
    const view = this.env.ctx.unitView?.(uid);
    if (view && !view.destroyed) {
      const p = this.front.toLocal(view.getGlobalPosition());
      out.x = p.x;
      out.y = p.y - HEAD_RISE;
      return out;
    }
    out.x = cellCenterX(cell);
    out.y = cellCenterY(cell) + FEET_FALLBACK - HEAD_RISE;
    return out;
  }

  // ── the pictures ──

  /** Pose one note at `k` (0 at the lute, 1 on the cat). */
  private dress(n: Note, k: number, calm: boolean): void {
    const sp = n.sprite;
    const base = NOTE_SHOWN / NOTE_H;
    if (calm) {
      // It does not fly: it appears on its cat and holds.
      sp.position.set(n.x1, n.y1);
      sp.rotation = 0;
      sp.scale.set(base);
      sp.alpha = Math.min(1, k * 3);
      return;
    }
    curvePoint(n.x0, n.y0, n.ctrl.x, n.ctrl.y, n.x1, n.y1, Ease.sineInOut(k), this.at);
    sp.position.set(this.at.x, this.at.y);
    sp.rotation = Math.sin(k * TAU * 1.25 + n.lane) * 0.32;
    const pop = k < 0.2 ? Ease.backOut(k / 0.2) : 1;
    sp.scale.set(base * Math.max(0.05, pop) * (1 - 0.12 * k));
    sp.alpha = 1;
  }

  private readonly paintSticker = (s: Sticker, k: number): void => this.stickerLook(s, k, this.env.stage.reduced);
  private readonly paintSweep = (s: Sweep, k: number): void => this.sweepLook(s, k);

  private stickerLook(s: Sticker, k: number, calm: boolean): void {
    const sp = s.sprite;
    sp.position.set(s.x, s.y);
    const base = STICKER_SHOWN / NOTE_H;
    const pop = calm ? 1 : k < 0.16 ? Ease.backOut(k / 0.16) : 1;
    sp.scale.set(base * Math.max(0.05, pop));
    sp.rotation = calm ? 0 : -0.18 + 0.1 * Math.sin(k * TAU * 2);
    sp.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
  }

  // ── a note lands ──

  private land(n: Note): void {
    const { stage } = this.env;
    const calm = stage.reduced;
    const detail = stage.detail;
    const ding = dingStep(n.step);
    if (n.kind === 'gauge') {
      const at = this.ringSpot(n.uid, n.cell, this.spot);
      // The ring climbs only if this scene holds it (its gauge moved and no one took it over since): otherwise it already shows the cat's own gauge.
      if (this.mine.has(n.uid)) {
        const c = this.climbs.take();
        c.start(CLIMB[0], CLIMB[1]);
        c.uid = n.uid;
        c.from = n.before;
        c.to = n.after;
      }
      if (!calm) {
        stage.fx.shockwave(at.x, at.y, { color: NOTE_GOLD, radius: 26 });
        stage.fx.fleck(paint('burst_star'), at.x, at.y, { life: 0.22, size: 30, sizeEnd: 54, rot: n.step, color: Hue.sun, fadeAt: 0.4 });
        stage.fx.ps.burst(LAND_SPARKS, at.x, at.y, { count: detail === 0 ? 0.5 : 1 });
      }
      stage.playStep(stage.rules.skill, 'sp_note', ding, 0.8, 1, stage.panOf(at.x), stage.stagger('note', 0.055));
      return;
    }
    const at = this.headSpot(n.uid, n.cell, this.spot);
    const s = this.stickers.take();
    s.start(STICKER[0], STICKER[1]);
    s.x = at.x;
    s.y = at.y;
    s.sprite.visible = true;
    this.stickerLook(s, 0, calm);
    if (!calm) stage.fx.ps.burst(LAND_SPARKS, at.x, at.y + 6, { count: detail === 0 ? 0.5 : 1 });
    stage.playStep(stage.rules.skill, 'sp_note', ding, 0.8, 1, stage.panOf(at.x), stage.stagger('note', 0.055));
  }

  /** Let go of the ring of `uid`, but only if the picture on it is still ours (a fish capsule's hold on the same cat is not ours to drop). */
  private let(uid: number): void {
    const m = this.mine.get(uid);
    if (!m) return;
    this.mine.delete(uid);
    if (ringHeld(uid) === m.val) releaseRing(uid);
  }

  // ── the frame ──

  update(dt: number, battleDt: number): void {
    const { stage, battle } = this.env;
    const calm = stage.reduced;
    this.frame++;
    for (const n of this.notes.list) {
      if (!n.on) continue;
      n.age.tick(battleDt, dt);
      // Waiting its turn in the fan.
      if (n.age.battle < 0 || n.age.real < 0) continue;
      const k = n.k();
      if (k >= 1) {
        this.land(n);
        n.hide();
        continue;
      }
      n.sprite.visible = true;
      this.dress(n, k, calm);
      if (!calm && stage.detail > 0 && this.frame % 3 === 0) stage.fx.ps.burst(TRAIL, n.sprite.x, n.sprite.y, { count: 1 });
    }
    this.stickers.update(battleDt, dt, this.paintSticker);
    this.sweeps.update(battleDt, dt, this.paintSweep);
    for (const c of this.climbs.list) {
      if (!c.on) continue;
      c.age.tick(battleDt, dt);
      const k = c.k();
      const m = this.mine.get(c.uid);
      if (k >= 1 || !m) {
        c.hide();
        this.let(c.uid);
        continue;
      }
      const actual = this.sp(c.uid);
      // The ring is no longer ours (a capsule took it over, or let go of it): leave it alone.
      if (actual === null || ringHeld(c.uid) !== m.val) {
        c.hide();
        if (actual === null) this.let(c.uid);
        else this.mine.delete(c.uid);
        continue;
      }
      const v = climbValue(c.from, c.to, k, actual);
      m.val = v;
      holdRing(c.uid, v);
    }
    // A ring whose note never landed (a cat that left, a cast spent meanwhile, a hold that ran out) lets go by itself.
    if (this.mine.size > 0) {
      for (const [uid, m] of this.mine) {
        const actual = this.sp(uid);
        if (battle.time > m.deadline || actual === null || actual < m.from - FELL) this.let(uid);
      }
    }
  }

  /** The skill gauge of the cat `uid` on the board now, or null when it is not there. */
  private sp(uid: number): number | null {
    for (const u of this.env.battle.units) if (u && u.uid === uid) return u.sp;
    return null;
  }

  clear(): void {
    this.notes.clear();
    this.stickers.clear();
    this.sweeps.clear();
    this.climbs.clear();
    for (const uid of [...this.mine.keys()]) this.let(uid);
  }

  destroy(): void {
    this.clear();
    this.notes.destroy();
    this.stickers.destroy();
    this.sweeps.destroy();
    this.climbs.destroy();
  }

  /** The pieces alive right now (QA and tests). */
  live(): { notes: number; stickers: number; climbs: number; sweeps: number; held: number } {
    return { notes: this.notes.live, stickers: this.stickers.live, climbs: this.climbs.live, sweeps: this.sweeps.live, held: this.mine.size };
  }
}

export const makeJam: SpSceneFactory<'jam'> = (env) => new JamScene(env);
