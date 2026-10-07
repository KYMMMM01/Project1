/** The "Meow Code" popups: show the backup code with a copy button, and import one with a preview first. */
import { Container, Graphics } from 'pixi.js';
import { audio } from '@/audio';
import { fmt } from '@/core/format';
import { haptic } from '@/core/haptics';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { errorKey, profile } from '@/meta';
import type { BackupPreview } from '@/meta/profile';
import { backOut, Button, Color, drawDashedLine, drawIcon, fitLabel, motion, Panel, Popup, toast, TweenBag, uiLabel } from '@/ui';
import { refusalCue } from '@/ui/press';
import { DomTextField } from './domField';
import { paperSheet } from './kit/sheets';
import { markProfileSeen } from './prefs';
import { savedAtText } from './settingsModel';
import './strings';

const W = 640;
const PAD = 40;
const FIELD_H = 230;
const BUTTON_GAP = 20;
/** Height of one line of the receipt. */
const ROW = 56;
/** How far a new stage's sheet drops while it settles. */
const STAGE_DROP = 16;

/** Copy text through the async clipboard, falling back to the selection command; true when it worked. */
async function copyText(field: DomTextField): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(field.value);
    return true;
  } catch {
    field.selectAll();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}

/** The field's recessed well and the invisible rectangle the DOM element is placed over. */
function fieldFrame(y: number): { frame: Container; anchor: Graphics } {
  const frame = new Container();
  frame.addChild(paperSheet(W - PAD * 2, FIELD_H, { fill: Color.paperDim, radius: 24, shadow: false }));
  frame.position.set(PAD, y);
  const anchor = new Graphics();
  anchor.rect(0, 0, W - PAD * 2 - 20, FIELD_H - 20).fill({ color: Color.ink, alpha: 0 });
  anchor.position.set(10, 10);
  frame.addChild(anchor);
  return { frame, anchor };
}

/** The code of this profile, ready to copy. */
export class CodeExportPopup extends Popup<void> {
  private readonly bag = new TweenBag();
  private readonly field: DomTextField;
  private closing = false;

  constructor(code: string) {
    super({ dismissResult: undefined, priority: 3 });
    this.field = new DomTextField({ readOnly: true, value: code });
    const help = uiLabel(t('rt.sys.code.exportHelp'), { size: 28, wrap: W - PAD * 2, lineHeight: 38 });
    const fieldY = 96 + help.height + 26;
    const h = fieldY + FIELD_H + 20 + 30 + 20 + 104 + 44;
    const panel = new Panel({ width: W, height: h, title: t('rt.sys.code.title'), torn: 'bottom', tape: 'sky', onClose: () => this.close() });
    help.position.set(W / 2, 96 + help.height / 2);
    const { frame, anchor } = fieldFrame(fieldY);
    const len = uiLabel(t('rt.sys.code.length', { n: fmt(code.length) }), { size: 24, color: Color.inkSoft, anchorX: 1 });
    len.position.set(W - PAD, fieldY + FIELD_H + 24);
    const copy = new Button({ label: t('rt.sys.code.copy'), style: 'primary', width: 360, height: 104, fontSize: 40, icon: 'code' });
    copy.position.set(W / 2, h - 44 - 52);
    copy.onTap(() => void this.copy());
    panel.content.addChild(help, frame, len, copy);
    this.body.addChild(panel);
    this.setContentSize(W + 80, h + 90);
    this.bag.call(0.3, () => {
      if (!this.closing) this.field.attach(anchor);
    });
  }

  private async copy(): Promise<void> {
    const ok = await copyText(this.field);
    audio.play(ok ? 'ui_confirm' : 'ui_error');
    toast(t(ok ? 'rt.sys.code.copied' : 'rt.sys.code.copyFail'), ok ? 'success' : 'warning');
  }

  override layout(w: number, h: number): void {
    super.layout(w, h);
    this.field.place();
  }

  override close(result?: void): void {
    this.closing = true;
    this.field.hide();
    super.close(result);
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.bag.killAll();
    this.field.destroy();
    super.destroy(options);
  }
}

type Stage = { kind: 'input' } | { kind: 'preview'; code: string; info: BackupPreview };

/** Paste a code, see what it holds, then replace the profile. Nothing changes until the last button. */
export class CodeImportPopup extends Popup<boolean> {
  private readonly bag = new TweenBag();
  private readonly field: DomTextField;
  private readonly layer = new Container();
  private panel: Panel | null = null;
  private closing = false;
  private opened = false;
  private busy = false;

  constructor(private readonly onApplied: () => void) {
    super({ dismissResult: false, priority: 3 });
    this.field = new DomTextField({ readOnly: false, placeholder: t('rt.sys.code.placeholder') });
    this.render({ kind: 'input' });
  }

  /** Each stage has its own height: the sheet is cut again to fit it. */
  private render(stage: Stage): void {
    for (const c of this.layer.removeChildren()) c.destroy({ children: true });
    const h = stage.kind === 'input' ? this.renderInput() : this.renderPreview(stage);
    this.layer.parent?.removeChild(this.layer);
    this.panel?.destroy({ children: true });
    const panel = new Panel({ width: W, height: h, title: t('rt.sys.code.import'), torn: 'bottom', tape: 'sky', onClose: () => this.close() });
    panel.content.addChild(this.layer);
    this.body.addChild(panel);
    this.panel = panel;
    this.setContentSize(W + 80, h + 90);
    if (this.screenW > 0) this.layout(this.screenW, this.screenH);
    if (this.opened) this.settle(panel);
  }

  /** A new stage is a new sheet laid down: it drops a little and settles (the field waits for it). */
  private settle(panel: Panel): void {
    if (motion.reduced) return;
    const spring = backOut(1.8);
    this.bag.run({
      duration: 0.24,
      ease: Ease.linear,
      onUpdate: (k) => {
        const e = spring(k);
        panel.scale.set(0.93 + 0.07 * e);
        panel.y = STAGE_DROP * (1 - e);
      },
      onComplete: () => {
        panel.scale.set(1);
        panel.y = 0;
      },
    });
  }

  /** Lays the stage out into `layer`; returns the height of the sheet it needs. */
  private renderInput(): number {
    const help = uiLabel(t('rt.sys.code.importHelp'), { size: 28, wrap: W - PAD * 2, lineHeight: 38 });
    help.position.set(W / 2, 96 + help.height / 2);
    const fieldY = 96 + help.height + 26;
    const { frame, anchor } = fieldFrame(fieldY);
    const by = fieldY + FIELD_H + 36 + 52;
    // Two equal buttons between the sheet's margins (the field above them is as wide).
    const bw = (W - PAD * 2 - BUTTON_GAP) / 2;
    const paste = new Button({ label: t('rt.sys.code.paste'), style: 'info', width: bw, height: 104, fontSize: 36 });
    paste.position.set(W / 2 - (bw + BUTTON_GAP) / 2, by);
    paste.onTap(() => void this.paste());
    const check = new Button({ label: t('rt.sys.code.check'), style: 'primary', width: bw, height: 104, fontSize: 36 });
    check.position.set(W / 2 + (bw + BUTTON_GAP) / 2, by);
    check.onTap(() => void this.check());
    this.layer.addChild(help, frame, paste, check);
    // Placed from the anchor's on-screen bounds, which are only right once the popup is on stage and has settled.
    this.bag.call(this.opened && motion.reduced ? 0.05 : 0.3, () => {
      if (!this.closing && !anchor.destroyed) this.field.attach(anchor);
    });
    return by + 52 + 48;
  }

  private renderPreview(stage: Extract<Stage, { kind: 'preview' }>): number {
    this.field.hide();
    const title = uiLabel(t('rt.sys.code.previewTitle'), { size: 32 });
    title.position.set(W / 2, 112);
    const info = stage.info;
    const rows: [string, string][] = [
      [t('rt.sys.code.level'), String(info.accountLevel)],
      [t('rt.sys.code.gold'), fmt(info.gold)],
      [t('rt.sys.code.gems'), fmt(info.gems)],
      [t('rt.sys.code.chapters'), String(info.chaptersCleared)],
    ];
    const saved = savedAtText(info.savedAt);
    if (saved) rows.push([t('rt.sys.code.savedAt'), saved]);
    // What the code holds, as a receipt: ruled rows on an ivory slip.
    const slipH = rows.length * ROW + 28;
    const slip = new Container();
    slip.addChild(paperSheet(W - PAD * 2, slipH, { fill: Color.paperLight, radius: 20, torn: ['top', 'bottom'] }));
    slip.position.set(PAD, 150);
    const rules = new Graphics();
    slip.addChild(rules);
    this.layer.addChild(title, slip);
    rows.forEach(([k, v], i) => {
      const y = 14 + i * ROW + ROW / 2;
      const key = uiLabel(k, { size: 28, color: Color.inkSoft, anchorX: 0 });
      key.position.set(26, y);
      const val = uiLabel(v, { size: 30, anchorX: 1 });
      val.position.set(W - PAD * 2 - 26, y);
      fitLabel(val, 300, 30);
      slip.addChild(key, val);
      if (i < rows.length - 1) drawDashedLine(rules, 22, y + ROW / 2, W - PAD * 2 - 22, y + ROW / 2, { width: 2.5, alpha: 0.6, seed: i + 1 });
    });
    const warnY = 150 + slipH + 22;
    const warn = uiLabel(t('rt.sys.code.warn'), { size: 26, color: Color.inkDeep, wrap: W - PAD * 2 - 92, align: 'left', anchorX: 0, anchorY: 0, lineHeight: 34 });
    const warnH = Math.max(78, Math.ceil(warn.height) + 28);
    const note = new Container();
    note.addChild(paperSheet(W - PAD * 2, warnH, { fill: Color.mustard, radius: 18 }));
    const sign = drawIcon('warning', 46);
    sign.position.set(46, warnH / 2);
    warn.position.set(82, (warnH - warn.height) / 2);
    note.addChild(sign, warn);
    note.position.set(PAD, warnY);
    const applyY = warnY + warnH + 24 + 52;
    const apply = new Button({ label: t('rt.sys.code.apply'), style: 'danger', width: 520, height: 104, fontSize: 36 });
    apply.position.set(W / 2, applyY);
    apply.onTap(() => void this.apply(stage.code));
    const backY = applyY + 52 + 16 + 44;
    const back = new Button({ label: t('rt.sys.code.back'), style: 'neutral', width: 320, height: 88, fontSize: 30 });
    back.position.set(W / 2, backY);
    back.onTap(() => this.render({ kind: 'input' }));
    this.layer.addChild(note, apply, back);
    return backY + 44 + 48;
  }

  private async paste(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      this.field.value = text.trim();
      audio.play('ui_click');
    } catch {
      toast(t('rt.sys.code.pasteFail'), 'warning');
      this.field.el.focus();
    }
  }

  private async check(): Promise<void> {
    if (this.busy) return;
    const code = this.field.value.trim();
    if (!code) {
      refusalCue();
      toast(t('rt.sys.code.empty'), 'warning');
      return;
    }
    this.busy = true;
    const r = await profile.inspectCode(code);
    this.busy = false;
    if (this.destroyed) return;
    if (!r.ok) {
      refusalCue();
      toast(t(errorKey(r.error)), 'error');
      return;
    }
    this.render({ kind: 'preview', code, info: r.value });
  }

  private async apply(code: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const r = await profile.importCode(code);
    this.busy = false;
    // The profile is replaced whether or not this popup is still on screen: what it holds is not news.
    if (r.ok) markProfileSeen();
    if (this.destroyed) return;
    if (!r.ok) {
      refusalCue();
      toast(t(errorKey(r.error)), 'error');
      this.render({ kind: 'input' });
      return;
    }
    haptic('success');
    audio.play('reward_claim');
    toast(t('meta.toast.restored'), 'success');
    this.onApplied();
    this.close(true);
  }

  override layout(w: number, h: number): void {
    super.layout(w, h);
    this.field.place();
  }

  override close(result?: boolean): void {
    this.closing = true;
    this.field.hide();
    super.close(result);
  }

  override onOpened(): void {
    this.opened = true;
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.bag.killAll();
    this.field.destroy();
    super.destroy(options);
  }
}
