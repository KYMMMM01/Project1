/** Reward stickers: the same look in missions, the pass, the calendar and the popups. */
import { Container, Sprite, type Text } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import type { BundlePart } from '@/meta/bundle';
import { Color, drawIcon, fitLabel, uiLabel } from '@/ui';
import type { Box } from '@/ui/layoutMath';
import { partPicture } from '../../partPicture';
import { unitKey } from '../../shop/keys';
import { stickerTilt } from './parts';
import { stickerDisc } from './sheets';

/** The picture of one reward part, centred on its origin and `size` px square. Art when it exists, a drawn icon otherwise. */
export function partIcon(part: BundlePart, size: number): Container {
  const picture = partPicture(part, size);
  if (picture) return picture;
  const c = new Container();
  if (part.kind === 'card' && hasTex(unitKey(part.unit))) {
    const s = new Sprite(tex(unitKey(part.unit)));
    s.anchor.set(0.5);
    s.scale.set(size / Math.max(s.texture.width, s.texture.height));
    c.addChild(s);
  } else {
    c.addChild(drawIcon(part.kind === 'card' ? 'paw' : 'wardrobe', size));
  }
  return c;
}

/** "150", "x2": the amount line of a part. */
export function partAmount(part: BundlePart): string {
  switch (part.kind) {
    case 'gold':
    case 'gems':
    case 'tickets':
      return fmt(part.n);
    default:
      return `x${part.n}`;
  }
}

/** Name of what the part is, for a caption (a rarity tint alone never carries meaning). */
export function partName(part: BundlePart): string {
  switch (part.kind) {
    case 'gold':
    case 'gems':
    case 'tickets':
      return t('meta.currency.' + part.kind);
    case 'chest':
      return t('meta.chest.' + part.chest);
    case 'wild':
      return t('rarity.' + part.rarity);
    case 'card':
      return t('unit.' + part.unit + '.name');
    case 'cosmetic':
      return t('meta.cos.' + part.id);
  }
}

const KINDS = ['gold', 'gems', 'tickets', 'chest', 'wild', 'card', 'cosmetic'] as const;

/** A sticker with the part's picture on it: a die-cut disc, a flat shadow, a slight tilt. Origin = centre. */
export function partSticker(part: BundlePart, size: number): Container {
  const c = new Container();
  const code = KINDS.indexOf(part.kind) * 3 + (part.n % 5);
  c.addChild(stickerDisc(size, code % 4), partIcon(part, size * 0.74));
  c.rotation = stickerTilt(code);
  return c;
}

export interface RewardChipOpts {
  /** Sticker diameter in design px (default 56). */
  size?: number;
  /** 'row' = sticker then amount; 'column' = sticker over amount over the caption. */
  layout?: 'row' | 'column';
  fontSize?: number;
  /** Widest the chip may be; the amount shrinks to fit. */
  maxWidth?: number;
  /** Show the part's name under the amount (column layout). */
  caption?: boolean;
}

/** One reward part as a sticker with its amount in ink. Origin = centre of the chip. */
export class RewardChip extends Container {
  readonly uiBox: Box;
  private readonly amountT: Text;

  constructor(readonly part: BundlePart, o: RewardChipOpts = {}) {
    super();
    const size = o.size ?? 56;
    const fontSize = o.fontSize ?? 28;
    const layout = o.layout ?? 'row';
    const sticker = partSticker(part, size);
    this.amountT = uiLabel(partAmount(part), { size: fontSize });
    if (layout === 'row') {
      if (o.maxWidth) fitLabel(this.amountT, Math.max(40, o.maxWidth - size - 8), fontSize);
      const w = size + 8 + this.amountT.width;
      sticker.position.set(-w / 2 + size / 2, 0);
      this.amountT.position.set(-w / 2 + size + 8 + this.amountT.width / 2, 2);
      this.addChild(sticker, this.amountT);
      this.uiBox = { x: -w / 2, y: -size / 2, w, h: size };
    } else {
      if (o.maxWidth) fitLabel(this.amountT, o.maxWidth, fontSize);
      const gap = 4;
      const cap = o.caption === true ? uiLabel(partName(part), { size: 24, color: Color.inkSoft }) : null;
      if (cap && o.maxWidth) fitLabel(cap, o.maxWidth, 24);
      const h = size + gap + this.amountT.height + (cap ? gap + cap.height : 0);
      sticker.position.set(0, -h / 2 + size / 2);
      this.amountT.position.set(0, -h / 2 + size + gap + this.amountT.height / 2);
      this.addChild(sticker, this.amountT);
      if (cap) {
        cap.position.set(0, h / 2 - cap.height / 2);
        this.addChild(cap);
      }
      const w = Math.max(size, this.amountT.width, cap?.width ?? 0);
      this.uiBox = { x: -w / 2, y: -h / 2, w, h };
    }
  }

  setDim(dim: boolean): void {
    this.alpha = dim ? 0.55 : 1;
  }
}

export interface RewardListOpts extends RewardChipOpts {
  direction?: 'row' | 'column';
  gap?: number;
}

/** All parts of a bundle side by side or stacked. Origin = centre of the list. */
export class RewardList extends Container {
  readonly uiBox: Box;
  readonly chips: RewardChip[] = [];

  constructor(parts: readonly BundlePart[], o: RewardListOpts = {}) {
    super();
    const dir = o.direction ?? 'column';
    const gap = o.gap ?? 6;
    let total = 0;
    let cross = 0;
    for (const p of parts) {
      const chip = new RewardChip(p, o);
      this.chips.push(chip);
      this.addChild(chip);
      const b = chip.uiBox;
      total += (dir === 'column' ? b.h : b.w) + (this.chips.length > 1 ? gap : 0);
      cross = Math.max(cross, dir === 'column' ? b.w : b.h);
    }
    let at = -total / 2;
    for (const chip of this.chips) {
      const b = chip.uiBox;
      if (dir === 'column') {
        chip.position.set(0, at - b.y);
        at += b.h + gap;
      } else {
        chip.position.set(at - b.x, 0);
        at += b.w + gap;
      }
    }
    this.uiBox = dir === 'column' ? { x: -cross / 2, y: -total / 2, w: cross, h: total } : { x: -total / 2, y: -cross / 2, w: total, h: cross };
  }

  setDim(dim: boolean): void {
    for (const c of this.chips) c.setDim(dim);
  }
}
