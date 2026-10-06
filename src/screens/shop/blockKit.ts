/** Shared pieces of the shop tab's blocks: the action surface the tab offers, and small drawing helpers. */
import { Container } from 'pixi.js';
import { fmt } from '@/core/format';
import type { ChestKind } from '@/meta/types';
import { Button, Color, drawIcon, Panel, uiLabel, type ButtonStyleId, type IconName, type PanelVariant } from '@/ui';
import type { ShopSectionId } from './shopLogic';

export const SIDE = 20;
export const GAP = 18;

/** Everything a block may ask the tab to do. Each action reports its own feedback (toast, sound, reveal). */
export interface ShopActions {
  openChest(kind: ChestKind): void;
  buyChest(kind: ChestKind): void;
  claimFreeChest(): void;
  skipFreeChest(via: 'ad' | 'gems'): void;
  buySlot(slot: number): void;
  refreshDaily(): void;
  buyProduct(id: string): void;
  claimGemPass(): void;
  breakPiggyFree(): void;
  buyCosmetic(id: string): void;
  equip(id: string): void;
  previewFx(id: string, at: Container): void;
  buyTicket(): void;
  ticketAd(): void;
  openOdds(kind: ChestKind): void;
  /** Register the text that shows the free-chest countdown; the tab keeps it ticking. */
  trackFreeTimer(text: ReturnType<typeof uiLabel> | null): void;
}

export interface BlockEnv {
  /** Width of the scroll content. */
  w: number;
  actions: ShopActions;
}

export interface BlockBuild {
  height: number;
  /** Offsets of inner anchors (for example the piggy bank inside the pass block), relative to the block top. */
  anchors?: Partial<Record<ShopSectionId, number>>;
}

export interface Block {
  id: ShopSectionId;
  /** Cheap string of everything the block draws; the block is rebuilt only when it changes. */
  signature(): string;
  /** False hides the block (and its tab). */
  visible(): boolean;
  build(root: Container, env: BlockEnv): BlockBuild;
}

/** A panel placed by its top-left corner; returns the content container (top-left origin). */
export function card(root: Container, x: number, y: number, w: number, h: number, variant: PanelVariant = 'default'): Container {
  const p = new Panel({ width: w, height: h, variant });
  p.position.set(x + w / 2, y + h / 2);
  root.addChild(p);
  return p.content;
}

/** Section title row: icon, big title, an optional smaller line under it. Returns its height. */
export function sectionHeader(root: Container, y: number, icon: IconName, title: string, sub?: string, wrap = 600): number {
  const ic = drawIcon(icon, 54);
  ic.position.set(SIDE + 30, y + 36);
  const tt = uiLabel(title, { size: 44, strokeWidth: 7, anchorX: 0 });
  tt.position.set(SIDE + 74, y + 34);
  root.addChild(ic, tt);
  if (!sub) return 84;
  const s = uiLabel(sub, { size: 26, color: Color.textDim, strokeWidth: 4, shadow: false, anchorX: 0, anchorY: 0, wrap, lineHeight: 32 });
  s.position.set(SIDE + 74, y + 66);
  root.addChild(s);
  return 66 + s.height + 22;
}

export interface PriceOpts {
  label: string;
  width: number;
  height?: number;
  style?: ButtonStyleId;
  icon?: IconName;
  sublabel?: string;
  sublabelIcon?: IconName;
  fontSize?: number;
}

export function actionButton(o: PriceOpts, onTap: () => void): Button {
  const b = new Button({
    label: o.label,
    width: o.width,
    height: o.height ?? 96,
    style: o.style ?? 'primary',
    icon: o.icon,
    sublabel: o.sublabel,
    sublabelIcon: o.sublabelIcon,
    fontSize: o.fontSize ?? 30,
    disabledMark: 'none',
  });
  b.onTap(onTap);
  return b;
}

/** A button that shows a gem or coin price next to its label. */
export function currencyButton(label: string, amount: number, currency: 'gold' | 'gems', width: number, onTap: () => void, style: ButtonStyleId = 'primary'): Button {
  return actionButton(
    { label, width, style, sublabel: fmt(amount), sublabelIcon: currency === 'gold' ? 'coin' : 'gem', fontSize: 30 },
    onTap,
  );
}
