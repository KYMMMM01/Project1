import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import { t } from '@/core/i18n';
import type { ClassId, UnitId } from '@/game/api';
import { cacheStatic, Color, drawIcon, paperSeed, RARITY_GOLD, uiLabel } from '@/ui';
import { CLASS_ACCENT } from '@/view/hud/kit';
import { cutPoly } from '../shop/cutMath';
import { drawCut } from '../shop/paperBits';
import { arrowWidth, FRAME_H, lineMetrics, lineOf, RAIL_H } from './collection';
import { LineFrame, type FrameMode } from './LineFrame';

export interface LineRowOpts {
  classId: ClassId;
  /** Width of the row; the five cats share it equally. */
  width: number;
  mode: FrameMode;
  onTap?: (unit: UnitId) => void;
}

const TAG_H = 44;
/** Height of the arrow tags below the plate tops: on the mat, level with the portrait. */
const TAG_Y = 58;

/**
 * A class as its fixed line of five cats, kitten to guardian, joined by arrow-shaped paper stuck over the gaps: a
 * plain arrow for "merge" (two identical cats become the next rank) and a mustard one with a star for "awaken" (a
 * king becomes the guardian). The arrows are no wider than the gap plus the plates' cream borders, so they never
 * cover a picture; on a card row the words "merge" / "awaken" stand in a band above each gap. Origin = top-left of the row.
 */
export class LineRow extends Container {
  readonly frames = new Map<UnitId, LineFrame>();
  readonly rowHeight: number;

  constructor(o: LineRowOpts) {
    super();
    const ids = lineOf(o.classId);
    const { pitch, plateW, gap } = lineMetrics(o.width, ids.length);
    const rail = o.mode === 'card' ? RAIL_H : 0;
    const plateH = FRAME_H[o.mode];
    let names = 0;
    ids.forEach((id, i) => {
      const frame = new LineFrame(id, o.mode, plateW, pitch).onTap(o.onTap ?? null);
      frame.position.set(pitch * (i + 0.5), rail + plateH / 2);
      this.frames.set(id, frame);
      this.addChild(frame);
      names = Math.max(names, frame.nameBlock);
    });
    this.rowHeight = rail + plateH + names;

    const seed = paperSeed();
    const w = arrowWidth(gap);
    const pts = [-w / 2, -TAG_H / 2, w / 2 - 12, -TAG_H / 2, w / 2, 0, w / 2 - 12, TAG_H / 2, -w / 2, TAG_H / 2];
    for (let i = 0; i < ids.length - 1; i++) {
      const awaken = i === ids.length - 2;
      const tag = new Container();
      const g = new Graphics();
      drawCut(g, cutPoly(pts, seed + i, 0.6), awaken ? RARITY_GOLD : CLASS_ACCENT[o.classId], 4);
      cacheStatic(g);
      tag.addChild(g);
      // The star tells an awakening from a merge without relying on the colour.
      if (awaken) {
        const star = drawIcon('star', 22, Color.inkDeep);
        star.position.set(-3, 0);
        tag.addChild(star);
      }
      tag.position.set(pitch * (i + 1), rail + TAG_Y);
      tag.rotation = (i % 2 === 0 ? -1 : 1) * 0.03;
      this.addChild(tag);
      if (rail > 0) {
        const word = uiLabel(t(awaken ? 'cats.awaken' : 'cats.merge'), { size: 24 });
        word.position.set(pitch * (i + 1), rail * 0.36);
        this.addChild(word);
      }
    }
  }

  override destroy(options?: DestroyOptions): void {
    this.frames.clear();
    super.destroy(options);
  }
}
