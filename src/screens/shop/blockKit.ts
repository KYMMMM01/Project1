/** Shared pieces of the shop tab's blocks: the action surface the tab offers, and small drawing helpers. */
import { Container, type DestroyOptions } from 'pixi.js';
import { fmt } from '@/core/format';
import type { ChestKind } from '@/meta/types';
import { Ease } from '@/core/tween';
import { backOut, Button, Color, motion, paperSeed, paperShape, punch, TweenBag, type ButtonStyleId, type IconName, type TapeName, type uiLabel } from '@/ui';
import { PAGE_TOP, paperPage } from './paperBits';
import type { ShopSectionId } from './shopLogic';

export const SIDE = 20;
export const GAP = 18;
/** Inner padding of a page, and the width left for its content. */
export const PAD = 16;

/** Everything a block may ask the tab to do. Each action reports its own feedback (toast, sound, reveal). */
export interface ShopActions {
  openChest(kind: ChestKind): void;
  /** Open every chest of the kind the player owns (up to the cap) in one go, as one reveal. */
  openAllChests(kind: ChestKind): void;
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
  /** Parts of the block the guidebook's "try it" can point at, by the name after the dot of its home point (`shop.free` is `free`). */
  points?: Readonly<Record<string, Container>>;
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

/** How far a dealt card drops, how late each one follows the one before, and how it is tilted while it falls. */
const DEAL_DROP = 30;
const DEAL_GAP = 0.07;
const DEAL_TILT = 0.05;

/** A card lying on a page. Its origin is its centre, so it can be dealt, pressed or punched without swinging round a corner. */
export class SubCard extends Container {
  private readonly bag = new TweenBag();

  constructor(w: number, h: number) {
    super();
    this.pivot.set(w / 2, h / 2);
  }

  /** Dealt onto the page: the card drops in and settles, `index` beats after the first one; until its turn it is not there. */
  deal(index: number): void {
    if (motion.reduced) return;
    const y = this.y;
    const tilt = index % 2 === 0 ? -DEAL_TILT : DEAL_TILT;
    const settle = backOut(1.6);
    const pose = (e: number): void => {
      this.alpha = Math.min(1, e * 5);
      this.y = y + DEAL_DROP * (1 - e);
      this.rotation = tilt * (1 - e);
      this.scale.set(0.92 + 0.08 * e);
    };
    pose(0);
    this.bag.run({
      duration: 0.3,
      delay: index * DEAL_GAP,
      ease: Ease.linear,
      onUpdate: (k) => pose(Math.min(1, settle(k))),
      onComplete: () => {
        this.y = y;
        this.alpha = 1;
        this.rotation = 0;
        this.scale.set(1);
      },
    });
  }

  /** A piece of tape is slapped on and the card is pressed flat under it: the tape comes down big, the card dips, then springs back. */
  slap(tape: Container): void {
    if (motion.reduced) return;
    tape.scale.set(1.9);
    tape.alpha = 0;
    this.bag.run({
      duration: 0.34,
      ease: Ease.linear,
      onUpdate: (k) => {
        if (k < 0.4) {
          const d = Ease.cubicIn(k / 0.4);
          tape.scale.set(1.9 - 0.9 * d);
          tape.alpha = Math.min(1, d * 3);
          this.scale.set(1 - 0.03 * d);
        } else {
          tape.scale.set(1);
          tape.alpha = 1;
          const u = (k - 0.4) / 0.6;
          this.scale.set(0.97 + 0.03 * Ease.cubicOut(u) + 0.04 * Math.sin(u * Math.PI));
        }
      },
      onComplete: () => {
        tape.scale.set(1);
        tape.alpha = 1;
        this.scale.set(1);
      },
    });
  }

  /** A little bump for a piece on the card whose number just changed. */
  bump(node: Container): void {
    if (motion.reduced) return;
    punch(this.bag, node, 0.12, 0.26);
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }
}

/** A card lying on a page: ivory paper with its own flat shadow. Returns it positioned by its top-left corner; add content to it. */
export function subCard(parent: Container, x: number, y: number, w: number, h: number, fill: number = Color.paperLight): SubCard {
  const c = new SubCard(w, h);
  const piece = paperShape({ w, h, radius: 22, fill, edge: Color.kraftDark, edgeAlpha: 0.55, shadow: 4, grain: false, seed: paperSeed() });
  piece.position.set(w / 2, h / 2);
  c.addChild(piece);
  c.position.set(x + w / 2, y + h / 2);
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
