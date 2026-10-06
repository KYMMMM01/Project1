import { Container } from 'pixi.js';
import { t } from '@/core/i18n';
import type { ClassId, UnitId } from '@/game/api';
import { Color, drawIcon, paperSeed, paperShape, PaperLabel, tapeStrip, uiLabel } from '@/ui';
import { CLASS_ACCENT, CLASS_TAPE } from '@/view/hud/kit';
import { classIcon } from '../shop/keys';
import { LineRow } from './LineRow';

const SIDE = 18;

/**
 * One class as a page on the floor: its name on a label in the class colour across the top edge, the role line,
 * and the five cats of the class as one row of photo frames joined by merge and awaken tags. Origin = top-left
 * of the sheet (the label hangs a little above it).
 */
export class ClassSheet extends Container {
  readonly classId: ClassId;
  readonly row: LineRow;
  readonly sheetH: number;

  constructor(classId: ClassId, w: number, onTap: (unit: UnitId) => void) {
    super();
    this.classId = classId;
    const role = uiLabel(t(`class.${classId}.role`), { size: 24, color: Color.inkSoft, wrap: w - SIDE * 2 - 8, anchorX: 0, anchorY: 0, align: 'left', lineHeight: 30 });
    const rowY = 56 + role.height + 14;
    this.row = new LineRow({ classId, width: w - SIDE * 2, mode: 'card', onTap });
    this.row.position.set(SIDE, rowY);
    this.sheetH = Math.ceil(rowY + this.row.rowHeight + 14);

    const sheet = paperShape({ w, h: this.sheetH, fill: Color.paper, radius: 28, seed: paperSeed() });
    sheet.position.set(w / 2, this.sheetH / 2);
    const disc = paperShape({ w: 76, h: 76, kind: 'circle', fill: Color.paperLight, edge: Color.kraftDark, grain: false });
    disc.position.set(54, 6);
    const icon = drawIcon(classIcon(classId), 52);
    icon.position.set(54, 6);
    const label = new PaperLabel({ text: t(`class.${classId}.name`), size: 38, paper: CLASS_ACCENT[classId], ink: Color.inkDeep, minWidth: 150 });
    label.position.set(96 + label.uiBox.w / 2, 4);
    const tape = tapeStrip({ name: CLASS_TAPE[classId], w: 100, h: 30, angle: 3, pattern: classId === 'ranger' || classId === 'trickster' ? 'stripes' : 'gingham' });
    tape.position.set(w - 76, 2);
    role.position.set(SIDE + 4, 52);
    this.addChild(sheet, tape, disc, icon, label, role, this.row);
  }
}
