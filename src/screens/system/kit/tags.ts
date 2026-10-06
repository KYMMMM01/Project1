/** Small paper tags that state a fact: days left, a countdown, what the player owns. */
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
    if (text === this.text.text) return;
    this.text.text = text;
    fitLabel(this.text, this.room, 24);
  }
}

export interface IconLabelOpts {
  text: string;
  icon: IconName;
  /** Paper colour; the ink is the deep ink. */
  fill: number;
  size: number;
  padX: number;
  padY: number;
  /** The label never grows past this; the text shrinks to make room for the icon. */
  maxWidth: number;
}

/** A torn paper label with an icon in front of its text; icon and text are centred as one group inside the paper. Origin = centre. */
export class IconLabel extends Container {
  constructor(o: IconLabelOpts) {
    super();
    const iconW = Math.round(o.size * 1.4);
    const gap = Math.round(o.size / 3);
    const text = uiLabel(o.text, { size: o.size, color: Color.inkDeep, anchorX: 0 });
    fitLabel(text, o.maxWidth - o.padX * 2 - iconW - gap, o.size);
    const w = Math.ceil(text.width) + iconW + gap + o.padX * 2;
    const h = Math.round(o.size * 1.15) + o.padY * 2;
    const g = new Graphics();
    drawPaper(g, -w / 2, -h / 2, { w, h, radius: 12, fill: o.fill, seed: paperSeed(), torn: ['left', 'right'], grain: false });
    cacheStatic(g);
    const glyph = drawIcon(o.icon, iconW);
    glyph.position.set(-w / 2 + o.padX + iconW / 2, -1);
    text.position.set(-w / 2 + o.padX + iconW + gap, 1);
    this.addChild(g, glyph, text);
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
