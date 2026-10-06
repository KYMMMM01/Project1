import { Container, Graphics, Rectangle, type DestroyOptions, type Text } from 'pixi.js';
import { audio, type SfxId } from '@/audio';
import { haptic, type HapticId } from '@/core/haptics';
import { lerp, mixColor } from '@/core/math';
import { Ease } from '@/core/tween';
import { Badge, type BadgeValue } from './Badge';
import { desaturate, shade } from './colors';
import { LoadingSpinner } from './Decor';
import { drawIcon, type IconName } from './icons';
import type { Box } from './layoutMath';
import { motion, shakeX, TweenBag } from './motion';
import { clearActivePress, inScrollHost, setActivePress, type Pressable } from './press';
import { drawBevelBase, drawBevelFace, glossGradient, refreshCache, type BevelOpts } from './shapes';
import { fitLabel, uiLabel } from './text';
import { ButtonPalettes, Color, Hit, type ButtonPalette, type ButtonStyleId } from './theme';

export interface ButtonOpts {
  label?: string;
  sublabel?: string;
  icon?: IconName;
  iconColor?: number;
  /** Small icon in front of the sublabel (a coin before a price). */
  sublabelIcon?: IconName;
  style?: ButtonStyleId;
  width?: number;
  height?: number;
  fontSize?: number;
  /** Corner radius; 'pill' makes a capsule (a circle when width == height). */
  radius?: number | 'pill';
  badge?: BadgeValue;
  /** Fire on pointerdown instead of pointerup: gameplay buttons (summon) that must feel instant. */
  fireOnDown?: boolean;
  enabled?: boolean;
  /**
   * What a disabled button shows besides being greyed (colour alone must never carry "locked"):
   * 'lock' hangs a padlock on its corner (default for labelled buttons), 'none' adds nothing
   * (default for icon-only buttons, and right for buttons whose price already explains the state).
   */
  disabledMark?: 'lock' | 'none';
  /** Sound played on press; false for silence. */
  sfx?: SfxId | false;
  haptic?: HapticId | false;
}

/** Disabled look: the same structure with the colour drained and the contrast pulled in. */
function mutedPalette(p: ButtonPalette): ButtonPalette {
  // Fully grey, nudged toward the theme's violet so a locked button still sits in the same colour world.
  const f = (c: number) => shade(mixColor(desaturate(c, 1), 0x7a6fa8, 0.3), -0.04);
  return {
    top: f(p.top),
    base: f(p.base),
    bottom: f(p.bottom),
    rimTop: f(p.rimTop),
    rimBottom: f(p.rimBottom),
    lip: f(p.lip),
    textStroke: 0x35304d,
    glow: f(p.glow),
  };
}

/**
 * The workhorse chunky button. Origin = centre of the face; the lip hangs below it. Pressing drops
 * the face onto the lip and scales it to 0.97 on the very frame of pointerdown (no tween), and
 * releasing springs back with an overshoot. Disabled buttons stay hit-testable so a tap can explain
 * *why* they are disabled (onDisabledTap).
 */
export class Button extends Container implements Pressable {
  /** Nominal footprint (face plus lip) in local space, for the layout helpers. */
  readonly uiBox: Box;
  /** Face width / face + lip height. */
  readonly boxW: number;
  readonly boxH: number;

  protected readonly bag = new TweenBag();
  /** Pulse / shake target; the press animation lives one level deeper on `face`. */
  protected readonly body = new Container();
  protected readonly face = new Container();
  private readonly baseG = new Graphics();
  private readonly faceG = new Graphics();
  private readonly content = new Container();

  private labelT: Text | null = null;
  private subT: Text | null = null;
  private iconG: Graphics | null = null;
  private subIconG: Graphics | null = null;
  private badgeView: Badge | null = null;
  private lockBadge: Container | null = null;
  private spinner: LoadingSpinner | null = null;
  private shineHost: Container | null = null;
  private shineBand: Graphics | null = null;

  private styleId: ButtonStyleId;
  private labelText: string;
  private subText: string;
  private iconName: IconName | undefined;
  private subIconName: IconName | undefined;
  private readonly iconColor: number | undefined;
  private readonly fontSize: number;
  private readonly radius: number;
  private readonly lip: number;
  private readonly outlineW: number;
  private readonly pressDrop: number;

  private isEnabled: boolean;
  private isBusy = false;
  private pressed = false;
  private readonly fireOnDown: boolean;
  private readonly disabledMark: 'lock' | 'none' | undefined;
  private readonly sfx: SfxId | false;
  private readonly hapticId: HapticId | false;
  private tapFn: (() => void) | null = null;
  private disabledFn: (() => void) | null = null;
  private pulsing = false;
  private sfxDeferred = false;

  constructor(opts: ButtonOpts = {}) {
    super();
    const w = opts.width ?? 280;
    const h = opts.height ?? 104;
    this.boxW = w;
    this.styleId = opts.style ?? 'primary';
    this.labelText = opts.label ?? '';
    this.subText = opts.sublabel ?? '';
    this.iconName = opts.icon;
    this.subIconName = opts.sublabelIcon;
    this.iconColor = opts.iconColor;
    this.fontSize = Math.max(20, opts.fontSize ?? Math.round(Math.max(24, Math.min(48, h * 0.38))));
    this.radius = opts.radius === 'pill' ? h / 2 : (opts.radius ?? Math.min(h * 0.3, 36));
    this.lip = Math.round(Math.min(15, Math.max(7, h * 0.13)));
    this.outlineW = h >= 90 ? 5 : 4;
    this.pressDrop = Math.round(this.lip * 0.75);
    this.isEnabled = opts.enabled ?? true;
    this.fireOnDown = opts.fireOnDown ?? false;
    this.disabledMark = opts.disabledMark;
    this.sfx = opts.sfx === undefined ? 'ui_click' : opts.sfx;
    this.hapticId = opts.haptic === undefined ? 'tap' : opts.haptic;
    this.boxH = h + this.lip;
    this.uiBox = { x: -w / 2, y: -h / 2, w, h: h + this.lip };

    this.face.addChild(this.faceG, this.content);
    this.body.addChild(this.baseG, this.face);
    this.addChild(this.body);

    this.redraw();
    this.buildContent();
    this.setBadge(opts.badge);

    // Hit area is at least 88x88 however small the artwork is.
    const hw = Math.max(w, Hit.min);
    const hh = Math.max(h + this.lip, Hit.min);
    this.hitArea = new Rectangle(-hw / 2, this.lip / 2 - hh / 2, hw, hh);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerdown', this.onDown);
    this.on('pointerup', this.onUp);
    this.on('pointerupoutside', this.cancelPress, this);
    this.on('pointerleave', this.cancelPress, this);
    this.on('pointercancel', this.cancelPress, this);
  }

  /* --------------------------------------------------------------- public */

  /** Set (or clear with null) the tap handler. One handler: a later call replaces the earlier one. */
  onTap(fn: (() => void) | null): this {
    this.tapFn = fn;
    return this;
  }

  /** Called when a disabled button is tapped, so the caller can show a "why not" toast. */
  onDisabledTap(fn: (() => void) | null): this {
    this.disabledFn = fn;
    return this;
  }

  get enabled(): boolean {
    return this.isEnabled;
  }

  setEnabled(v: boolean): this {
    if (v === this.isEnabled) return this;
    this.isEnabled = v;
    if (!v) this.cancelPress();
    this.redraw();
    this.buildContent();
    return this;
  }

  get busy(): boolean {
    return this.isBusy;
  }

  /** Busy: a spinner replaces the content and taps are ignored (waiting on an ad or a purchase). */
  setBusy(v: boolean): this {
    if (v === this.isBusy) return this;
    this.isBusy = v;
    if (v) {
      this.cancelPress();
      this.content.alpha = 0;
      if (!this.spinner) {
        this.spinner = new LoadingSpinner({ size: Math.min(this.boxH - this.lip - 18, 64) });
        this.spinner.position.y = -2;
        this.face.addChild(this.spinner);
      }
      this.spinner.visible = true;
    } else {
      this.content.alpha = 1;
      if (this.spinner) this.spinner.visible = false;
    }
    return this;
  }

  get caption(): string {
    return this.labelText;
  }

  setLabel(text: string): this {
    this.labelText = text;
    this.buildContent();
    return this;
  }

  setSublabel(text: string | undefined, icon?: IconName): this {
    this.subText = text ?? '';
    if (!text) this.subIconName = undefined;
    else if (icon) this.subIconName = icon;
    this.buildContent();
    return this;
  }

  setIcon(icon: IconName | undefined): this {
    this.iconName = icon;
    this.buildContent();
    return this;
  }

  setStyle(style: ButtonStyleId): this {
    this.styleId = style;
    this.redraw();
    this.buildContent();
    return this;
  }

  setBadge(value: BadgeValue): this {
    if (!this.badgeView) {
      if (!value) return this;
      this.badgeView = new Badge();
      this.badgeView.position.set(this.boxW / 2 - 10, -(this.boxH - this.lip) / 2 + 8);
      this.body.addChild(this.badgeView);
    }
    this.badgeView.set(value);
    return this;
  }

  /** Attention loop for the main call-to-action: a gentle 1.1 s breathe, five beats by default (-1 = until stopped). */
  startPulse(opts: { amount?: number; times?: number } = {}): this {
    if (motion.reduced || this.pulsing) return this;
    this.pulsing = true;
    const amount = opts.amount ?? 0.045;
    const times = opts.times ?? 5;
    this.bag.runKeyed(this.body, {
      duration: 0.55,
      ease: Ease.sineInOut,
      yoyo: true,
      repeat: times < 0 ? -1 : times * 2 - 1,
      onUpdate: (k) => this.body.scale.set(1 + amount * k),
      onComplete: () => {
        this.pulsing = false;
        this.body.scale.set(1);
      },
    });
    return this;
  }

  stopPulse(): this {
    if (!this.pulsing) return this;
    this.pulsing = false;
    this.bag.killKeyed(this.body);
    this.body.scale.set(1);
    return this;
  }

  /** A glossy diagonal highlight sweeps across the face once (call every few seconds on a CTA). */
  shine(): this {
    if (motion.reduced || this.shineHost?.visible) return this;
    const faceW = this.boxW;
    const faceH = this.boxH - this.lip;
    if (!this.shineHost || !this.shineBand) {
      const host = new Container();
      const mask = new Graphics();
      const inset = this.outlineW + 2;
      mask
        .roundRect(-faceW / 2 + inset, -faceH / 2 + inset, faceW - inset * 2, faceH - inset * 2, Math.max(2, this.radius - inset))
        .fill(0xffffff);
      const band = new Graphics();
      const bw = faceH * 0.42;
      const skew = faceH * 0.5;
      band
        .poly([-bw / 2 + skew / 2, -faceH / 2, bw / 2 + skew / 2, -faceH / 2, bw / 2 - skew / 2, faceH / 2, -bw / 2 - skew / 2, faceH / 2])
        .fill(glossGradient(0.5, 0.5));
      band
        .poly([bw * 0.8 + skew / 2, -faceH / 2, bw * 1.0 + skew / 2, -faceH / 2, bw * 1.0 - skew / 2, faceH / 2, bw * 0.8 - skew / 2, faceH / 2])
        .fill({ color: 0xffffff, alpha: 0.38 });
      host.addChild(mask, band);
      host.mask = mask;
      this.face.addChildAt(host, 1);
      this.shineHost = host;
      this.shineBand = band;
    }
    const host = this.shineHost;
    const band = this.shineBand;
    host.visible = true;
    const from = -faceW / 2 - faceH;
    const to = faceW / 2 + faceH;
    this.bag.runKeyed(host, {
      duration: 0.55,
      ease: Ease.cubicInOut,
      onUpdate: (k) => {
        band.x = lerp(from, to, k);
      },
      onComplete: () => {
        host.visible = false;
      },
    });
    return this;
  }

  /** Release without firing (finger left the button, a scroll took over, the button was disabled). */
  cancelPress(): void {
    if (!this.pressed) return;
    this.pressed = false;
    clearActivePress(this);
    this.releaseVisual(false);
  }

  override destroy(options?: DestroyOptions): void {
    clearActivePress(this);
    this.bag.killAll();
    this.tapFn = null;
    this.disabledFn = null;
    super.destroy(options);
  }

  /* ------------------------------------------------------------- drawing */

  private get palette(): ButtonPalette {
    const p = ButtonPalettes[this.styleId];
    return this.isEnabled ? p : mutedPalette(p);
  }

  private bevel(): BevelOpts {
    const p = this.palette;
    return {
      radius: this.radius,
      top: p.top,
      base: p.base,
      bottom: p.bottom,
      rimTop: p.rimTop,
      rimBottom: p.rimBottom,
      outlineWidth: this.outlineW,
      lip: { depth: this.lip, color: p.lip },
      gloss: this.isEnabled ? 0.3 : 0.16,
    };
  }

  private redraw(): void {
    const w = this.boxW;
    const h = this.boxH - this.lip;
    const o = this.bevel();
    this.baseG.clear();
    this.faceG.clear();
    drawBevelBase(this.baseG, -w / 2, -h / 2, w, h, o);
    drawBevelFace(this.faceG, -w / 2, -h / 2, w, h, o);
    // Many buttons on screen at once: baked, each is one textured quad instead of a dozen vector batches.
    refreshCache(this.baseG);
    refreshCache(this.faceG);
  }

  private buildContent(): void {
    for (const c of [this.labelT, this.subT, this.iconG, this.subIconG, this.lockBadge]) c?.destroy({ children: true });
    this.labelT = this.subT = null;
    this.iconG = this.subIconG = null;
    this.lockBadge = null;

    const w = this.boxW;
    const h = this.boxH - this.lip;
    const fs = this.fontSize;
    const textColor = this.isEnabled ? 0xffffff : 0xded9ec;
    const stroke = this.palette.textStroke;
    const hasLabel = this.labelText !== '';
    const hasSub = this.subText !== '';
    const padX = 18 + this.radius * 0.35;

    // A disabled button wears a padlock on its corner: greying alone is not a signal (and the badge
    // never takes room from the label).
    if (!this.isEnabled && (this.disabledMark ?? (hasLabel ? 'lock' : 'none')) === 'lock') {
      const sz = Math.round(Math.max(26, Math.min(40, h * 0.36)));
      const plate = new Graphics();
      plate.circle(0, 0, sz * 0.68).fill(0x2a1f4a).stroke({ width: 3, color: Color.outline, alignment: 1 });
      const badge = new Container();
      badge.addChild(plate, drawIcon('lock', sz));
      badge.position.set(-w / 2 + sz * 0.45 + 6, -h / 2 + sz * 0.4 + 2);
      this.body.addChild(badge);
      this.lockBadge = badge;
    }

    let iconSize = 0;
    if (this.iconName) {
      iconSize = hasLabel ? Math.round(Math.min(h * 0.58, fs * 1.3)) : Math.round(Math.min(w, h) * 0.62);
      this.iconG = drawIcon(this.iconName, iconSize, this.iconColor);
      if (!this.isEnabled) this.iconG.alpha = 0.55;
      this.content.addChild(this.iconG);
    }
    const gap = hasLabel && this.iconG ? 10 : 0;
    if (hasLabel) {
      this.labelT = uiLabel(this.labelText, { size: fs, color: textColor, stroke, strokeWidth: Math.max(4, Math.round(fs * 0.17)) });
      fitLabel(this.labelT, w - padX * 2 - iconSize - gap, fs);
      this.content.addChild(this.labelT);
    }
    const subFs = Math.max(20, Math.round(fs * 0.58));
    let subIconSize = 0;
    if (hasSub) {
      this.subT = uiLabel(this.subText, { size: subFs, color: textColor, stroke, strokeWidth: Math.max(3, Math.round(subFs * 0.17)) });
      fitLabel(this.subT, w - padX * 2 - subFs * 1.4, subFs);
      this.content.addChild(this.subT);
      if (this.subIconName) {
        subIconSize = Math.round(subFs * 1.25);
        this.subIconG = drawIcon(this.subIconName, subIconSize);
        this.content.addChild(this.subIconG);
      }
    }

    const hasRow1 = hasLabel || this.iconG !== null;
    const row1H = hasLabel ? fs * 1.08 : iconSize;
    const row2H = hasSub ? subFs * 1.1 : 0;
    const total = (hasRow1 ? row1H : 0) + (hasSub ? row2H - (hasRow1 ? 2 : 0) : 0);
    let y = -total / 2 - 2;

    if (hasRow1) {
      const labelW = this.labelT ? this.labelT.width : 0;
      let x = -(iconSize + gap + labelW) / 2;
      const cy = y + row1H / 2;
      if (this.iconG) {
        this.iconG.position.set(x + iconSize / 2, cy);
        x += iconSize + gap;
      }
      if (this.labelT) this.labelT.position.set(x + labelW / 2, cy);
      y += row1H - 2;
    }
    if (this.subT) {
      const subW = this.subT.width;
      const rowW = subIconSize + (subIconSize ? 6 : 0) + subW;
      const cy = y + row2H / 2;
      let x = -rowW / 2;
      if (this.subIconG) {
        this.subIconG.position.set(x + subIconSize / 2, cy);
        x += subIconSize + 6;
      }
      this.subT.position.set(x + subW / 2, cy);
    }
  }

  /* ----------------------------------------------------------- interaction */

  private onDown = (): void => {
    if (this.destroyed) return;
    if (!this.isEnabled) {
      shakeX(this.bag, this.body, 0, 6, 3, 0.18);
      audio.play('ui_error', { volume: 0.5 });
      haptic('warning');
      this.disabledFn?.();
      return;
    }
    if (this.isBusy) return;
    this.pressed = true;
    setActivePress(this);
    this.bag.killKeyed(this.face);
    // The visual change happens on this very frame: no tween, so the press feels instant.
    this.face.y = this.pressDrop;
    this.face.scale.set(0.97);
    this.face.tint = 0xe9e3f7;
    if (this.hapticId) haptic(this.hapticId);
    // Inside a scroll list the click waits for the tap to be confirmed, so a drag stays silent.
    this.sfxDeferred = inScrollHost(this);
    if (this.sfx && !this.sfxDeferred) audio.play(this.sfx);
    if (this.fireOnDown) this.tapFn?.();
  };

  private onUp = (): void => {
    if (!this.pressed) return;
    this.pressed = false;
    clearActivePress(this);
    this.releaseVisual(true);
    if (this.sfx && this.sfxDeferred) audio.play(this.sfx);
    if (!this.fireOnDown) this.tapFn?.();
  };

  private releaseVisual(bounce: boolean): void {
    const face = this.face;
    const y0 = face.y;
    const s0 = face.scale.x;
    face.tint = 0xffffff;
    if (motion.reduced || y0 === 0) {
      face.y = 0;
      face.scale.set(1);
      return;
    }
    this.bag.runKeyed(face, {
      duration: bounce ? 0.16 : 0.1,
      ease: Ease.linear,
      onUpdate: (k) => {
        if (!bounce) {
          const e = Ease.quadOut(k);
          face.y = lerp(y0, 0, e);
          face.scale.set(lerp(s0, 1, e));
        } else if (k < 0.45) {
          // spring up past rest, overshooting scale a little...
          const e = Ease.quadOut(k / 0.45);
          face.y = lerp(y0, -2, e);
          face.scale.set(lerp(s0, 1.06, e));
        } else {
          // ...then settle
          const e = Ease.sineInOut((k - 0.45) / 0.55);
          face.y = lerp(-2, 0, e);
          face.scale.set(lerp(1.06, 1, e));
        }
      },
      onComplete: () => {
        face.y = 0;
        face.scale.set(1);
      },
    });
  }
}
