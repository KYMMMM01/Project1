/**
 * The boss alarm (the owner, 2026-11-09: "보스 몬스터 나올때 경고가 심심하다"; of five candidates he picked this one, "회전등을 더
 * 폴리싱"): over the warning ribbon two strips of caution tape sweep across the whole screen, a red rotating beacon stands over the board
 * and turns two soft cones of light across it, the screen edge throbs red and every beat before the boss lands shakes a little. Drawn on
 * game.overlayLayer under the screen effects and timed on the real clock like the awakening cut-in.
 *
 * The tape is over the lane where the boss lands, so it is gone before the boss appears: `tempo` (the battle's speed) plays it that many
 * times as fast; the beacon keeps its real length. The edge throb is the screen's own vignette pulse (two beats a second at most, off with
 * `flashes`); with flashes off the beacon keeps one brightness; reduced motion keeps the tape still, stops the beams (the lamp glows on)
 * and softens the shake (fxShake).
 */
import { CanvasSource, Container, Graphics, Sprite, Texture, type Text } from 'pixi.js';
import { game } from '@/core/game';
import { clamp01, lighten } from '@/core/math';
import { label } from '@/ui/text';
import { Color } from '@/ui/theme';
import { Hue } from './palette';
import { ScreenFx, fxShake, screenFx } from './screen';
import { fxSettings } from './settings';
import { renderOnce } from './warm';

/** Seconds (at 1x) the tape takes to come in, how long it stays, how long it takes to leave: 0.86 s in all, under the 1 s before the boss appears. */
const TAPE_IN = 0.16;
const TAPE_HOLD = 0.54;
const TAPE_OUT = 0.16;
/** Siren beats (vignette swells of 0.5 s) and their real length. */
const BEATS = 5;
const BEAT = 0.5;
const SIREN = BEATS * BEAT;
/** Shake on every beat before the boss lands: under the rumble's own 0.25 cap. */
const BEAT_SHAKE = 0.2;

export interface AlarmOpts {
  /** The battle's speed (1, 2, 3): the tape plays that many times as fast, so it is gone before the boss lands. */
  tempo: number;
  /** Real seconds from now to the boss's landing: the beats shake only before it. */
  landAt: number;
  /** True while the battle is held (pause menu, popup): the alarm holds too. */
  paused: () => boolean;
}
const TAPE_H = 58;
const STRIPE = 28;
const EDGE = 12;
const WORD_GAP = 230;
/** Each strip: where it crosses the screen (share of the height), its tilt, the side it comes from. */
const STRIPS = [
  { y: 0.28, angle: -0.12, from: -1 },
  { y: 0.66, angle: 0.1, from: 1 },
] as const;
/** Scroll of the words along the tape while it holds (px per second). */
const DRIFT = 90;
/** The beacon: where it stands (share of the height: between the ribbon and the board's top row, over the middle of the lane's first run),
 * how fast it turns (radians per second), how wide its cones open at the far end and how far they reach (shares of the screen). */
const LAMP_Y = 0.205;
const SPIN = 3.6;
const CONE_W = 0.62;
const CONE_L = 1.05;
/** The lamp's size against its drawing (a dome of 16 px radius). */
const LAMP_SCALE = 1.35;

const YELLOW = Color.mustard;
const INK = Color.ink;

/** One strip of caution tape `len` px long: diagonal stripes on both edges, the word on a dark band between them, warning signs between words. */
function makeTape(len: number, word: string): Container {
  const strip = new Container();
  const g = new Graphics();
  g.rect(-len / 2, 0, len, TAPE_H).fill(YELLOW);
  g.rect(-len / 2, EDGE + 2, len, TAPE_H - 2 * (EDGE + 2)).fill(INK);
  for (let x = -len / 2 - STRIPE; x < len / 2 + STRIPE; x += STRIPE) {
    g.poly([x, 0, x + STRIPE / 2, 0, x + STRIPE / 2 - EDGE, EDGE, x - EDGE, EDGE]).fill(INK);
    g.poly([x, TAPE_H - EDGE, x + STRIPE / 2, TAPE_H - EDGE, x + STRIPE / 2 - EDGE, TAPE_H, x - EDGE, TAPE_H]).fill(INK);
  }
  // a small warning sign (a yellow triangle with a dark mark) half way between two words
  for (let x = -len / 2 + WORD_GAP; x < len / 2; x += WORD_GAP) {
    const cx = x - WORD_GAP / 2;
    const cy = TAPE_H / 2;
    g.poly([cx, cy - 10, cx + 11, cy + 9, cx - 11, cy + 9]).fill(YELLOW);
    g.rect(cx - 1.5, cy - 4, 3, 7).fill(INK);
    g.rect(cx - 1.5, cy + 4.5, 3, 2.5).fill(INK);
  }
  strip.addChild(g);
  for (let x = -len / 2 + WORD_GAP; x < len / 2; x += WORD_GAP) {
    const w: Text = label(word, { size: 22, color: YELLOW, stroke: false });
    w.position.set(x, TAPE_H / 2 + 1);
    strip.addChild(w);
  }
  strip.pivot.set(0, TAPE_H / 2);
  return strip;
}

/** White pictures tinted at use: a cone of light (narrow and bright at the bottom, where the lamp is, wide and faint at the top) and a soft round glow. */
let coneTex: Texture | null = null;
let glowTex: Texture | null = null;
function paint(w: number, h: number, alpha: (u: number, v: number) => number, name: string): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('fx: 2D canvas unavailable');
  const img = ctx.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(clamp01(alpha(((i + 0.5) / w) * 2 - 1, (j + 0.5) / h)) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return new Texture({ source: new CanvasSource({ resource: canvas, autoGarbageCollect: false }), label: name });
}
function textures(): { cone: Texture; glow: Texture } {
  // v: 0 at the far end, 1 at the lamp; the cone's half width shrinks to a tenth at the lamp, its light fades towards the far end and its edges are soft
  coneTex ??= paint(64, 256, (u, v) => {
    const half = 0.1 + 0.9 * (1 - v);
    const edge = clamp01((half - Math.abs(u)) / (0.35 * half));
    return edge * Math.pow(v, 1.3);
  }, 'fx_alarm_cone');
  glowTex ??= paint(64, 64, (u, v) => {
    const d = Math.hypot(u, v * 2 - 1);
    return Math.pow(clamp01(1 - d), 2);
  }, 'fx_alarm_glow');
  return { cone: coneTex, glow: glowTex };
}

class Alarm {
  readonly layer = new Container();
  private readonly tapes: Container[] = [];
  private readonly beams: Sprite[] = [];
  private lamp: Container | null = null;
  private head: Container | null = null;
  private rays: Graphics | null = null;
  private halo: Sprite | null = null;
  private off: (() => void) | null = null;
  private t = 0;
  private o: AlarmOpts = { tempo: 1, landAt: Infinity, paused: () => false };
  private screen: ScreenFx = screenFx;
  private beatsShaken = 0;
  /** The battle was held at the last step (the layer is hidden and the throb stopped for it). */
  private held = false;
  private builtFor = '';
  /** Length of a strip: the screen's width across its tilt and the drift, no more (the slide starts it just off the screen). */
  private len = 0;

  constructor() {
    // Never in the way of a tap: Pixi's hit test would let the tape or a beam swallow a press on the pause or speed button (see cutin.ts).
    this.layer.eventMode = 'none';
    this.layer.label = 'bossAlarm';
  }

  /** Build the tape and the beacon for this screen and word (once; again only when either changed). */
  private build(word: string): void {
    const key = `${game.w}x${game.h}:${word}`;
    if (key === this.builtFor) return;
    this.layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.tapes.length = 0;
    this.beams.length = 0;
    const { w, h } = game;
    this.len = w / Math.cos(0.12) + 2 * DRIFT + 120;
    for (const s of STRIPS) {
      const strip = makeTape(this.len, word);
      strip.rotation = s.angle;
      this.layer.addChild(strip);
      this.tapes.push(strip);
    }
    // the beacon: two cones of light turning half a turn apart, a glow that swells with the beats, and the lamp itself (a red dome with a
    // highlight on a dark base) drawn over its own light
    const { cone, glow } = textures();
    const lamp = new Container();
    lamp.position.set(w / 2, h * LAMP_Y);
    for (let k = 0; k < 2; k++) {
      const b = new Sprite(cone);
      b.anchor.set(0.5, 1);
      b.width = w * CONE_W;
      b.height = h * CONE_L;
      b.tint = lighten(Hue.alarm, 0.15);
      lamp.addChild(b);
      this.beams.push(b);
    }
    // the lamp and its glow are one piece that pops in and is scaled on its own (the cones keep their size)
    const head = new Container();
    const halo = new Sprite(glow);
    halo.anchor.set(0.5);
    halo.tint = Hue.alarm;
    head.addChild(halo);
    this.halo = halo;
    // the lamp as everyone draws one (the owner: "내가 알던 비상등 모양"): a tall red dome with a white glint and a glowing bulb, on a dark
    // base wider at the foot, and three short rays on each side that flash with the beats
    const rays = new Graphics();
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + side * (0.62 + k * 0.42);
        rays.moveTo(Math.cos(a) * 30, -14 + Math.sin(a) * 30).lineTo(Math.cos(a) * 42, -14 + Math.sin(a) * 42);
      }
    }
    rays.stroke({ width: 4, color: lighten(Hue.alarm, 0.25), cap: 'round' });
    head.addChild(rays);
    this.rays = rays;
    const g = new Graphics();
    g.poly([-24, 14, 24, 14, 20, 2, -20, 2]).fill(INK);
    g.rect(-20, 6, 40, 2).fill(lighten(INK, 0.3));
    g.circle(0, -16, 16).fill(INK);
    g.rect(-16, -16, 32, 19).fill(INK);
    g.circle(0, -16, 14).fill(Hue.alarm);
    g.rect(-14, -16, 28, 18).fill(Hue.alarm);
    g.ellipse(2, -8, 9, 11).fill({ color: lighten(Hue.alarm, 0.45), alpha: 0.45 });
    g.roundRect(-10, -26, 3.5, 11, 1.75).fill({ color: Color.paperLight, alpha: 0.85 });
    head.addChild(g);
    lamp.addChild(head);
    this.layer.addChild(lamp);
    this.lamp = lamp;
    this.head = head;
    this.layer.visible = false;
    // (only now: a build that threw half way, a 2D canvas refused under memory pressure, is tried again next time)
    this.builtFor = key;
  }

  /** Draw it once out of sight (glyphs, geometry, uploads), so the frame the alarm opens in only has to move it. */
  prepare(word: string): void {
    this.build(word);
    renderOnce(this.layer);
  }

  play(word: string, o: AlarmOpts, screen: ScreenFx): void {
    this.build(word);
    this.t = 0;
    this.o = { ...o, tempo: Math.max(1, o.tempo) };
    this.screen = screen;
    this.beatsShaken = 0;
    this.held = false;
    const overlay = game.overlayLayer;
    if (this.layer.parent !== overlay) overlay.addChildAt(this.layer, Math.max(0, overlay.getChildIndex(screen.layer)));
    this.layer.visible = true;
    screen.vignettePulse(Hue.alarm, 0.42, BEAT * 1000, BEATS);
    screen.flash(Hue.alarm, 0.16, 260);
    this.off?.();
    this.off = game.onUpdate((dt) => this.step(dt));
    this.step(0);
  }

  private step(dt: number): void {
    // a pause (the menu, a popup) holds the tape, the beacon and the beats where they are, as it holds the ribbon and the boss
    const held = this.o.paused();
    if (held !== this.held) {
      // the pause menu or a popup is drawn under this layer: hide it and stop the throb while it is up, and on resume throb the beats that are left
      this.held = held;
      this.layer.visible = !held;
      if (held) this.screen.clear();
      else {
        const left = Math.ceil((SIREN - this.t) / BEAT);
        if (left > 0) this.screen.vignettePulse(Hue.alarm, 0.42, BEAT * 1000, left);
      }
    }
    if (!held) this.t += dt;
    const t = this.t;
    const { w, h } = game;
    const reduced = fxSettings.reducedMotion;
    // the tape: in, a drift along its length, out, all `tempo` times as fast
    const tt = t * this.o.tempo;
    const inK = clamp01(tt / TAPE_IN);
    const outK = clamp01((tt - TAPE_IN - TAPE_HOLD) / TAPE_OUT);
    const tapeOn = outK < 1;
    const span = this.len / 2 + w / 2 + 20;
    STRIPS.forEach((s, i) => {
      const strip = this.tapes[i];
      if (!strip) return;
      strip.visible = tapeOn;
      if (!tapeOn) return;
      const slide = reduced ? 0 : s.from * span * (1 - easeOut(inK) - easeIn(outK));
      strip.position.set(w / 2 + slide + (reduced ? 0 : -s.from * DRIFT * tt), h * s.y);
      strip.alpha = reduced ? Math.min(inK, 1 - outK) : 1;
    });
    // the beacon: it pops up, turns its two cones, swells its glow with the beats and goes out over the last fifth of the siren
    const sirenK = t / SIREN;
    // (one steady brightness with flashes off or reduced motion: no looping pulse)
    const beat = fxSettings.flashes && !reduced ? 0.5 - 0.5 * Math.cos((t / BEAT) * Math.PI * 2) : 0.5;
    const fade = 1 - clamp01((sirenK - 0.8) / 0.2);
    const lamp = this.lamp;
    if (lamp) {
      lamp.visible = sirenK < 1;
      const pop = clamp01(t / 0.18);
      this.head?.scale.set(LAMP_SCALE * (reduced ? 1 : pop < 1 ? 1.2 * easeOut(pop) : 1.2 - 0.2 * clamp01((t - 0.18) / 0.12)));
      lamp.alpha = fade;
    }
    this.beams.forEach((b, i) => {
      b.visible = !reduced;
      b.rotation = i * Math.PI + t * SPIN;
      b.alpha = 0.3 + 0.22 * beat;
    });
    if (this.halo) {
      const s = 2.2 + 1.2 * beat;
      this.halo.scale.set(s);
      this.halo.alpha = 0.5 + 0.4 * beat;
    }
    if (this.rays) this.rays.alpha = 0.25 + 0.75 * beat;
    // a beat shakes only before the boss lands: after that the landing's own shake (T3) is the one to feel, not a stack of both
    while (this.beatsShaken < BEATS && t >= (this.beatsShaken + 0.5) * BEAT) {
      if (t < this.o.landAt - 0.05) fxShake(BEAT_SHAKE);
      this.beatsShaken++;
    }
    if (!tapeOn && sirenK >= 1) this.stop();
  }

  /** Off the screen and off the clock (kept built for the next boss). */
  stop(): void {
    this.off?.();
    this.off = null;
    this.layer.visible = false;
  }

  destroy(): void {
    // left in the middle of an alarm (the battle quit, retried or ended): its red throb must not run on over the next screen
    if (this.off) this.screen.clear();
    this.stop();
    this.layer.parent?.removeChild(this.layer);
    this.layer.destroy({ children: true });
    this.tapes.length = 0;
    this.beams.length = 0;
    this.lamp = null;
    this.halo = null;
    this.head = null;
    this.rays = null;
    this.builtFor = '';
  }
}

const easeOut = (k: number): number => 1 - (1 - k) * (1 - k);
const easeIn = (k: number): number => k * k;

/** The one alarm of the game (a boss at a time). */
export const bossAlarm = {
  alarm: null as Alarm | null,
  /** Build and draw it ahead (call during the wave before a boss). */
  prepare(word: string): void {
    (this.alarm ??= new Alarm()).prepare(word);
  },
  /** Sound the alarm now. */
  play(word: string, o: AlarmOpts, screen: ScreenFx = screenFx): void {
    (this.alarm ??= new Alarm()).play(word, o, screen);
  },
  /** End it at once and free it (a battle ends). */
  destroy(): void {
    this.alarm?.destroy();
    this.alarm = null;
  },
};
