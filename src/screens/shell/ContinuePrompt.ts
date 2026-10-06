/**
 * "Continue the run?": the question after an app kill, as a scrapbook sheet that shows what is being
 * picked up (the chapter's photo with its name and the wave reached) above the two answers.
 */
import { t } from '@/core/i18n';
import { Button, PaperLabel, Panel, Popup, popups, uiLabel } from '@/ui';
import { ChapterPhoto, chapterInfo } from '../battle/ChapterPhoto';
import './strings';

const W = 620;
const PHOTO_H = 236;
const BTN_H = 104;
const GAP = 24;

class ContinuePopup extends Popup<boolean> {
  constructor(chapter: number, wave: number | undefined) {
    super({ dismissResult: false, backdropClose: false, priority: 2 });
    const photoW = W - 80;
    const top = 100;
    const msg = uiLabel(t('shell.cont.body'), { size: 30, wrap: W - 110, lineHeight: 42 });
    const h = top + PHOTO_H + 38 + msg.height + 36 + BTN_H + 48;
    const panel = new Panel({ width: W, height: h, title: t('shell.cont.title'), torn: 'bottom' });

    const photo = new ChapterPhoto({ w: photoW, h: PHOTO_H, chapter, tape: 'sky', tilt: -0.012 });
    photo.position.set(40, top);
    const name = new PaperLabel({ text: t(chapterInfo(chapter).nameKey), size: 38, paper: 'mustard', padX: 28, padY: 10, maxWidth: photoW * 0.6 });
    name.position.set(56 - name.uiBox.x, top + PHOTO_H - 34);
    panel.content.addChild(photo, name);
    if (wave) {
      const tag = new PaperLabel({ text: t('shell.cont.wave', { n: wave }), size: 30, paper: 'primary', padX: 24, padY: 9, maxWidth: photoW * 0.4 });
      tag.position.set(W - 56 - tag.uiBox.w / 2, top + 42);
      panel.content.addChild(tag);
    }

    msg.position.set(W / 2, top + PHOTO_H + 38 + msg.height / 2);
    panel.content.addChild(msg);

    const bw = (W - 80 - GAP) / 2;
    const y = h - 48 - BTN_H / 2;
    const answers: ReadonlyArray<{ label: string; style: 'neutral' | 'primary'; result: boolean }> = [
      { label: t('shell.cont.no'), style: 'neutral', result: false },
      { label: t('shell.cont.yes'), style: 'primary', result: true },
    ];
    answers.forEach((a, i) => {
      const btn = new Button({ label: a.label, style: a.style, width: bw, height: BTN_H, fontSize: 40 });
      btn.position.set(W / 2 + (i - 0.5) * (bw + GAP), y);
      btn.onTap(() => this.close(a.result));
      panel.content.addChild(btn);
    });
    this.body.addChild(panel);
    this.setContentSize(W + 80, h + 90);
  }
}

/** Resolves true to continue the run, false for the other answer or Escape / Back. */
export function continuePrompt(chapter: number, wave: number | undefined): Promise<boolean> {
  return popups.open(new ContinuePopup(chapter, wave));
}
