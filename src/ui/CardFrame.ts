import { Container, Graphics, Sprite, type Text, type Texture } from 'pixi.js';
import { mixColor } from '@/core/math';
import { drawIcon } from './icons';
import type { Box } from './layoutMath';
import { drawDashedRect, drawPaper, drawPaperFace, paperSeed, tapeStrip } from './paper';
import { uiPrefs } from './prefs';
import { ProgressBar } from './ProgressBar';
import { rarityName } from './rarity';
import { RarityPips } from './RarityPips';
import { cacheStatic } from './shapes';
import { Tag } from './Tag';
import { fitLabel, uiLabel } from './text';
import { Color, Rarity, rarityIndex, RARITY_GOLD, RARITY_ORDER, type RarityId } from './theme';

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
  /** How far a corner sticker reaches past the frame sideways. */
  over: number;
  /** How far the tape / sticker reaches above the frame. */
  crest: number;
}

const METRICS: Record<CardSize, Metrics> = {
  small: { w: 150, h: 200, radius: 20, name: 22, level: 20, bar: 24, plate: 74, pip: 11, over: 8, crest: 14 },
  medium: { w: 220, h: 292, radius: 26, name: 28, level: 24, bar: 28, plate: 88, pip: 13, over: 10, crest: 18 },
  large: { w: 320, h: 424, radius: 34, name: 38, level: 30, bar: 34, plate: 116, pip: 17, over: 14, crest: 26 },
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
 * Unit card as a paper photo frame: a cream border round a mat in the rarity's matte colour, the
 * portrait in the window and the name on the cream below. Origin = centre of the frame; `uiBox` also
 * covers the tape and stickers that overhang it. Rarity adds ornaments, not just a colour: a dashed
 * inner line (rare), photo-corner mounts (epic), a strip of tape (legendary), a gold star sticker
 * (mythic). The five-pip row under the window repeats the tier, and with uiPrefs.colorAssist the
 * themed rarity name is printed too, so colour is never the only cue.
 */
export class CardFrame extends Container {
  readonly uiBox: Box;
  readonly size: CardSize;
  readonly rarity: RarityId;
  /** Portrait window rectangle in local coordinates. */
  readonly windowRect: { x: number; y: number; w: number; h: number };

  private readonly m: Metrics;
  private readonly seed = paperSeed();
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
    this.uiBox = { x: -m.w / 2 - m.over, y: -m.h / 2 - m.crest, w: m.w + m.over * 2, h: m.h + m.crest + 8 };
    const wx = -m.w / 2 + 13;
    const wy = -m.h / 2 + 13;
    this.windowRect = { x: wx, y: wy, w: m.w - 26, h: m.h - m.plate - 13 - 8 };

    this.drawArt();
    const mask = new Graphics();
    mask.roundRect(this.windowRect.x, this.windowRect.y, this.windowRect.w, this.windowRect.h, m.radius * 0.5).fill(0xffffff);
    this.portraitHost.mask = mask;
    this.addChild(this.art, this.portraitHost, mask, this.overlay);
    this.buildPips();

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
    const t = uiLabel(text, { size: m.name });
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
    const t = uiLabel(text, { size: m.level });
    const w = t.width + 22;
    const h = m.level * 1.5;
    const c = new Container();
    const g = new Graphics();
    drawPaper(g, -w / 2, -h / 2, { w, h, kind: 'pill', fill: Color.paperLight, edge: rar.dark, shadow: 3, grain: false, seed: this.seed + 4 });
    c.addChild(g, t);
    c.position.set(-m.w / 2 + 16 + w / 2, -m.h / 2 + 16 + h / 2);
    this.overlay.addChild(c);
    this.levelBadge = c;
  }

  /** Copies owned vs needed for the next level. Ready (owned >= needed) turns the bar green. */
  setProgress(owned: number, needed: number): void {
    const m = this.m;
    const ready = owned >= needed;
    if (!this.bar) {
      this.hasBar = true;
      this.bar = new ProgressBar({ width: m.w - 34, height: m.bar, color: 'blue', label: '', ticks: 0 });
      this.bar.position.set(0, m.h / 2 - 16 - m.bar / 2 - 2);
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

  /* -------------------------------------------------------------- drawing */

  private drawArt(): void {
    const m = this.m;
    const rar = Rarity[this.rarity];
    const idx = rarityIndex(this.rarity);
    const g = new Graphics();
    const x = -m.w / 2;
    const y = -m.h / 2;
    const seed = this.seed;
    const wr = this.windowRect;

    // The cream frame, then the mat in the rarity's colour, then the window the portrait shows through.
    drawPaper(g, x, y, { w: m.w, h: m.h, radius: m.radius, fill: Color.paperLight, edge: Color.kraftDark, shadow: 6, grain: false, seed });
    drawPaperFace(g, x + 8, y + 8, { w: m.w - 16, h: wr.h + 10, radius: m.radius * 0.7, fill: rar.color, edge: rar.dark, grain: false, seed: seed + 1, wobble: 0.7 });
    drawPaperFace(g, wr.x, wr.y, { w: wr.w, h: wr.h, radius: m.radius * 0.5, fill: mixColor(rar.light, Color.paper, 0.62), edge: rar.dark, grain: false, seed: seed + 2, wobble: 0.6 });

    // Ornaments pile up with the tier, so a rarity can be told without colour.
    if (idx >= 1) {
      drawDashedRect(g, x + 4.5, y + 4.5, m.w - 9, m.h - 9, { radius: m.radius - 3, color: idx === 4 ? RARITY_GOLD : rar.dark, width: 2, dash: 9, gap: 7, alpha: 0.8, seed: seed + 3 });
    }
    if (idx >= 2) {
      // Photo-corner mounts on the four corners of the mat.
      const c = m.radius * 0.9;
      const mount = idx === 4 ? RARITY_GOLD : rar.dark;
      for (const sx of [-1, 1] as const) {
        for (const [cy, sy] of [[y + 8, -1], [y + 18 + wr.h, 1]] as const) {
          const cx = sx * (m.w / 2 - 8);
          g.poly([cx, cy, cx - sx * c, cy, cx, cy - sy * c]).fill(mount);
        }
      }
    }
    this.art.addChild(g);

    if (idx >= 3) {
      const tape = tapeStrip({ name: idx === 3 ? 'yellow' : 'pink', w: m.w * 0.42, h: m.w * 0.13, angle: -3, pattern: idx === 3 ? 'dots' : 'gingham', seed });
      tape.position.set(0, y + 2);
      this.art.addChild(tape);
    }
    if (idx >= 4) {
      const star = drawIcon('star', m.w * 0.24, RARITY_GOLD);
      star.position.set(x + m.w * 0.08, y + m.w * 0.06);
      star.rotation = -0.2;
      this.art.addChild(star);
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
    back.roundRect(b.x - 6, -m.pip * 0.95, b.w + 12, m.pip * 1.9, m.pip * 0.95).fill({ color: Color.paperLight, alpha: 0.92 });
    back.position.set(0, y);
    pips.position.set(0, y);
    this.overlay.addChild(back, pips);

    if (uiPrefs.colorAssist) {
      const name = uiLabel(rarityName(this.rarity), { size: Math.max(20, Math.round(m.name * 0.78)) });
      fitLabel(name, wr.w - 12, 22);
      name.position.set(0, y - m.pip - name.height / 2 - 2);
      this.overlay.addChild(name);
    }
  }
}
