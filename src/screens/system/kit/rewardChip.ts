/** Icon + amount widgets for reward bundles: the same look in missions, the pass and the calendar. */
import { Container, Sprite, type Text } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import type { BundlePart } from '@/meta/bundle';
import type { Box } from '@/ui/layoutMath';
import { drawIcon, type IconName } from '@/ui/icons';
import { Color, Rarity } from '@/ui/theme';
import { fitLabel, uiLabel } from '@/ui/text';
import { textureKey } from './parts';

function iconFor(part: BundlePart): IconName {
  switch (part.kind) {
    case 'gold':
      return 'coin';
    case 'gems':
      return 'gem';
    case 'tickets':
      return 'ticket';
    case 'chest':
      return 'chest';
    case 'wild':
      return 'cards';
    case 'card':
      return 'paw';
    case 'cosmetic':
      return 'wardrobe';
  }
}

function tintFor(part: BundlePart): number | undefined {
  if (part.kind === 'wild') return Rarity[part.rarity].color;
  if (part.kind === 'chest') return part.chest === 'gold' ? Color.gold : part.chest === 'silver' ? Color.textDim : Color.primaryDark;
  return undefined;
}

/** The picture of one reward part, centred on its origin and `size` px square. Art when it exists, a drawn icon otherwise. */
export function partIcon(part: BundlePart, size: number): Container {
  const key = textureKey(part);
  if (key && hasTex(key)) {
    const s = new Sprite(tex(key));
    s.anchor.set(0.5);
    s.scale.set(size / Math.max(s.texture.width, s.texture.height));
    return s;
  }
  const c = new Container();
  c.addChild(drawIcon(iconFor(part), size, tintFor(part)));
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

export interface RewardChipOpts {
  /** Icon side in design px (default 56). */
  size?: number;
  /** 'row' = icon then amount; 'column' = icon over amount over the caption. */
  layout?: 'row' | 'column';
  fontSize?: number;
  /** Widest the chip may be; the amount shrinks to fit. */
  maxWidth?: number;
  /** Show the part's name under the amount (column layout). */
  caption?: boolean;
}

/** One reward part. Origin = centre of the chip. */
export class RewardChip extends Container {
  readonly uiBox: Box;
  private readonly amountT: Text;

  constructor(readonly part: BundlePart, o: RewardChipOpts = {}) {
    super();
    const size = o.size ?? 56;
    const fontSize = o.fontSize ?? 28;
    const layout = o.layout ?? 'row';
    const icon = partIcon(part, size);
    this.amountT = uiLabel(partAmount(part), { size: fontSize, strokeWidth: 5 });
    if (layout === 'row') {
      if (o.maxWidth) fitLabel(this.amountT, Math.max(40, o.maxWidth - size - 8), fontSize);
      const w = size + 8 + this.amountT.width;
      icon.position.set(-w / 2 + size / 2, 0);
      this.amountT.position.set(-w / 2 + size + 8 + this.amountT.width / 2, 2);
      this.addChild(icon, this.amountT);
      this.uiBox = { x: -w / 2, y: -size / 2, w, h: size };
    } else {
      if (o.maxWidth) fitLabel(this.amountT, o.maxWidth, fontSize);
      const gap = 4;
      const cap = o.caption === true ? uiLabel(partName(part), { size: 24, color: Color.textDim, strokeWidth: 4, shadow: false }) : null;
      if (cap && o.maxWidth) fitLabel(cap, o.maxWidth, 24);
      const h = size + gap + this.amountT.height + (cap ? gap + cap.height : 0);
      icon.position.set(0, -h / 2 + size / 2);
      this.amountT.position.set(0, -h / 2 + size + gap + this.amountT.height / 2);
      this.addChild(icon, this.amountT);
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
