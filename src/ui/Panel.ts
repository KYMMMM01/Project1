import { Container, Graphics, Rectangle } from 'pixi.js';
import { IconButton } from './IconButton';
import type { Box } from './layoutMath';
import { PaperLabel, paperSeed, tapeStrip, type TornSides } from './paper';
import { drawPanel, PanelColors, refreshCache, type PanelVariant } from './shapes';
import type { ButtonStyleId, TapeName } from './theme';

export interface PanelOpts {
  width: number;
  height: number;
  variant?: PanelVariant;
  /** Title shown on a torn paper label straddling the top edge. */
  title?: string;
  /** Colour of the title label. Default 'primary' (coral). */
  ribbon?: ButtonStyleId;
  /** Sides torn instead of cut (a popup sheet usually tears its bottom edge). */
  torn?: TornSides;
  /** Washi tape: across the top of the sheet, or, with a title, across the corner of the title label. Off by default: one piece per card at most. */
  tape?: TapeName | false;
  /** Adds a round close button on the top-right corner; it calls this handler. */
  onClose?: () => void;
  radius?: number;
  /** Bake the static artwork into one texture (default true). */
  cache?: boolean;
  /** Swallow pointer events so taps on the panel never reach whatever is behind it (default true). */
  blockInput?: boolean;
}

const RIBBON_H = 84;

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
  private titleLabel: PaperLabel | null = null;
  private readonly seed = paperSeed();
  private readonly torn: TornSides;
  private tape: TapeName | undefined;
  private readonly closeGap: number;
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
    this.torn = opts.torn;
    this.closeGap = opts.onClose ? 130 : -40;
    const w = this.panelW;
    const h = this.panelH;
    this.uiBox = { x: -w / 2, y: -h / 2 - (opts.title ? RIBBON_H / 2 : 0), w, h: h + (opts.title ? RIBBON_H / 2 : 0) };

    this.art.addChild(this.artG);
    this.addChild(this.art, this.content);
    this.content.position.set(-w / 2, -h / 2);
    this.drawBody();
    this.tape = opts.tape || undefined;
    if (opts.title) this.setTitle(opts.title);
    else if (this.tape) this.addTape(this.tape);

    if (opts.onClose) {
      const btn = new IconButton({ icon: 'close', style: 'kraft', size: 72, shape: 'round' });
      btn.position.set(w / 2 - 22, -h / 2 + 22);
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
    if (this.titleLabel) {
      this.titleLabel.setText(text);
    } else {
      this.titleLabel = new PaperLabel({
        text,
        size: 40,
        paper: this.ribbonStyle,
        padX: 44,
        minWidth: Math.min(300, this.panelW * 0.55),
        maxWidth: this.panelW - this.closeGap,
        tape: this.tape,
        seed: this.seed + 3,
      });
      this.titleLabel.position.set(0, -this.panelH / 2 - 6);
      this.art.addChild(this.titleLabel);
    }
    this.refreshCache();
  }

  private addTape(name: TapeName): void {
    const tape = tapeStrip({ name, w: 118, h: 30, angle: -2, pattern: 'gingham', seed: this.seed });
    tape.position.set(0, -this.panelH / 2 + 4);
    this.art.addChild(tape);
    this.refreshCache();
  }

  private drawBody(): void {
    this.artG.clear();
    drawPanel(this.artG, -this.panelW / 2, -this.panelH / 2, this.panelW, this.panelH, this.variant, { radius: this.radius, torn: this.torn, seed: this.seed });
    this.refreshCache();
  }

  private refreshCache(): void {
    if (!this.cacheArt) return;
    refreshCache(this.art);
  }
}
