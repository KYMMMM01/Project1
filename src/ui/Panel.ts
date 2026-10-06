import { Container, Graphics, Rectangle, type Text } from 'pixi.js';
import { IconButton } from './IconButton';
import type { Box } from './layoutMath';
import { drawPanel, drawRibbon, PanelColors, refreshCache, type PanelVariant, type RibbonColors } from './shapes';
import { fitLabel, uiLabel } from './text';
import { ButtonPalettes, type ButtonStyleId } from './theme';

export interface PanelOpts {
  width: number;
  height: number;
  variant?: PanelVariant;
  /** Title shown on a ribbon straddling the top edge. */
  title?: string;
  /** Ribbon colour. Default 'primary' (orange). */
  ribbon?: ButtonStyleId;
  /** Adds a round close button on the top-right corner; it calls this handler. */
  onClose?: () => void;
  radius?: number;
  /** Bake the static artwork into one texture (default true). */
  cache?: boolean;
  /** Swallow pointer events so taps on the panel never reach whatever is behind it (default true). */
  blockInput?: boolean;
}

const RIBBON_H = 78;

/**
 * Container panel. Origin = centre of the body. Put content in `content`, whose origin is the
 * panel's top-left corner (so children are laid out with plain positive coordinates).
 */
export class Panel extends Container {
  readonly uiBox: Box;
  readonly panelW: number;
  readonly panelH: number;
  readonly variant: PanelVariant;
  /** Add children here. Origin = top-left of the panel body. */
  readonly content = new Container();
  closeButton: IconButton | null = null;

  private readonly art = new Container();
  private readonly artG = new Graphics();
  private ribbonG: Graphics | null = null;
  private titleT: Text | null = null;
  private readonly cacheArt: boolean;
  private readonly ribbonStyle: ButtonStyleId;
  private readonly radius: number | undefined;

  constructor(opts: PanelOpts) {
    super();
    this.panelW = opts.width;
    this.panelH = opts.height;
    this.variant = opts.variant ?? 'default';
    this.cacheArt = opts.cache ?? true;
    this.ribbonStyle = opts.ribbon ?? 'primary';
    this.radius = opts.radius;
    const w = this.panelW;
    const h = this.panelH;
    this.uiBox = { x: -w / 2, y: -h / 2 - (opts.title ? RIBBON_H / 2 : 0), w, h: h + (opts.title ? RIBBON_H / 2 : 0) };

    this.art.addChild(this.artG);
    this.addChild(this.art, this.content);
    this.content.position.set(-w / 2, -h / 2);
    this.drawBody();
    if (opts.title) this.setTitle(opts.title);

    if (opts.onClose) {
      const btn = new IconButton({ icon: 'close', style: 'danger', size: 72, shape: 'round' });
      btn.position.set(w / 2 - 26, -h / 2 + 26);
      btn.onTap(opts.onClose);
      this.addChild(btn);
      this.closeButton = btn;
    }

    if (opts.blockInput ?? true) {
      this.eventMode = 'static';
      this.hitArea = new Rectangle(-w / 2, -h / 2, w, h);
    }
  }

  get innerWidth(): number {
    return this.panelW;
  }

  /** Colour that reads well on this panel's surface. */
  get textColor(): number {
    return PanelColors[this.variant].text;
  }

  get dimTextColor(): number {
    return PanelColors[this.variant].textDim;
  }

  setTitle(text: string): void {
    const pal = ButtonPalettes[this.ribbonStyle];
    const colors: RibbonColors = { face: pal.base, faceTop: pal.top, tail: pal.rimBottom, tailDark: pal.lip };
    if (!this.ribbonG) {
      this.ribbonG = new Graphics();
      this.art.addChild(this.ribbonG);
    }
    this.titleT?.destroy();
    const t = uiLabel(text, { size: 40, stroke: pal.textStroke, strokeWidth: 7 });
    this.titleT = t;
    const rw = Math.min(this.panelW + 40, Math.max(300, t.width + 120));
    fitLabel(t, rw - 60, 40);
    this.ribbonG.clear();
    drawRibbon(this.ribbonG, -rw / 2, -this.panelH / 2 - RIBBON_H / 2 - 10, rw, RIBBON_H, colors);
    t.position.set(0, -this.panelH / 2 - 10 - 3);
    this.art.addChild(t);
    this.refreshCache();
  }

  private drawBody(): void {
    this.artG.clear();
    drawPanel(this.artG, -this.panelW / 2, -this.panelH / 2, this.panelW, this.panelH, this.variant, { radius: this.radius });
    this.refreshCache();
  }

  private refreshCache(): void {
    if (!this.cacheArt) return;
    refreshCache(this.art);
  }

}
