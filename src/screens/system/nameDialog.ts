/**
 * The ranking name (docs/계정_Firebase.md): a sheet with one text field. The field itself is a real <input> laid over the drawn box, so the
 * phone's own keyboard, Korean composition and the caret work as everywhere else; the canvas only draws the box around it. The sheet sits
 * high on the screen so the keyboard never covers the field, however the app resizes when it opens.
 */
import { Graphics, type Text } from 'pixi.js';
import { game } from '@/core/game';
import { t } from '@/core/i18n';
import { cleanName, NAME_MAX, NAME_MIN } from '../../../functions/src/rules';
import { ranking, type NameResult } from '@/platform';
import { balanceWrap, Button, Color, FONT_FAMILY, Panel, Popup, popups, toast, uiLabel } from '@/ui';
import './strings';

const W = 620;
const FIELD_W = W - 100;
const FIELD_H = 92;
const BTN_H = 104;

const WHY: Record<Exclude<NameResult, 'ok'>, string> = {
  'bad-name': 'rt.sys.name.bad',
  'blocked-name': 'rt.sys.name.blocked',
  'too-soon': 'rt.sys.name.soon',
  failed: 'rt.sys.name.failed',
};

class NamePopup extends Popup<string | null> {
  private readonly input = document.createElement('input');
  private readonly field = new Graphics();
  private readonly error: Text;
  private readonly save: Button;
  private readonly sheetH: number;
  private busy = false;
  private readonly follow = (): void => this.place();

  constructor(current: string) {
    super({ dismissResult: null, backdropClose: false, priority: 2 });
    const top = 92;
    const hint = uiLabel(t('rt.sys.name.hint', { min: NAME_MIN, max: NAME_MAX }), { size: 26, color: Color.inkSoft, wrap: W - 110, lineHeight: 36 });
    balanceWrap(hint, W - 110);
    hint.position.set(W / 2, top + hint.height / 2);
    let y = top + hint.height + 24;
    this.field.roundRect(0, 0, FIELD_W, FIELD_H, 18).fill(Color.paperLight).stroke({ width: 4, color: Color.kraftDark });
    this.field.position.set((W - FIELD_W) / 2, y);
    y += FIELD_H + 14;
    this.error = uiLabel(' ', { size: 26, color: Color.berryDark, wrap: W - 110 });
    this.error.position.set(W / 2, y + 20);
    y += 40 + 28;
    const h = y + BTN_H + 52;
    this.sheetH = h + 90;
    const panel = new Panel({ width: W, height: h, title: t('rt.sys.name'), torn: 'bottom', tape: 'sky' });
    panel.content.addChild(hint, this.field, this.error);

    const gap = 24;
    const bw = (W - 80 - gap) / 2;
    const cancel = new Button({ label: t('rt.sys.acct.cancel'), style: 'neutral', width: bw, height: BTN_H, fontSize: 40 });
    cancel.position.set(W / 2 - (bw + gap) / 2, h - 52 - BTN_H / 2);
    cancel.onTap(() => this.close());
    this.save = new Button({ label: t('rt.sys.name.save'), style: 'success', width: bw, height: BTN_H, fontSize: 40 });
    this.save.position.set(W / 2 + (bw + gap) / 2, h - 52 - BTN_H / 2);
    this.save.onTap(() => void this.submit());
    panel.content.addChild(cancel, this.save);
    this.body.addChild(panel);
    this.setContentSize(W + 80, this.sheetH);

    const el = this.input;
    el.type = 'text';
    el.value = current;
    el.autocomplete = 'off';
    el.spellcheck = false;
    el.enterKeyHint = 'done';
    el.setAttribute('autocapitalize', 'off');
    el.setAttribute('aria-label', t('rt.sys.name'));
    el.style.cssText =
      'position:fixed;z-index:20;margin:0;padding:0 16px;border:0;outline:none;background:transparent;box-sizing:border-box;text-align:center;';
    // Pixi quotes the shared family list in place once a label uses it, so the quotes come off before CSS gets its own (generic
    // names stay bare).
    el.style.fontFamily = FONT_FAMILY.map((f) => {
      const n = f.replace(/["']/g, '');
      return n === 'system-ui' || n === 'sans-serif' ? n : `"${n}"`;
    }).join(',');
    el.style.userSelect = 'text';
    el.style.color = '#' + Color.ink.toString(16).padStart(6, '0');
    el.addEventListener('input', () => this.say(''));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.submit();
    });
  }

  override onOpened(): void {
    document.body.appendChild(this.input);
    game.app.ticker.add(this.follow);
    this.place();
    this.input.focus({ preventScroll: true });
  }

  /** High on the screen: the keyboard rises over the lower half. */
  override layout(w: number, h: number): void {
    super.layout(w, h);
    const half = (this.sheetH * this.body.scale.y) / 2;
    this.shell.y = Math.min(h / 2, Math.max(half + 24, h * 0.3));
  }

  override close(result?: string | null): void {
    this.detachInput();
    super.close(result);
  }

  override destroy(...args: Parameters<Popup['destroy']>): void {
    this.detachInput();
    super.destroy(...args);
  }

  private detachInput(): void {
    game.app?.ticker.remove(this.follow);
    this.input.blur();
    this.input.remove();
  }

  /** Lay the input over the drawn box, following the open animation and any resize (the keyboard). */
  private place(): void {
    if (this.destroyed) return;
    const b = this.field.getBounds();
    const r = game.app.canvas.getBoundingClientRect();
    const s = this.input.style;
    s.left = `${r.left + b.x}px`;
    s.top = `${r.top + b.y}px`;
    s.width = `${b.width}px`;
    s.height = `${b.height}px`;
    s.fontSize = `${Math.round(b.height * 0.42)}px`;
    s.opacity = String(this.shell.alpha);
  }

  private say(text: string): void {
    this.error.text = text || ' ';
  }

  private async submit(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.save.setEnabled(false);
    // The same check as the server's, so a bad name is answered at once and offline.
    const got = cleanName(this.input.value);
    const r = 'why' in got ? got.why : await ranking.setName(got.name);
    if (this.destroyed) return;
    this.busy = false;
    this.save.setEnabled(true);
    if (r === 'ok' && 'name' in got) {
      toast(t('rt.sys.name.done'), 'success');
      this.close(got.name);
    } else if (r !== 'ok') this.say(t(WHY[r], { min: NAME_MIN, max: NAME_MAX }));
  }
}

/** The name change sheet; resolves to the new name, or null when the player closed it. `current` defaults to the name on the server. */
export async function changeNameFlow(current?: string): Promise<string | null> {
  const now = current ?? (await ranking.myName()) ?? '';
  return popups.open(new NamePopup(now));
}
