import { Container, Graphics, Sprite, type DestroyOptions, type Text, type Texture } from 'pixi.js';
import { lerp } from '@/core/math';
import { Ease } from '@/core/tween';
import { chamferPoints, flamePoints, roundedPolyPath, wingPoints } from './cardShapes';
import { hsvToColor, shade } from './colors';
import { drawIcon } from './icons';
import type { Box } from './layoutMath';
import { motion, TweenBag } from './motion';
import { uiPrefs } from './prefs';
import { ProgressBar } from './ProgressBar';
import { rarityName } from './rarity';
import { RarityPips } from './RarityPips';
import { cacheStatic, drawGlow, drawShadow, glossGradient, vGradient } from './shapes';
import { Tag } from './Tag';
import { fitLabel, uiLabel } from './text';
import { Color, Rarity, rarityIndex, RARITY_ORDER, type RarityId } from './theme';

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
  /** How far wings / flame tips reach past the plate sideways. */
  over: number;
  /** How far the crown / star / flame crest reaches above the plate. */
  crest: number;
}

const METRICS: Record<CardSize, Metrics> = {
  small: { w: 150, h: 200, radius: 20, name: 22, level: 20, bar: 24, plate: 74, pip: 11, over: 9, crest: 20 },
  medium: { w: 220, h: 292, radius: 26, name: 28, level: 24, bar: 28, plate: 88, pip: 13, over: 14, crest: 30 },
  large: { w: 320, h: 424, radius: 34, name: 38, level: 30, bar: 34, plate: 116, pip: 17, over: 20, crest: 44 },
};

export interface CardFrameOpts {
  rarity: RarityId;
  size?: CardSize;
  /** Artwork: a display object (animated sprite, vector drawing) or a texture. It is fitted into the window and owned by the card (destroyed with it). */
  portrait?: Container | Texture;
  name?: string;
  /** Exact text for the level badge ("Lv.5"); the caller owns the "Lv." prefix. */
  levelText?: string;
  /** Copies owned / copies needed for the next upgrade; shows the small progress bar. */
  owned?: number;
  needed?: number;
  /** Text for the NEW tag; omit to hide it. */
  newTag?: string;
}

/**
 * Unit card plate. Origin = centre of the plate; `uiBox` also covers the ornaments that overhang it.
 * Rarity changes the frame itself, not just its colour: plain thin border (common), double line
 * (rare), chamfered corners with jewels (epic), wings and a crown (legendary), a flame crest and a
 * star with a colour-cycling border (mythic). The five-pip row under the window repeats the tier, and
 * with uiPrefs.colorAssist the themed rarity name is printed too, so colour is never the only cue.
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
    this.uiBox = { x: -m.w / 2 - m.over, y: -m.h / 2 - m.crest, w: m.w + m.over * 2, h: m.h + m.crest + 6 };
    const wx = -m.w / 2 + 11;
    const wy = -m.h / 2 + 11;
    this.windowRect = { x: wx, y: wy, w: m.w - 22, h: m.h - m.plate - 11 - 6 };

    this.drawArt();
    const mask = new Graphics();
    mask.roundRect(this.windowRect.x, this.windowRect.y, this.windowRect.w, this.windowRect.h, m.radius * 0.6).fill(0xffffff);
    this.portraitHost.mask = mask;
    this.addChild(this.art, this.portraitHost, mask, this.overlay);
    this.buildPips();
    this.buildShine();

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
    const small = this.size === 'small';
    // A compact capsule on small cards keeps clear of the level badge; a swallow-tail flag elsewhere.
    const t = new Tag({
      text: label,
      style: 'danger',
      shape: small ? 'pill' : 'flag',
      fontSize: small ? 20 : 24,
      tilt: small ? 0.1 : 0.14,
    });
    const m = this.m;
    if (small) t.position.set(m.w / 2 - t.uiBox.w / 2 - 2, -m.h / 2 + 4);
    else t.position.set(m.w / 2 + 10 - t.uiBox.w / 2, -m.h / 2 + 30);
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
    const chamfer = m.radius * 0.9;

    if (idx >= 1) drawGlow(g, 0, 0, m.w * (0.62 + idx * 0.06), rar.glow, 0.16 + idx * 0.07);

    // Legendary wings sit behind the plate; only their outer feathers show.
    if (idx === 3) {
      const gold = vGradient(rar.light, rar.dark);
      for (const side of [-1, 1] as const) {
        roundedPolyPath(g, wingPoints(side, side * (m.w / 2), y + m.h * 0.4, m.over + 6, m.h / 292), 2);
        g.fill(gold).stroke({ width: 4, color: Color.outline, join: 'round' });
      }
    }

    drawShadow(g, x, y, m.w, m.h, m.radius, { alpha: 0.42, spread: 12, offsetY: 8 });
    // Plate silhouette: tier colour, lit from the top.
    if (idx === 2) roundedPolyPath(g, chamferPoints(x, y, m.w, m.h, chamfer), 6);
    else if (idx === 4) roundedPolyPath(g, flamePoints(x, y, m.w, m.h, chamfer, m.over), 4);
    else g.roundRect(x, y, m.w, m.h, m.radius);
    g.fill(vGradient(rar.light, rar.dark)).stroke({ width: 5, color: Color.outline, alignment: 1, join: 'round' });

    // Inner line: plain cards stay single-bordered, every higher tier gets a second line.
    if (idx >= 1) {
      if (idx === 2 || idx === 4) roundedPolyPath(g, chamferPoints(x + 7, y + 7, m.w - 14, m.h - 14, chamfer - 4), 4);
      else g.roundRect(x + 7, y + 7, m.w - 14, m.h - 14, m.radius - 5);
      g.stroke({ width: 3, color: rar.light, alpha: 0.85, alignment: 1, join: 'round' });
    }

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

    // Epic jewels sit in the four cut corners.
    if (idx === 2) {
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          const cx = sx * (m.w / 2 - chamfer / 2 + 1);
          const cy = sy * (m.h / 2 - chamfer / 2 + 1);
          const r = m.radius * 0.36;
          g.poly([cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy]).fill(vGradient(0xfff0ff, rar.color)).stroke({ width: 3, color: Color.outline, join: 'round' });
        }
      }
    }
    this.art.addChild(g);
    if (idx >= 3) {
      const ic = drawIcon(idx === 3 ? 'crown' : 'star', m.w * 0.27);
      ic.position.set(0, y + (idx === 3 ? 2 : -4));
      this.art.addChild(ic);
    }
    cacheStatic(this.art);
  }

  /** Tier pips sit on the artwork: the lit count repeats the rarity so colour is never the only cue. */
  private buildPips(): void {
    const m = this.m;
    const wr = this.windowRect;
    const idx = rarityIndex(this.rarity);
    const pips = new RarityPips({ owned: RARITY_ORDER.map((_, i) => i <= idx), size: m.pip, gap: Math.round(m.pip * 0.38) });
    const y = wr.y + wr.h - m.pip - 3;
    const back = new Graphics();
    const b = pips.uiBox;
    back.roundRect(b.x - 5, -m.pip * 0.95, b.w + 10, m.pip * 1.9, m.pip * 0.95).fill({ color: 0x07030f, alpha: 0.5 });
    back.position.set(0, y);
    pips.position.set(0, y);
    this.overlay.addChild(back, pips);

    if (uiPrefs.colorAssist) {
      const name = uiLabel(rarityName(this.rarity), { size: Math.max(20, Math.round(m.name * 0.78)), strokeWidth: 4 });
      fitLabel(name, wr.w - 12, 22);
      name.position.set(0, y - m.pip - name.height / 2 - 2);
      this.overlay.addChild(name);
    }
  }

  /** Legendary and mythic plates glint now and then; mythic also cycles its border through the spectrum. */
  private buildShine(): void {
    const m = this.m;
    const idx = rarityIndex(this.rarity);
    if (motion.reduced || idx < 3) return;
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
    // Under the overlay: the glint and the border must never cover the name, level badge or NEW tag.
    const top = this.getChildIndex(this.overlay);
    this.addChildAt(host, top);
    this.addChildAt(mask, top);
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
      const ring = new Graphics();
      const x = -m.w / 2;
      const y = -m.h / 2;
      roundedPolyPath(ring, flamePoints(x, y, m.w, m.h, m.radius * 0.9, m.over), 4);
      ring.stroke({ width: 6, color: 0xffffff, alignment: 1, join: 'round' });
      roundedPolyPath(ring, chamferPoints(x + 7, y + 7, m.w - 14, m.h - 14, m.radius * 0.9 - 4), 4);
      ring.stroke({ width: 3, color: 0xffffff, alpha: 0.7, alignment: 1 });
      ring.eventMode = 'none';
      this.addChildAt(ring, this.getChildIndex(this.overlay));
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
