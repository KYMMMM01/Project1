/**
 * Banners over the field: wave start, call-next, act clear, boss warning band, big celebrations and
 * small captions. Each lane owns one pooled view and a BannerQueue; nothing here pauses or blocks play.
 */
import { Container, Graphics, Sprite, type Text } from 'pixi.js';
import { Ease } from '@/core/tween';
import { fxTexture } from '@/fx';
import { drawIcon, type IconName } from '@/ui/icons';
import { fitWidth, label } from '@/ui/text';
import { Color } from '@/ui/theme';
import type { BattleLayout } from '../context';
import { BannerQueue, type BannerItem } from './policy';
import type { Stage } from './stage';

export interface BannerSpec {
  title: string;
  sub?: string;
  /** Accent colour: frame, icon glow, title tint of the big lane. */
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

const MAX_TEXT = 640;

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

/** A rounded plate with an optional icon and one line of text: the wave banner and the captions. */
class PillLane implements Lane {
  readonly root = new Container();
  readonly queue = new BannerQueue<BannerSpec>(3);
  private readonly bg = new Graphics();
  private readonly text: Text;
  private icon: Graphics | null = null;
  private plateW = 0;
  private baseY = 0;
  /** Scale that fits the current title to the plate; the pop animation multiplies it. */
  private fit = 1;

  constructor(
    private readonly stage: Stage,
    private readonly icons: IconCache,
    size: number,
    private readonly height: number,
    private readonly rise: number,
    private readonly yOffset: number,
  ) {
    this.text = label('', { size, color: Color.text });
    this.root.addChild(this.bg, this.text);
    this.root.visible = false;
    this.root.eventMode = 'none';
  }

  show(spec: BannerSpec): void {
    const t = this.text;
    t.text = spec.title;
    fitWidth(t, MAX_TEXT);
    this.fit = t.scale.x;
    this.icon?.parent?.removeChild(this.icon);
    this.icon = spec.icon ? this.icons.get(spec.icon, this.height * 0.62) : null;
    const iconW = this.icon ? this.height * 0.62 + 14 : 0;
    this.plateW = t.width + iconW + 70;
    const h = this.height;
    this.bg
      .clear()
      .roundRect(-this.plateW / 2, -h / 2, this.plateW, h, h / 2)
      .fill({ color: Color.bgDeep, alpha: 0.82 })
      .roundRect(-this.plateW / 2, -h / 2, this.plateW, h, h / 2)
      .stroke({ width: 3, color: spec.color, alpha: 0.95 });
    t.x = iconW / 2;
    if (this.icon) {
      this.icon.position.set(-this.plateW / 2 + 35 + this.height * 0.31, 0);
      this.root.addChild(this.icon);
    }
  }

  pose: Pose = (phase, p, age) => {
    const r = this.root;
    r.visible = true;
    if (this.stage.reduced) {
      r.y = this.baseY;
      r.alpha = phase === 'in' ? p : phase === 'out' ? 1 - p : 1;
      this.text.scale.set(this.fit);
      return;
    }
    if (phase === 'in') {
      r.y = this.baseY - this.rise * (1 - Ease.cubicOut(p));
      r.alpha = Math.min(1, p * 3);
      const s = 1.3 - 0.3 * Ease.backOut(Math.min(1, age / 0.2));
      this.text.scale.set(s * this.fit);
    } else if (phase === 'hold') {
      r.y = this.baseY;
      r.alpha = 1;
      this.text.scale.set(this.fit);
    } else {
      r.y = this.baseY - this.rise * 0.45 * Ease.cubicIn(p);
      r.alpha = 1 - Ease.cubicIn(p);
    }
  };

  resize(layout: BattleLayout): void {
    this.root.x = layout.w / 2;
    this.baseY = layout.fieldY + this.yOffset;
    this.root.y = this.baseY;
  }
}

/** The boss / elite warning: a hazard-stripe band that slides across with an icon, the word and the name. */
class BandLane implements Lane {
  readonly root = new Container();
  readonly queue = new BannerQueue<BannerSpec>(2);
  private readonly bg = new Graphics();
  private readonly title: Text;
  private readonly sub: Text;
  private readonly icon: Graphics;
  private width = 720;
  private baseY = 0;
  private drawnW = 0;

  constructor(
    private readonly stage: Stage,
    icons: IconCache,
  ) {
    this.title = label('', { size: 64, color: 0xffd23f, stroke: 0x4a0d0d, strokeWidth: 8 });
    this.sub = label('', { size: 38, color: Color.text });
    this.icon = icons.get('warning', 96);
    this.title.position.set(40, -22);
    this.sub.position.set(40, 38);
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
    this.title.style.fill = spec.color;
    this.drawBand();
  }

  private drawBand(): void {
    if (this.drawnW === this.width) return;
    this.drawnW = this.width;
    const w = this.width;
    const h = 150;
    const edge = 24;
    const g = this.bg.clear();
    g.rect(-w / 2, -h / 2, w, h).fill({ color: 0x1c0a0e, alpha: 0.86 });
    for (const y of [-h / 2, h / 2 - edge]) {
      g.rect(-w / 2, y, w, edge).fill({ color: 0x15100a });
      for (let x = -w / 2 - edge; x < w / 2; x += edge * 2) {
        g.poly([x, y + edge, x + edge, y, x + edge * 2, y, x + edge, y + edge]).fill({ color: 0xffc933 });
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
    this.baseY = layout.fieldY + 236;
    this.root.y = this.baseY;
    this.icon.x = -250;
    this.drawBand();
  }
}

/** Big centre-screen text with rotating rays: act clear, boss defeated, victory. */
class BigLane implements Lane {
  readonly root = new Container();
  readonly queue = new BannerQueue<BannerSpec>(3);
  private readonly rays = new Sprite(fxTexture('starburst'));
  /** A dark soft plate: the title stays readable on a bright floor and the rays have something to glow against. */
  private readonly plate = new Sprite(fxTexture('glow'));
  private readonly title: Text;
  private readonly sub: Text;
  private baseY = 0;

  constructor(private readonly stage: Stage) {
    this.plate.anchor.set(0.5);
    this.plate.tint = Color.bgDeep;
    this.plate.alpha = 0.6;
    this.plate.width = 760;
    this.plate.height = 260;
    this.rays.anchor.set(0.5);
    this.rays.blendMode = 'add';
    this.rays.width = this.rays.height = 560;
    this.title = label('', { size: 84, color: Color.gold, strokeWidth: 12 });
    this.sub = label('', { size: 34, color: Color.text });
    this.sub.y = 68;
    this.root.addChild(this.plate, this.rays, this.title, this.sub);
    this.root.visible = false;
    this.root.eventMode = 'none';
  }

  show(spec: BannerSpec): void {
    this.title.text = spec.title;
    this.title.style.fill = spec.color;
    fitWidth(this.title, 660);
    this.sub.text = spec.sub ?? '';
    this.rays.tint = spec.color;
  }

  pose: Pose = (phase, p, age) => {
    const r = this.root;
    r.visible = true;
    r.y = this.baseY;
    if (this.stage.reduced) {
      this.rays.visible = false;
      r.alpha = phase === 'in' ? p : phase === 'out' ? 1 - p : 1;
      r.scale.set(1);
      return;
    }
    this.rays.visible = true;
    this.rays.rotation = age * 0.35;
    if (phase === 'in') {
      // Guide U-12: 0 -> 1.25 -> 1 with an overshoot, 400 ms.
      r.scale.set(0.001 + Ease.backOut(p) * 1.0);
      r.alpha = Math.min(1, p * 4);
      this.rays.alpha = 0.55 * p;
    } else if (phase === 'hold') {
      r.scale.set(1 + 0.04 * p);
      r.alpha = 1;
      this.rays.alpha = 0.55;
    } else {
      r.scale.set(1.04 + 0.1 * Ease.cubicIn(p));
      r.alpha = 1 - Ease.cubicIn(p);
      this.rays.alpha = 0.55 * (1 - p);
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
      top: new PillLane(stage, this.icons, 40, 78, 100, 60),
      caption: new PillLane(stage, this.icons, 28, 54, 36, 126),
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
