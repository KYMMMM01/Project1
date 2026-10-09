/** The "claim all" line of a list: how many rewards wait on the left, one big button on the right. Used by the notebook pages and the cup / endless cards. */
import { Container, type DestroyOptions, type Text } from 'pixi.js';
import { t } from '@/core/i18n';
import { tn } from '@/meta/plural';
import { Button, Color, fitLabel, uiLabel } from '@/ui';
import type { Box } from '@/ui/layoutMath';
import { refusalCue } from '@/ui/press';
import { toast } from '@/ui/Toast';
import { CLAIM_ALL_MIN, claimAllReading } from './model';
import './strings';

/** 88 px touch target with 12 px of air above and below. */
export const CLAIM_BAR_H = 112;
const BTN_W = 200;
const BTN_H = 88;
/** Air between the note and the button. */
const GAP = 16;

export interface ClaimAllBarOpts {
  /** Width of the line. */
  width: number;
  /** Left edge of the note. */
  textX: number;
  /** Distance of the button's right edge from the line's right edge. */
  edge: number;
  onClaim(button: Button): void;
}

/** Origin = top-left of the line. */
export class ClaimAllBar extends Container {
  readonly uiBox: Box;
  readonly button: Button;
  private readonly note: Text;
  private readonly room: number;
  private shownNote = '';

  constructor(o: ClaimAllBarOpts) {
    super();
    this.uiBox = { x: 0, y: 0, w: o.width, h: CLAIM_BAR_H };
    const cy = CLAIM_BAR_H / 2;
    this.button = new Button({ label: t('rt.mis.all'), style: 'success', width: BTN_W, height: BTN_H, fontSize: 32, disabledMark: 'none' });
    this.button.position.set(o.width - o.edge - BTN_W / 2, cy);
    this.button.onTap(() => o.onClaim(this.button));
    // Tapping the dimmed button says why, in the same breath as the other refusals.
    this.button.onDisabledTap(() => {
      refusalCue();
      toast(t('rt.mis.all.few', { n: CLAIM_ALL_MIN }), 'info');
    });
    this.room = o.width - o.edge - BTN_W - GAP - o.textX;
    this.note = uiLabel('', { size: 26, color: Color.inkSoft, align: 'left', anchorX: 0 });
    this.note.position.set(o.textX, cy);
    this.addChild(this.note, this.button);
    this.sync(0);
  }

  /** Bring the line to `waiting` finished rewards: the button opens at two, the note counts them. */
  sync(waiting: number): void {
    const r = claimAllReading(waiting);
    const text = waiting > 0 ? tn(r.noteKey, waiting) : t(r.noteKey);
    if (text !== this.shownNote) {
      this.shownNote = text;
      this.note.text = text;
      fitLabel(this.note, this.room, 26);
    }
    this.button.setEnabled(r.enabled);
    this.button.setBadge(r.enabled ? waiting : undefined);
    if (r.enabled) this.button.startPulse({ times: 3 });
    else this.button.stopPulse();
  }

  override destroy(options?: DestroyOptions): void {
    this.button.stopPulse();
    super.destroy(options);
  }
}
