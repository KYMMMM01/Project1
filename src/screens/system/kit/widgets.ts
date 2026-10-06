/** Small building blocks the routine screens share: baked panels, the locked card, the claimed stamp. */
import { Container, Graphics, Rectangle, Sprite, type Texture } from 'pixi.js';
import { game } from '@/core/game';
import { Ease } from '@/core/tween';
import { drawIcon } from '@/ui/icons';
import { motion, TweenBag } from '@/ui/motion';
import { bakeResolution, cacheStatic, drawPanel, type PanelVariant } from '@/ui/shapes';
import { uiLabel } from '@/ui/text';
import { Color } from '@/ui/theme';

/** A baked panel with its top-left corner at the origin. */
export function bakedPanel(w: number, h: number, variant: PanelVariant = 'default', radius = 30): Graphics {
  const g = new Graphics();
  drawPanel(g, 0, 0, w, h, variant, { radius, shadow: false });
  cacheStatic(g);
  return g;
}

const panelTextures = new Map<string, Texture>();
/** Room around the panel body for its outer stroke inside a shared texture. */
const BAKE_PAD = 10;

/**
 * A panel whose texture is shared by every panel of the same size and variant (a list of 30 rows
 * would otherwise bake 30 textures). Top-left origin; the sprite hangs BAKE_PAD outside it.
 */
export function sharedPanel(w: number, h: number, variant: PanelVariant = 'default', radius = 30): Container {
  const key = `${variant}:${w}:${h}:${radius}`;
  let tx = panelTextures.get(key);
  if (!tx) {
    const g = new Graphics();
    drawPanel(g, 0, 0, w, h, variant, { radius, shadow: false });
    tx = game.app.renderer.generateTexture({
      target: g,
      frame: new Rectangle(-BAKE_PAD, -BAKE_PAD, w + BAKE_PAD * 2, h + BAKE_PAD * 2),
      resolution: bakeResolution(),
      antialias: true,
    });
    g.destroy();
    panelTextures.set(key, tx);
  }
  const holder = new Container();
  const sprite = new Sprite(tx);
  sprite.position.set(-BAKE_PAD, -BAKE_PAD);
  holder.addChild(sprite);
  return holder;
}

/** A recessed card that says a feature is locked and how to open it. Top-left origin; `height` is fixed. */
export function lockedCard(w: number, hint: string, height = 180): Container {
  const c = new Container();
  c.addChild(bakedPanel(w, height, 'inset', 30));
  const lock = drawIcon('lock', 76);
  lock.position.set(78, height / 2);
  const text = uiLabel(hint, { size: 28, wrap: w - 190, align: 'left', anchorX: 0, strokeWidth: 5, shadow: false, lineHeight: 38 });
  text.position.set(140, height / 2);
  c.addChild(lock, text);
  return c;
}

/** The green check that replaces a claim button. Origin = centre; `stamp()` plays the 2 -> 1 slam. */
export class ClaimedMark extends Container {
  private readonly bag = new TweenBag();

  constructor(readonly size = 72) {
    super();
    const disc = new Graphics();
    disc.circle(0, 4, size / 2).fill({ color: Color.black, alpha: 0.3 });
    disc.circle(0, 0, size / 2).fill(Color.success).stroke({ width: 5, color: Color.outline, alignment: 1 });
    cacheStatic(disc);
    const tick = drawIcon('check', size * 0.62, Color.white);
    this.addChild(disc, tick);
  }

  stamp(): void {
    if (motion.reduced) {
      this.scale.set(1);
      return;
    }
    this.scale.set(2);
    this.alpha = 0;
    this.bag.run({
      duration: 0.12,
      ease: Ease.backOut,
      onUpdate: (k) => {
        this.scale.set(2 - k);
        this.alpha = Math.min(1, k * 4);
      },
      onComplete: () => {
        this.scale.set(1);
        this.alpha = 1;
      },
    });
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.bag.killAll();
    super.destroy(options);
  }
}
