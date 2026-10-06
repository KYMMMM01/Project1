import { Container, Graphics, type DestroyOptions, type Text } from 'pixi.js';
import { ButtonPalettes, Color, MIN_FONT, type ButtonStyleId } from './theme';
import type { Box } from './layoutMath';
import { motion, popIn, TweenBag } from './motion';
import { makeRng } from './paperMath';
import { drawPaper, paperSeed } from './paper';
import { refreshCache } from './shapes';
import { fitLabel, uiLabel } from './text';

export type TagShape = 'flag' | 'pill' | 'burst';

export interface TagOpts {
  /** Already-translated text: "NEW", "x2", "BEST", "-30%". */
  text: string;
  style?: ButtonStyleId;
  /** flag = ribbon with a swallow-tail (BEST VALUE), pill = capsule (NEW), burst = starburst (-30%, x2). */
  shape?: TagShape;
  fontSize?: number;
  /** Tilt in radians; tags are usually hung slightly crooked so they read as stickers. */
  tilt?: number;
}

/** Label sticker. Origin = centre. */
export class Tag extends Container {
  readonly uiBox: Box = { x: 0, y: 0, w: 0, h: 0 };
  private readonly art = new Container();
  private readonly g = new Graphics();
  private textT: Text | null = null;
  private readonly bag = new TweenBag();
  private readonly style: ButtonStyleId;
  private readonly shape: TagShape;
  private readonly fontSize: number;
  private readonly seed = paperSeed();

  constructor(opts: TagOpts) {
    super();
    this.style = opts.style ?? 'danger';
    this.shape = opts.shape ?? 'pill';
    this.fontSize = Math.max(MIN_FONT, opts.fontSize ?? (this.shape === 'burst' ? 30 : 24));
    this.art.addChild(this.g);
    this.addChild(this.art);
    this.rotation = opts.tilt ?? 0;
    this.setText(opts.text);
  }

  setText(text: string): void {
    const pal = ButtonPalettes[this.style];
    this.textT?.destroy();
    this.g.clear();
    const t = uiLabel(text, { size: this.fontSize, color: pal.ink });
    this.textT = t;
    const tw = t.width;
    const th = this.fontSize * 1.1;

    if (this.shape === 'pill') {
      const w = Math.max(th + 28, tw + 34);
      const h = th + 16;
      drawPaper(this.g, -w / 2, -h / 2, { w, h, kind: 'pill', fill: pal.base, edge: pal.lip, seed: this.seed, shadow: 4, grain: false });
      this.setBox(w, h);
    } else if (this.shape === 'flag') {
      const w = tw + 52;
      const h = th + 22;
      const n = 14;
      const flag = [-w / 2, -h / 2, w / 2, -h / 2, w / 2 - n, 0, w / 2, h / 2, -w / 2, h / 2];
      this.g.poly(flag.map((v, i) => (i % 2 === 1 ? v + 4 : v))).fill({ color: Color.shadow, alpha: 0.22 });
      this.g.poly(flag).fill(pal.base).stroke({ width: 2, color: pal.lip, alpha: 0.6, alignment: 0, join: 'round' });
      t.position.x = -n / 2;
      this.setBox(w + 6, h + 6);
    } else {
      const r = Math.max(46, tw / 2 + 20);
      const rnd = makeRng(this.seed);
      const pts: number[] = [];
      const spikes = 14;
      for (let i = 0; i < spikes * 2; i++) {
        const a = (i * Math.PI) / spikes - Math.PI / 2;
        const rr = (i % 2 === 0 ? r : r * 0.84) + (rnd() - 0.5) * 3;
        pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      this.g.poly(pts.map((v, i) => (i % 2 === 1 ? v + 4 : v))).fill({ color: Color.shadow, alpha: 0.22 });
      this.g.poly(pts).fill(pal.base).stroke({ width: 2, color: pal.lip, alpha: 0.6, alignment: 0, join: 'round' });
      this.setBox(r * 2 + 6, r * 2 + 6);
    }
    fitLabel(t, this.uiBox.w - 26, this.fontSize);
    t.position.y = -1;
    this.art.addChild(t);
    refreshCache(this.art);
  }

  /** Pop the sticker onto its spot with a little overshoot. */
  pop(delay = 0): void {
    if (motion.reduced) return;
    popIn(this.bag, this, { duration: 0.28, delay, overshoot: 3 });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }

  private setBox(w: number, h: number): void {
    this.uiBox.x = -w / 2;
    this.uiBox.y = -h / 2;
    this.uiBox.w = w;
    this.uiBox.h = h;
  }
}
