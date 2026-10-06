import type { Text } from 'pixi.js';
import { Button } from './Button';
import { Panel } from './Panel';
import { Popup, popups } from './Popup';
import { uiLabel } from './text';
import { Color, type ButtonStyleId } from './theme';

interface DialogButton {
  label: string;
  style: ButtonStyleId;
  result: boolean;
}

interface DialogSpec {
  title: string;
  message: string;
  buttons: DialogButton[];
  backdropClose: boolean;
  dismissResult: boolean;
  priority: number;
}

const W = 620;

/** Message + one or two buttons on a ribbon-titled panel. The building block of confirm/alert. */
class DialogPopup extends Popup<boolean> {
  constructor(spec: DialogSpec) {
    super({
      dismissResult: spec.dismissResult,
      backdropClose: spec.backdropClose,
      priority: spec.priority,
    });
    const msg: Text = uiLabel(spec.message, {
      size: 32,
      wrap: W - 110,
      lineHeight: 44,
      color: 0xffffff,
      stroke: Color.outline,
      strokeWidth: 5,
      shadow: false,
    });
    const top = 92;
    const btnH = 104;
    const h = top + msg.height + 44 + btnH + 52;
    const panel = new Panel({ width: W, height: h, title: spec.title });
    msg.position.set(W / 2, top + msg.height / 2);
    panel.content.addChild(msg);

    const n = spec.buttons.length;
    const gap = 24;
    const bw = n === 1 ? 300 : (W - 80 - gap) / 2;
    spec.buttons.forEach((b, i) => {
      const btn = new Button({ label: b.label, style: b.style, width: bw, height: btnH, fontSize: 40 });
      btn.position.set(W / 2 + (i - (n - 1) / 2) * (bw + gap), h - 52 - btnH / 2);
      btn.onTap(() => this.close(b.result));
      panel.content.addChild(btn);
    });
    this.body.addChild(panel);
    // Ribbon tails reach 36 px past the panel on each side and the ribbon rises above it.
    this.setContentSize(W + 80, h + 90);
  }
}

export interface ConfirmOpts {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Destructive action: red confirm button, and the backdrop no longer dismisses it. */
  danger?: boolean;
}

/** Yes/no question. Resolves true on confirm, false on cancel / backdrop / Escape. */
export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return popups.open(
    new DialogPopup({
      title: opts.title,
      message: opts.message,
      buttons: [
        { label: opts.cancelLabel, style: 'neutral', result: false },
        { label: opts.confirmLabel, style: opts.danger ? 'danger' : 'success', result: true },
      ],
      backdropClose: !opts.danger,
      dismissResult: false,
      priority: 2,
    }),
  );
}

export interface AlertOpts {
  title: string;
  message: string;
  okLabel: string;
}

/** Notice with a single button. Resolves when dismissed. */
export async function alertDialog(opts: AlertOpts): Promise<void> {
  await popups.open(
    new DialogPopup({
      title: opts.title,
      message: opts.message,
      buttons: [{ label: opts.okLabel, style: 'primary', result: true }],
      backdropClose: true,
      dismissResult: true,
      priority: 3,
    }),
  );
}
