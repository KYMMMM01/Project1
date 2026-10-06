/** Small paper tags that state a fact: days left, a countdown. */
import { Container, Graphics, type Text } from 'pixi.js';
import { t } from '@/core/i18n';
import { cacheStatic, Color, drawIcon, drawPaper, fitLabel, paperSeed, uiLabel, type IconName } from '@/ui';
import type { Box } from '@/ui/layoutMath';
import { countdownText } from './time';

const TAG_H = 48;

/**
 * A fixed-width paper pill with an icon and one line of text. The pill is cut once; only the text
 * changes. Origin = the tag's right edge, vertically centred.
 */
export class NoteTag extends Container {
  readonly uiBox: Box;
  private readonly text: Text;
  private readonly room: number;

  constructor(width: number, icon: IconName) {
    super();
    this.room = width - 74;
    this.uiBox = { x: -width, y: -TAG_H / 2, w: width, h: TAG_H + 4 };
    const g = new Graphics();
    drawPaper(g, -width, -TAG_H / 2, { w: width, h: TAG_H, kind: 'pill', fill: Color.paperDim, edge: Color.kraftDark, edgeAlpha: 0.45, shadow: 3, grain: false, seed: paperSeed() });
    cacheStatic(g);
    const glyph = drawIcon(icon, 30);
    glyph.position.set(-width + 28, 0);
    this.text = uiLabel('', { size: 24, anchorX: 1 });
    this.text.position.set(-18, 1);
    this.addChild(g, glyph, this.text);
  }

  setText(text: string): void {
    this.text.text = text;
    fitLabel(this.text, this.room, 24);
  }
}

/** "Resets in 5:12:03" on a note tag with a clock; it rewrites its text once a second. */
export class TimerTag extends NoteTag {
  private shownSecond = -1;

  constructor(width: number) {
    super(width, 'clock');
  }

  /** Put the remaining time (from the trusted clock reading `now`, ms) on the tag; only touches the text when the second changes. */
  tick(now: number, remainingMs: number): void {
    const s = Math.floor(now / 1000);
    if (s === this.shownSecond) return;
    this.shownSecond = s;
    this.setText(t('rt.common.resetsIn', { time: countdownText(remainingMs) }));
  }
}
