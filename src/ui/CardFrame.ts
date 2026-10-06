import { Container, Graphics, Sprite, type DestroyOptions, type Text, type Texture } from 'pixi.js';
import { lerp } from '@/core/math';
import { Ease } from '@/core/tween';
import { hsvToColor, shade } from './colors';
import { drawIcon } from './icons';
import type { Box } from './layoutMath';
import { motion, TweenBag } from './motion';
import { ProgressBar } from './ProgressBar';
import { cacheStatic, drawGlow, drawShadow, glossGradient, vGradient } from './shapes';
import { Tag } from './Tag';
import { fitLabel, uiLabel } from './text';
import { Color, Rarity, rarityIndex, type RarityId } from './theme';

export type CardSize = 'small' | 'medium' | 'large';

interface Metrics {
  w: number;
  h: number;
  radius: number;
  name: number;
  level: number;
  bar: number;
  plate: number;
  pip: number;
}

const METRICS: Record<CardSize, Metrics> = {
  small: { w: 150, h: 200, radius: 20, name: 22, level: 20, bar: 24, plate: 74, pip: 4.5 },
  medium: { w: 220, h: 292, radius: 26, name: 28, level: 24, bar: 28, plate: 88, pip: 5.5 },
  large: { w: 320, h: 424, radius: 34, name: 38, level: 30, bar: 34, plate: 116, pip: 7 },
};

export interface CardFrameOpts {
  rarity: RarityId;
  size?: CardSize;
  /** Artwork: a display object (animated sprite, vector drawing) or a texture. It is fitted into the window. */
  portrait?: Container | Texture;
  name?: string;
  level?: number;
  /** "Lv." prefix etc. are the caller's job: pass the exact text to show on the level badge. */
  levelText?: string;
  /** Copies owned / copies needed for the next upgrade; shows the small progress bar. */
  owned?: number;
  needed?: number;
  /** Text for the NEW tag; omit to hide it. */
  newTag?: string;
}

/**
 * Unit card plate. Origin = centre. The rarity decides everything visual: gradient and border from
 * the Rarity tokens, extra ornament per tier (inner line, corner gems, crown, star), a slow shine on
 * legendary and a colour-cycling border on mythic. Pip count under the window repeats the tier so the
 * rarity is never conveyed by colour alone.
 */
export class CardFrame extends Container {
  readonly uiBox: Box;
  readonly size: CardSize;
  readonly rarity: RarityId;
  /** Portrait window rectangle in local coordinates. */
  readonly windowRect: { x: number; y: number; w: number; h: number };

  private readonly m: Metrics;
  private readonly bag = new TweenBag();
  private readonly art = new Container();
  private readonly portraitHost = new Container();
  private readonly overlay = new Container();
  private nameT: Text | null = null;
  private levelBadge: Container | null = null;
  private bar: ProgressBar | null = null;
  private newTag: Tag | null = null;
  private portrait: Container | null = null;
  private hasBar = false;

  constructor(opts: CardFrameOpts) {
    super();
    this.size = opts.size ?? 'medium';
    this.rarity = opts.rarity;
    const m = METRICS[this.size];
    this.m = m;
    this.uiBox = { x: -m.w / 2, y: -m.h / 2, w: m.w, h: m.h };
    const wx = -m.w / 2 + 11;
    const wy = -m.h / 2 + 11;
    this.windowRect = { x: wx, y: wy, w: m.w - 22, h: m.h - m.plate - 11 - 6 };

    this.drawArt();
    const mask = new Graphics();
    mask.roundRect(this.windowRect.x, this.windowRect.y, this.windowRect.w, this.windowRect.h, m.radius * 0.6).fill(0xffffff);
    this.portraitHost.mask = mask;
    this.addChild(this.art, this.portraitHost, mask, this.overlay);
    this.buildOverlay();

    if (opts.portrait) this.setPortrait(opts.portrait);
    this.setName(opts.name ?? '');
    if (opts.levelText !== undefined) this.setLevel(opts.levelText);
    if (opts.needed !== undefined) this.setProgress(opts.owned ?? 0, opts.needed);
    if (opts.newTag) this.setNew(opts.newTag);
  }

  /** Replace the artwork. Pass null to clear. */
  setPortrait(src: Container | Texture | null): void {
    if (this.portrait) {
      this.portrait.destroy({ children: true });
      this.portrait = null;
    }
    if (!src) return;
    const node = src instanceof Container ? src : new Sprite(src);
    if (node instanceof Sprite) node.anchor.set(0.5);
    const w = this.windowRect;
    const b = node.getLocalBounds();
    const k = Math.min((w.w * 0.92) / Math.max(1, b.width), (w.h * 0.92) / Math.max(1, b.height));
    node.scale.set(k);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    node.position.set(w.x + w.w / 2 - cx * k, w.y + w.h / 2 - cy * k);
    this.portraitHost.addChild(node);
    this.portrait = node;
  }

  setName(text: string): void {
    this.nameT?.destroy();
    const m = this.m;
    const t = uiLabel(text, { size: m.name, strokeWidth: Math.max(4, m.name * 0.16), shadow: false });
    fitLabel(t, m.w - 28, m.name);
    // The name sits in the upper part of the plate; centred when there is no progress bar.
    const plateTop = m.h / 2 - m.plate - 6;
    const rowH = this.hasBar ? m.plate - m.bar - 20 : m.plate - 14;
    t.position.set(0, plateTop + 8 + rowH / 2);
    this.overlay.addChild(t);
    this.nameT = t;
  }

  /** Text on the corner level badge (e.g. "Lv.5"). Empty string hides it. */
  setLevel(text: string): void {
    this.levelBadge?.destroy({ children: true });
    this.levelBadge = null;
    if (!text) return;
    const m = this.m;
    const rar = Rarity[this.rarity];
    const t = uiLabel(text, { size: m.level, strokeWidth: 4, shadow: false });
    const w = t.width + 20;
    const h = m.level * 1.5;
    const c = new Container();
    const g = new Graphics();
    g.roundRect(-w / 2, -h / 2 + 3, w, h, h / 2).fill({ color: 0x07030f, alpha: 0.35 });
    g.roundRect(-w / 2, -h / 2, w, h, h / 2).fill(vGradient(shade(rar.color, 0.1), rar.dark)).stroke({ width: 4, color: Color.outline, alignment: 1 });
    g.roundRect(-w / 2 + 4, -h / 2 + 3, w - 8, h * 0.4, h * 0.2).fill(glossGradient(0.4, 0.05));
    c.addChild(g, t);
    c.position.set(-m.w / 2 + 14 + w / 2, -m.h / 2 + 14 + h / 2);
    this.overlay.addChild(c);
    this.levelBadge = c;
  }

  /** Copies owned vs needed for the next level. Ready (owned >= needed) turns the bar green. */
  setProgress(owned: number, needed: number): void {
    const m = this.m;
    const ready = owned >= needed;
    if (!this.bar) {
      this.hasBar = true;
      this.bar = new ProgressBar({ width: m.w - 30, height: m.bar, color: 'blue', label: '', ticks: 0 });
      this.bar.position.set(0, m.h / 2 - 14 - m.bar / 2 - 2);
      this.overlay.addChild(this.bar);
      if (this.nameT) this.setName(this.nameT.text);
    }
    this.bar.setColor(ready ? 'green' : 'blue');
    this.bar.setLabel(`${owned}/${needed}`);
    this.bar.setValue(needed > 0 ? owned / needed : 1, false);
  }

  /** Show / hide the NEW tag (pass the label text, or false to hide). */
  setNew(label: string | false): void {
    this.newTag?.destroy();
    this.newTag = null;
    if (!label) return;
    const t = new Tag({ text: label, style: 'danger', shape: 'flag', fontSize: this.size === 'small' ? 20 : 24, tilt: 0.14 });
    t.position.set(this.m.w / 2 - 22 - t.uiBox.w / 2 + 12, -this.m.h / 2 + 24);
    this.overlay.addChild(t);
    this.newTag = t;
    t.pop();
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }

  /* -------------------------------------------------------------- drawing */

  private drawArt(): void {
    const m = this.m;
    const rar = Rarity[this.rarity];
    const idx = rarityIndex(this.rarity);
    const g = new Graphics();
    const x = -m.w / 2;
    const y = -m.h / 2;

    if (idx >= 1) drawGlow(g, 0, 0, m.w * (0.62 + idx * 0.06), rar.glow, 0.16 + idx * 0.07);
    drawShadow(g, x, y, m.w, m.h, m.radius, { alpha: 0.42, spread: 12, offsetY: 8 });
    // Plate: tier colour, lit from the top.
    g.roundRect(x, y, m.w, m.h, m.radius)
      .fill(vGradient(rar.light, rar.dark))
      .stroke({ width: 5, color: Color.outline, alignment: 1, join: 'round' });
    g.roundRect(x + 5, y + 5, m.w - 10, m.h - 10, m.radius - 4).stroke({ width: 3, color: 0xffffff, alpha: 0.4, alignment: 1 });

    // Portrait window: a dark well with a soft tier-coloured spotlight.
    const wr = this.windowRect;
    g.roundRect(wr.x, wr.y, wr.w, wr.h, m.radius * 0.6)
      .fill(vGradient(shade(rar.dark, -0.55), shade(rar.dark, -0.2)))
      .stroke({ width: 4, color: Color.outline, alignment: 1 });
    drawGlow(g, 0, wr.y + wr.h * 0.5, Math.min(wr.w, wr.h) * 0.62, rar.glow, 0.55);
    g.roundRect(wr.x + 4, wr.y + 4, wr.w - 8, wr.h * 0.2, m.radius * 0.45).fill(glossGradient(0.16, 0));

    // Name plate
    const py = m.h / 2 - m.plate - 6;
    g.roundRect(x + 8, py, m.w - 16, m.plate, m.radius * 0.5)
      .fill(vGradient(0x2b1d52, 0x150c30))
      .stroke({ width: 4, color: Color.outline, alignment: 1 });
    g.roundRect(x + 12, py + 4, m.w - 24, 5, 2.5).fill({ color: rar.color, alpha: 0.9 });

    // Tier pips under the window: count = tier (repeats the colour for colour-blind players).
    const pipY = wr.y + wr.h - m.pip - 4;
    const pips = idx + 1;
    for (let i = 0; i < pips; i++) {
      const px = (i - (pips - 1) / 2) * (m.pip * 2.9);
      g.circle(px, pipY, m.pip + 1.5).fill(Color.outline);
      g.circle(px, pipY, m.pip).fill(rar.light);
    }

    // Tier ornament
    if (idx === 2) {
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          const cx = sx * (m.w / 2 - 9);
          const cy = sy * (m.h / 2 - 9);
          g.poly([cx, cy - 9, cx + 9, cy, cx, cy + 9, cx - 9, cy]).fill(rar.light).stroke({ width: 3, color: Color.outline, join: 'round' });
        }
      }
    }
    this.art.addChild(g);
    if (idx >= 3) {
      const ic = drawIcon(idx === 3 ? 'crown' : 'star', m.w * 0.27);
      ic.position.set(0, y + 2);
      this.art.addChild(ic);
    }
    cacheStatic(this.art);
  }

  private buildOverlay(): void {
    const m = this.m;
    const idx = rarityIndex(this.rarity);
    if (motion.reduced || idx < 3) return;
    // Slow diagonal shine over the whole plate (legendary and mythic).
    const host = new Container();
    const mask = new Graphics();
    mask.roundRect(-m.w / 2, -m.h / 2, m.w, m.h, m.radius).fill(0xffffff);
    const band = new Graphics();
    const bw = m.w * 0.28;
    const skew = m.h * 0.28;
    band
      .poly([-bw / 2 + skew, -m.h / 2, bw / 2 + skew, -m.h / 2, bw / 2 - skew, m.h / 2, -bw / 2 - skew, m.h / 2])
      .fill(glossGradient(0.42, 0.42));
    host.addChild(band);
    host.mask = mask;
    host.eventMode = 'none';
    this.addChild(host, mask);
    this.bag.runKeyed(band, {
      duration: 3.6,
      ease: Ease.linear,
      repeat: -1,
      onUpdate: (k) => {
        const t = Math.min(1, k * (3.6 / 1.0));
        band.x = lerp(-m.w * 0.9, m.w * 0.9, Ease.cubicInOut(t));
        band.alpha = t >= 1 ? 0 : 1;
      },
    });

    if (idx >= 4) {
      // Mythic: the border cycles through the spectrum.
      const ring = new Graphics();
      ring.roundRect(-m.w / 2, -m.h / 2, m.w, m.h, m.radius).stroke({ width: 7, color: 0xffffff, alignment: 1 });
      ring.roundRect(-m.w / 2 + 7, -m.h / 2 + 7, m.w - 14, m.h - 14, m.radius - 6).stroke({ width: 3, color: 0xffffff, alpha: 0.7, alignment: 1 });
      ring.eventMode = 'none';
      this.addChild(ring);
      this.bag.runKeyed(ring, {
        duration: 4,
        ease: Ease.linear,
        repeat: -1,
        onUpdate: (k) => {
          ring.tint = hsvToColor(k, 0.5, 1);
        },
      });
    }
  }
}
