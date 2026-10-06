/** Shared pieces of the shop tab's blocks: the action surface the tab offers, and small drawing helpers. */
import { Container } from 'pixi.js';
import { fmt } from '@/core/format';
import type { ChestKind } from '@/meta/types';
import { Button, Color, paperSeed, paperShape, type ButtonStyleId, type IconName, type TapeName, type uiLabel } from '@/ui';
import { PAGE_TOP, paperPage } from './paperBits';
import type { ShopSectionId } from './shopLogic';

export const SIDE = 20;
export const GAP = 18;
/** Inner padding of a page, and the width left for its content. */
export const PAD = 16;

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

export interface PageOpts {
  title: string;
  ribbon: ButtonStyleId;
  tape?: TapeName;
}

/**
 * Wrap content in a cream page with its title on a label across the top edge and add it to `root` at `y`.
 * `inner` is laid out in the page's own coordinates (x from 0 to `w`, y from 0 at the first free line below the
 * label); `innerH` is the height it used. Returns the height the page takes in the stack.
 */
export function mountPage(root: Container, y: number, w: number, inner: Container, innerH: number, o: PageOpts): number {
  const page = paperPage(w, innerH, o.title, o.ribbon, o.tape);
  inner.position.set(0, PAGE_TOP);
  page.content.addChild(inner);
  page.view.position.set(SIDE, y);
  root.addChild(page.view);
  return page.height;
}

/** A card lying on a page: ivory paper with its own flat shadow. Returns it positioned by its top-left corner; add content to it. */
export function subCard(parent: Container, x: number, y: number, w: number, h: number, fill: number = Color.paperLight): Container {
  const c = new Container();
  const piece = paperShape({ w, h, radius: 22, fill, edge: Color.kraftDark, edgeAlpha: 0.55, shadow: 4, grain: false, seed: paperSeed() });
  piece.position.set(w / 2, h / 2);
  c.addChild(piece);
  c.position.set(x, y);
  parent.addChild(c);
  return c;
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
