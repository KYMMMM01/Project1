/** Things inked onto paper when something is done: a hand-drawn check in a box, and a rubber stamp. */
import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { Ease, uiTweens } from '@/core/tween';
import { Color, drawDashedRect, drawIcon, drawPaper, motion, paperSeed, TweenBag, uiLabel } from '@/ui';

/** The rubber-stamp sound of the audio set (a dull thud under a paper slap, then one ding). Several land in one moment (a claim-all, a whole calendar page): only the first is heard. */
const THUD_GAP = 0.09;
let lastThud = -1;

export function stampThud(): void {
  if (game.time - lastThud < THUD_GAP) return;
  lastThud = game.time;
  audio.play('reward_claim', { volume: 0.7 });
}

/** How long a slammed stamp takes to land and settle, and how recently it must have been slammed to count as "this moment". */
const SLAM_SECONDS = 0.3;
const SAME_MOMENT = 0.05;
let slammedAt = -1;
let settledAt = 0;

/**
 * Seconds until the stamp slammed in this very moment has settled, or null when none was. A claim that comes with a stamp leaves
 * its sound to the stamp's landing and holds its reward sheet for the stamp to be seen first.
 */
export function stampPending(): number | null {
  return game.time - slammedAt < SAME_MOMENT ? Math.max(0, settledAt - game.time) : null;
}

/** Resolves once the stamp slammed in this moment has settled (at once when there is none): open a sheet over the stamp only after it. */
export function afterStamp(): Promise<void> {
  const wait = stampPending();
  return wait ? uiTweens.call(wait, () => undefined).finished : Promise.resolve();
}

/** The little paper square of a to-do line; a pen-drawn check appears in it when the line is done. Origin = centre. */
export class CheckBox extends Container {
  private readonly bag = new TweenBag();
  private readonly tick = new Graphics();
  private readonly reveal = new Graphics();
  private readonly ready = new Graphics();
  private done = false;

  constructor(readonly size: number) {
    super();
    const s = size;
    const box = new Graphics();
    drawPaper(box, -s / 2, -s / 2, { w: s, h: s, radius: 12, fill: Color.paperLight, edge: Color.kraftDark, edgeWidth: 2.5, edgeAlpha: 0.8, shadow: 3, grain: false, seed: paperSeed() });
    // The teal cut line that says "take me": shown while the line is finished but not yet claimed.
    drawDashedRect(this.ready, -s / 2 - 8, -s / 2 - 8, s + 16, s + 16, { radius: 16, width: 3.5, dash: 10, gap: 8 });
    this.ready.visible = false;
    this.addChild(this.ready, box, this.tick, this.reveal);

    // Two strokes of a marker, the second a hair off the first, like a quick double pass.
    const pts: readonly number[] = [-0.3, 0.0, -0.1, 0.27, 0.36, -0.34];
    const pass = (dx: number, dy: number, width: number, alpha: number): void => {
      this.tick.moveTo(pts[0] as number * s + dx, pts[1] as number * s + dy);
      for (let i = 2; i < pts.length; i += 2) this.tick.lineTo(pts[i] as number * s + dx, pts[i + 1] as number * s + dy);
      this.tick.stroke({ width, color: Color.leafDark, alpha, cap: 'round', join: 'round' });
    };
    pass(0, 0, s * 0.15, 1);
    pass(1.6, 1.2, s * 0.06, 0.45);
    // The mask uncovers the stroke from left to right: scale.x runs 0 -> 1 about the left edge.
    this.reveal.rect(0, -s / 2, s, s).fill(Color.ink);
    this.reveal.position.set(-s / 2, 0);
    this.tick.mask = this.reveal;
    this.tick.visible = false;
  }

  setReady(ready: boolean): void {
    this.ready.visible = ready;
  }

  /** Show or clear the check; `animate` writes it in. */
  setDone(done: boolean, animate: boolean): void {
    if (done === this.done) return;
    this.done = done;
    this.bag.killAll();
    this.tick.visible = done;
    this.reveal.scale.x = 1;
    if (!done || !animate || motion.reduced) return;
    this.reveal.scale.x = 0;
    this.bag.run({
      duration: 0.22,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        this.reveal.scale.x = k;
      },
      onComplete: () => {
        this.reveal.scale.x = 1;
      },
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }
}

export interface StampOpts {
  /** The stamped word. Omit for a round check stamp. */
  text?: string;
  /** Font size of the word (default 26) or half the diameter of the check stamp (default 34). */
  size?: number;
  /** Widest the word may make the stamp. */
  maxWidth?: number;
  color?: number;
  /** Tilt in radians (a stamp is never put down straight). */
  tilt?: number;
}

/** A rubber stamp pressed onto the paper: a ring or a double frame in ink, with a word or a check. Origin = centre. */
export class StampMark extends Container {
  private readonly bag = new TweenBag();

  constructor(o: StampOpts = {}) {
    super();
    const color = o.color ?? Color.leafDark;
    const g = new Graphics();
    if (o.text !== undefined) {
      const size = o.size ?? 26;
      const t = uiLabel(o.text, { size, color });
      const w = Math.min(o.maxWidth ?? 260, Math.ceil(t.width) + 40);
      if (t.width > w - 40) t.scale.set((w - 40) / t.width);
      const h = Math.round(size * 1.15) + 20;
      g.roundRect(-w / 2, -h / 2, w, h, 12).stroke({ width: 4, color, alpha: 0.92, join: 'round' });
      g.roundRect(-w / 2 + 7, -h / 2 + 7, w - 14, h - 14, 7).stroke({ width: 1.8, color, alpha: 0.7, join: 'round' });
      this.addChild(g, t);
    } else {
      const r = o.size ?? 34;
      g.circle(0, 0, r).stroke({ width: 4, color, alpha: 0.92 });
      g.circle(0, 0, r - 7).stroke({ width: 1.8, color, alpha: 0.7 });
      this.addChild(g, drawIcon('check', r * 1.1, color, { outline: color }));
    }
    this.rotation = o.tilt ?? -0.12;
  }

  /** The press: it drops from a little above, lands with a squash, and settles. */
  slam(): void {
    this.bag.killAll();
    slammedAt = game.time;
    settledAt = game.time + (motion.reduced ? 0 : SLAM_SECONDS);
    if (motion.reduced) {
      this.scale.set(1);
      this.alpha = 1;
      stampThud();
      return;
    }
    // The knock is heard on the frame the stamp meets the paper (53 % of the fall below).
    this.bag.call(SLAM_SECONDS * 0.53, stampThud);
    this.scale.set(1.9);
    this.alpha = 0;
    this.bag.run({
      duration: SLAM_SECONDS,
      ease: Ease.linear,
      onUpdate: (k) => {
        if (k < 0.53) {
          const d = Ease.cubicIn(k / 0.53);
          this.scale.set(1.9 - 0.95 * d);
          this.alpha = Math.min(1, d * 3);
        } else {
          this.scale.set(0.95 + 0.05 * Ease.cubicOut((k - 0.53) / 0.47));
        }
      },
      onComplete: () => {
        this.scale.set(1);
        this.alpha = 1;
      },
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }
}
