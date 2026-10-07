import { Container, Graphics, Sprite, type Text, type Texture } from 'pixi.js';
import { barBox, CARD_SPECS, cardGeometry, levelBadgeBox, nameCentre, pipsPillBox, type CardGeometry, type CardSizeId, type CardSpec } from './cardMath';
import { drawFrameLayers, frameOrnaments } from './frameArt';
import type { Box } from './layoutMath';
import { drawPaper } from './paper';
import { uiPrefs } from './prefs';
import { ProgressBar } from './ProgressBar';
import { rarityName } from './rarity';
import { RarityPips } from './RarityPips';
import { cacheStatic } from './shapes';
import { Tag } from './Tag';
import { fitLabel, uiLabel } from './text';
import { Color, MIN_FONT, Rarity, rarityIndex, RARITY_ORDER, type RarityId } from './theme';

export type CardSize = CardSizeId;

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
  /** Size of the NEW tag's text (default: the smallest the kit allows). A card that is shown scaled down asks for more, so the tag still reads at MIN_FONT. */
  newFontSize?: number;
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

  private readonly m: CardSpec;
  private readonly geo: CardGeometry;
  private readonly art = new Container();
  private readonly portraitHost = new Container();
  private readonly overlay = new Container();
  private nameT: Text | null = null;
  private levelBadge: Container | null = null;
  private bar: ProgressBar | null = null;
  private newTag: Tag | null = null;
  private portrait: Container | null = null;
  private hasBar = false;
  private readonly newSize: number;

  constructor(opts: CardFrameOpts) {
    super();
    this.size = opts.size ?? 'medium';
    this.rarity = opts.rarity;
    this.newSize = opts.newFontSize ?? MIN_FONT;
    const m = CARD_SPECS[this.size];
    this.m = m;
    this.geo = cardGeometry(this.size);
    this.uiBox = { x: -m.w / 2 - m.over, y: -m.h / 2 - m.crest, w: m.w + m.over * 2, h: m.h + m.crest + 8 };
    this.windowRect = { ...this.geo.windowRect };

    this.drawArt();
    const mask = new Graphics();
    mask.poly(this.geo.window).fill(Color.white);
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
    fitLabel(t, barBox(m, this.geo).w, m.name);
    // The name takes the middle of what the plate has left between the mat and the bar (or the plate's own inset below it, without a bar).
    t.position.set(0, nameCentre(m, this.geo, this.hasBar));
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
    drawPaper(g, -w / 2, -h / 2, { w, h, kind: 'pill', fill: Color.paperLight, edge: rar.dark, shadow: 3, grain: false, seed: this.geo.seed + 4, wobble: 0.4 });
    c.addChild(g, t);
    const box = levelBadgeBox(m, this.geo, w, h);
    c.position.set(box.x + w / 2, box.y + h / 2);
    this.overlay.addChild(c);
    this.levelBadge = c;
  }

  /** Copies owned vs needed for the next level. Ready (owned >= needed) turns the bar green. */
  setProgress(owned: number, needed: number): void {
    const m = this.m;
    const ready = owned >= needed;
    if (!this.bar) {
      this.hasBar = true;
      const box = barBox(m, this.geo);
      this.bar = new ProgressBar({ width: box.w, height: m.bar, color: 'blue', label: '', ticks: 0 });
      this.bar.position.set(0, box.y + box.h / 2);
      this.overlay.addChild(this.bar);
      if (this.nameT) this.setName(this.nameT.text);
    }
    this.bar.setColor(ready ? 'green' : 'blue');
    this.bar.setLabel(`${owned}/${needed}`);
    this.bar.setValue(needed > 0 ? owned / needed : 1, false);
  }

  /** Show / hide the NEW tag (pass the label text, or false to hide); `fontSize` overrides the size the card was made with. */
  setNew(label: string | false, fontSize: number = this.newSize): void {
    this.newTag?.destroy();
    this.newTag = null;
    if (!label) return;
    const small = this.size === 'small';
    // A compact capsule on small cards keeps clear of the level badge; a swallow-tail flag elsewhere.
    const t = new Tag({
      text: label,
      style: 'danger',
      shape: small ? 'pill' : 'flag',
      fontSize,
      tilt: small ? 0.1 : 0.14,
    });
    const m = this.m;
    if (small) t.position.set(m.w / 2 - t.uiBox.w / 2 - 2, -m.h / 2 - 4);
    // The flag hangs off the right edge by the card's own overhang, its top on the same line as the level badge's.
    else t.position.set(m.w / 2 + m.over - t.uiBox.w / 2, this.geo.windowRect.y + m.pad + t.uiBox.h / 2);
    this.overlay.addChild(t);
    this.newTag = t;
    t.pop();
  }

  /* -------------------------------------------------------------- drawing */

  private drawArt(): void {
    const g = new Graphics();
    drawFrameLayers(g, this.geo, this.rarity, 6);
    this.art.addChild(g, frameOrnaments(this.geo, this.rarity));
    cacheStatic(this.art);
  }

  /** Tier pips sit on the artwork: the lit count repeats the rarity so colour is never the only cue. */
  private buildPips(): void {
    const m = this.m;
    const idx = rarityIndex(this.rarity);
    const pips = new RarityPips({ owned: RARITY_ORDER.map((_, i) => i <= idx), size: m.pip, gap: Math.round(m.pip * 0.38) });
    const b = pips.uiBox;
    const pill = pipsPillBox(m, this.geo, b.w + 12);
    const y = pill.y + pill.h / 2;
    const back = new Graphics();
    back.roundRect(pill.x, pill.y, pill.w, pill.h, pill.h / 2).fill({ color: Color.paperLight, alpha: 0.92 });
    pips.position.set(0, y);
    this.overlay.addChild(back, pips);

    if (uiPrefs.colorAssist) {
      const size = Math.max(MIN_FONT, Math.round(m.name * 0.78));
      const name = uiLabel(rarityName(this.rarity), { size });
      fitLabel(name, this.geo.windowRect.w - 12, size);
      name.position.set(0, pill.y - 4 - name.height / 2);
      this.overlay.addChild(name);
    }
  }
}
