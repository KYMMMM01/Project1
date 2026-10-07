/**
 * Banners over the field, all made of paper: wave start, call-next, act clear, boss warning ribbon, big
 * celebrations and small captions. Each lane owns one pooled view and a BannerQueue; nothing here
 * pauses or blocks play. Paper colour = the banner's accent, text = dark ink, one strip of tape at most.
 */
import { Container, Graphics, Sprite, type Text } from 'pixi.js';
import { Ease } from '@/core/tween';
import { mixColor } from '@/core/math';
import { fxTexture } from '@/fx';
import { PATH_TOP } from '@/game/geometry';
import { Hue } from '@/fx/palette';
import { drawIcon, type IconName } from '@/ui/icons';
import { drawPaper, paperSeed, tapeStrip } from '@/ui/paper';
import { fitWidth, label } from '@/ui/text';
import { Color } from '@/ui/theme';
import type { BattleLayout } from '../context';
import { BANNER_CAPTION_H, BANNER_TOP_H, bannerSlots } from '../layout';
import { BannerQueue, type BannerItem } from './policy';
import type { Stage } from './stage';

export interface BannerSpec {
  title: string;
  sub?: string;
  /** The paper colour of the label, ribbon or band. */
  color: number;
  icon?: IconName;
}

type Pose = (phase: 'in' | 'hold' | 'out', p: number, age: number) => void;

interface Lane {
  readonly root: Container;
  readonly queue: BannerQueue<BannerSpec>;
  show(spec: BannerSpec): void;
  pose: Pose;
  resize(layout: BattleLayout): void;
}

const INK = Color.inkDeep;
/** The torn ends of a label need this much paper beside the text (and the icon). */
const LABEL_SIDE = 30;

/** Icons are built once per name and moved between lanes: no Graphics churn per banner. */
class IconCache {
  private readonly cache = new Map<string, Graphics>();

  get(name: IconName, size: number): Graphics {
    const key = name + size;
    let g = this.cache.get(key);
    if (!g) {
      g = drawIcon(name, size);
      this.cache.set(key, g);
    }
    return g;
  }

  destroy(): void {
    for (const g of this.cache.values()) if (!g.destroyed) g.destroy();
    this.cache.clear();
  }
}

/**
 * A torn paper label with an optional icon and one line of ink: the wave banner and the captions. Both
 * rows live in the free band between the top HUD and the board's sheet (`bannerSlots`), so they drop in
 * a few pixels and settle with a small tilt instead of travelling over the board.
 */
class PillLane implements Lane {
  readonly root = new Container();
  readonly queue = new BannerQueue<BannerSpec>(3);
  private readonly bg = new Graphics();
  private readonly text: Text;
  private readonly tape: Graphics | null;
  private readonly seed = paperSeed();
  private icon: Graphics | null = null;
  private plateW = 0;
  private baseY = 0;
  /** Scale that fits the band (`bannerSlots`); the pop animation multiplies it. */
  private baseScale = 1;
  /** Scale that fits the current title to the plate. */
  private fit = 1;

  constructor(
    private readonly stage: Stage,
    private readonly icons: IconCache,
    size: number,
    private readonly height: number,
    private readonly rise: number,
    private readonly slot: 'topY' | 'captionY',
    private readonly maxText: number,
    taped: boolean,
  ) {
    this.text = label('', { size, color: INK });
    this.tape = taped ? tapeStrip({ name: 'pink', pattern: 'gingham', w: 54, h: 18, angle: -8 }) : null;
    this.root.addChild(this.bg, this.text);
    if (this.tape) this.root.addChild(this.tape);
    this.root.visible = false;
    this.root.eventMode = 'none';
  }

  show(spec: BannerSpec): void {
    const t = this.text;
    t.text = spec.title;
    fitWidth(t, this.maxText);
    this.fit = t.scale.x;
    this.icon?.parent?.removeChild(this.icon);
    const iconSize = this.height * 0.66;
    this.icon = spec.icon ? this.icons.get(spec.icon, iconSize) : null;
    const iconW = this.icon ? iconSize + 12 : 0;
    this.plateW = t.width + iconW + LABEL_SIDE * 2;
    const h = this.height;
    this.bg.clear();
    drawPaper(this.bg, -this.plateW / 2, -h / 2, { w: this.plateW, h, radius: 12, fill: spec.color, seed: this.seed, torn: ['left', 'right'], shadow: 5 });
    t.x = iconW / 2;
    if (this.icon) {
      this.icon.position.set(-this.plateW / 2 + LABEL_SIDE + iconSize / 2, 0);
      this.root.addChild(this.icon);
    }
    this.tape?.position.set(-this.plateW / 2 + 40, -h / 2 + 6);
  }

  pose: Pose = (phase, p, age) => {
    const r = this.root;
    r.visible = true;
    this.text.scale.set(this.fit);
    if (this.stage.reduced) {
      r.y = this.baseY;
      r.rotation = 0;
      r.scale.set(this.baseScale);
      r.alpha = phase === 'in' ? p : phase === 'out' ? 1 - p : 1;
      return;
    }
    let pop = 1;
    if (phase === 'in') {
      r.y = this.baseY - this.rise * (1 - Ease.cubicOut(p));
      r.rotation = -0.06 * (1 - Ease.backOut(Math.min(1, age / 0.24)));
      r.alpha = Math.min(1, p * 3);
      pop = 0.88 + 0.12 * Ease.backOut(p);
    } else if (phase === 'hold') {
      r.y = this.baseY;
      r.rotation = 0;
      r.alpha = 1;
    } else {
      r.y = this.baseY - this.rise * 0.5 * Ease.cubicIn(p);
      r.rotation = 0.03 * Ease.cubicIn(p);
      r.alpha = 1 - Ease.cubicIn(p);
    }
    r.scale.set(this.baseScale * pop);
  };

  resize(layout: BattleLayout): void {
    const slots = bannerSlots(layout);
    this.root.x = layout.w / 2;
    this.baseScale = slots.scale;
    this.root.scale.set(slots.scale);
    this.baseY = slots[this.slot];
    this.root.y = this.baseY;
  }
}

/** The warning ribbon is a slim strip (hazard tape 16 px a side, 68 px of text between): two board rows used to disappear under the old 150 px one. */
const BAND_H = 100;
const BAND_EDGE = 16;

/** The boss / elite warning: a paper ribbon with hazard tape along both edges that slides across with an icon, the word and the name. */
class BandLane implements Lane {
  readonly root = new Container();
  readonly queue = new BannerQueue<BannerSpec>(2);
  private readonly bg = new Graphics();
  private readonly title: Text;
  private readonly sub: Text;
  private readonly icon: Graphics;
  private readonly seed = paperSeed();
  private width = 720;
  private baseY = 0;
  private drawnW = 0;
  private drawnColor = -1;
  private color: number = Color.berry;

  constructor(
    private readonly stage: Stage,
    icons: IconCache,
  ) {
    this.title = label('', { size: 42, color: INK });
    this.sub = label('', { size: 26, color: INK });
    this.icon = icons.get('warning', 96);
    this.icon.scale.set(0.68);
    this.title.position.set(40, -13);
    this.sub.position.set(40, 23);
    this.icon.position.set(-250, 0);
    this.root.addChild(this.bg, this.icon, this.title, this.sub);
    this.root.visible = false;
    this.root.eventMode = 'none';
  }

  show(spec: BannerSpec): void {
    this.title.text = spec.title;
    this.sub.text = spec.sub ?? '';
    fitWidth(this.sub, 520);
    fitWidth(this.title, 420);
    this.color = spec.color;
    this.drawBand();
  }

  private drawBand(): void {
    if (this.drawnW === this.width && this.drawnColor === this.color) return;
    this.drawnW = this.width;
    this.drawnColor = this.color;
    const w = this.width;
    const h = BAND_H;
    const edge = BAND_EDGE;
    const g = this.bg.clear();
    drawPaper(g, -w / 2 - 40, -h / 2, { w: w + 80, h, radius: 4, fill: this.color, seed: this.seed, wobble: 0.5, edge: false, shadow: 8 });
    // Hazard tape along the long edges: ink strips with mustard slants, flat.
    for (const y of [-h / 2, h / 2 - edge]) {
      g.rect(-w / 2 - 40, y, w + 80, edge).fill(Color.inkDeep);
      for (let x = -w / 2 - edge; x < w / 2 + 40; x += edge * 2) {
        g.poly([x, y + edge, x + edge, y, x + edge * 2, y, x + edge, y + edge]).fill(Color.mustard);
      }
    }
  }

  pose: Pose = (phase, p, age) => {
    const r = this.root;
    r.visible = true;
    const w = this.width;
    if (phase === 'in') r.x = this.baseX() - w * 1.1 * (1 - Ease.expoOut(p));
    else if (phase === 'hold') r.x = this.baseX();
    else r.x = this.baseX() + w * 1.1 * Ease.cubicIn(p);
    r.y = this.baseY;
    r.alpha = 1;
    // The icon blinks at 1.5 Hz: a cue that does not depend on colour, and well under the 3 Hz flash limit.
    this.icon.alpha = this.stage.reduced ? 1 : 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(age * Math.PI * 3));
  };

  private baseX(): number {
    return this.width / 2;
  }

  resize(layout: BattleLayout): void {
    this.width = layout.w;
    // On the enemy lane's top run: the ribbon announces what is about to walk it and keeps off the board's first row.
    this.baseY = layout.fieldY + PATH_TOP - 6;
    this.root.y = this.baseY;
    this.icon.x = -250;
    this.drawBand();
  }
}

/** Big centre-screen paper ribbon that unrolls over a flat paper sunburst: act clear, boss defeated, victory. */
class BigLane implements Lane {
  readonly root = new Container();
  readonly queue = new BannerQueue<BannerSpec>(3);
  private readonly burst = new Sprite(fxTexture('sun'));
  private readonly ribbon = new Container();
  private readonly paper = new Graphics();
  private readonly tape = tapeStrip({ name: 'sky', pattern: 'dots', w: 96, h: 32, angle: -6 });
  private readonly title: Text;
  private readonly sub: Text;
  private readonly seed = paperSeed();
  private baseY = 0;

  constructor(private readonly stage: Stage) {
    this.burst.anchor.set(0.5);
    this.burst.width = this.burst.height = 600;
    this.title = label('', { size: 84, color: INK });
    this.sub = label('', { size: 34, color: INK });
    this.ribbon.addChild(this.paper, this.title, this.sub, this.tape);
    this.root.addChild(this.burst, this.ribbon);
    this.root.visible = false;
    this.root.eventMode = 'none';
  }

  show(spec: BannerSpec): void {
    this.title.text = spec.title;
    fitWidth(this.title, 600);
    this.sub.text = spec.sub ?? '';
    const sub = this.sub.text !== '';
    const w = Math.max(360, this.title.width + 150);
    const h = sub ? 176 : 138;
    this.paper.clear();
    drawPaper(this.paper, -w / 2, -h / 2, { w, h, radius: 12, fill: spec.color, seed: this.seed, torn: ['left', 'right'], shadow: 9 });
    this.title.y = sub ? -22 : 0;
    this.sub.y = 46;
    this.sub.visible = sub;
    this.tape.position.set(-w / 2 + 70, -h / 2 + 4);
    this.burst.tint = mixColor(spec.color, Hue.cream, 0.35);
  }

  pose: Pose = (phase, p, age) => {
    const r = this.root;
    r.visible = true;
    r.y = this.baseY;
    if (this.stage.reduced) {
      this.burst.visible = false;
      this.ribbon.scale.set(1);
      r.alpha = phase === 'in' ? p : phase === 'out' ? 1 - p : 1;
      r.scale.set(1);
      return;
    }
    this.burst.visible = true;
    this.burst.rotation = age * 0.25;
    r.alpha = 1;
    if (phase === 'in') {
      // The ribbon unrolls from the middle while the sunburst pops behind it (guide U-12: 0 -> 1.25 -> 1, 400 ms).
      this.ribbon.scale.set(Math.max(0.001, Ease.expoOut(p)), 1);
      this.burst.scale.set((0.2 + 0.8 * Ease.backOut(p)) * (600 / this.burst.texture.width));
      this.burst.alpha = Math.min(1, p * 3);
      r.scale.set(1);
    } else if (phase === 'hold') {
      this.ribbon.scale.set(1 + 0.02 * p, 1 + 0.02 * p);
      this.burst.scale.set((1 + 0.03 * p) * (600 / this.burst.texture.width));
      this.burst.alpha = 1;
      r.scale.set(1);
    } else {
      this.ribbon.scale.set(1.02, 1.02);
      r.scale.set(1 + 0.1 * Ease.cubicIn(p));
      r.alpha = 1 - Ease.cubicIn(p);
    }
  };

  resize(layout: BattleLayout): void {
    this.root.x = layout.w / 2;
    this.baseY = layout.fieldY + 330;
    this.root.y = this.baseY;
  }
}

export type LaneId = 'top' | 'caption' | 'alert' | 'big';

export class BannerService {
  private readonly icons = new IconCache();
  private readonly lanes: Record<LaneId, Lane>;
  private readonly host = new Container();

  constructor(stage: Stage) {
    this.lanes = {
      top: new PillLane(stage, this.icons, 34, BANNER_TOP_H, 8, 'topY', 520, true),
      caption: new PillLane(stage, this.icons, 26, BANNER_CAPTION_H, 8, 'captionY', 560, false),
      alert: new BandLane(stage, this.icons),
      big: new BigLane(stage),
    };
    this.host.eventMode = 'none';
    this.host.label = 'director-banners';
    for (const id of Object.keys(this.lanes) as LaneId[]) {
      const lane = this.lanes[id];
      this.host.addChild(lane.root);
      lane.queue.onStart = (item) => lane.show(item.payload);
    }
    stage.ctx.layers.overlay.addChild(this.host);
    this.resize(stage.ctx.layout);
  }

  /** Queue a banner on `lane`. Timings are in seconds: entrance, hold, exit. */
  push(lane: LaneId, key: string, priority: number, spec: BannerSpec, hold: number, inS = 0.18, outS = 0.18): void {
    const item: BannerItem<BannerSpec> = { key, priority, inS, holdS: hold, outS, payload: spec };
    this.lanes[lane].queue.push(item);
  }

  update(dt: number): void {
    for (const id of Object.keys(this.lanes) as LaneId[]) {
      const lane = this.lanes[id];
      const q = lane.queue;
      q.update(dt);
      const phase = q.phase;
      if (phase === 'idle') {
        lane.root.visible = false;
        continue;
      }
      const c = q.active as BannerItem<BannerSpec>;
      const age = phase === 'in' ? q.progress * c.inS : phase === 'hold' ? c.inS + q.progress * c.holdS : c.inS + c.holdS + q.progress * c.outS;
      lane.pose(phase, q.progress, age);
    }
  }

  resize(layout: BattleLayout): void {
    for (const id of Object.keys(this.lanes) as LaneId[]) this.lanes[id].resize(layout);
  }

  /**
   * The warning ribbon dressed for `spec` and handed back unshown: the warm-up draws it once ahead of time, so its first draw (the paper, the
   * hazard tape, two texts) is not in the frame the warning arrives in. Null while a ribbon is up or waiting, and once the service is gone.
   */
  dressBand(spec: BannerSpec): Container | null {
    const lane = this.lanes.alert;
    if (this.host.destroyed || lane.queue.length > 0) return null;
    lane.show(spec);
    return lane.root;
  }

  /** Banners on screen plus waiting, over all lanes. */
  depth(): number {
    let n = 0;
    for (const id of Object.keys(this.lanes) as LaneId[]) n += this.lanes[id].queue.length;
    return n;
  }

  /** Drop everything on screen and waiting (the run ended or restarted). */
  clear(): void {
    for (const id of Object.keys(this.lanes) as LaneId[]) {
      this.lanes[id].queue.clear();
      this.lanes[id].root.visible = false;
    }
  }

  destroy(): void {
    this.host.destroy({ children: true });
    this.icons.destroy();
  }
}
