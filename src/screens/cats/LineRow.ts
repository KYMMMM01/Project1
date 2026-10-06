import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import { t } from '@/core/i18n';
import type { ClassId, UnitId } from '@/game/api';
import { cacheStatic, Color, paperSeed, RARITY_GOLD, uiLabel } from '@/ui';
import { CLASS_ACCENT } from '@/view/hud/kit';
import { cutPoly } from '../shop/cutMath';
import { drawCut } from '../shop/paperBits';
import { FRAME_H, lineMetrics, lineOf, NAME_H } from './collection';
import { LineFrame, type FrameMode } from './LineFrame';

export interface LineRowOpts {
  classId: ClassId;
  /** Width of the row; the five cats share it equally. */
  width: number;
  mode: FrameMode;
  onTap?: (unit: UnitId) => void;
}

const TAG_H = 44;
/** Height of the arrow tags over the plate tops: on the mat, level with the portrait. */
const TAG_Y = 58;

/**
 * A class as its fixed line of five cats, kitten to guardian, joined by arrow tags stuck on the gaps:
 * "merge" three times (two identical cats become the next rank) and "awaken" last (a king becomes the
 * guardian). Origin = top-left of the row.
 */
export class LineRow extends Container {
  readonly frames = new Map<UnitId, LineFrame>();
  readonly rowHeight: number;

  constructor(o: LineRowOpts) {
    super();
    const ids = lineOf(o.classId);
    const { pitch, plateW } = lineMetrics(o.width, ids.length);
    this.rowHeight = FRAME_H[o.mode] + NAME_H;
    ids.forEach((id, i) => {
      const frame = new LineFrame(id, o.mode, plateW, pitch).onTap(o.onTap ?? null);
      frame.position.set(pitch * (i + 0.5), FRAME_H[o.mode] / 2);
      this.frames.set(id, frame);
      this.addChild(frame);
    });
    const seed = paperSeed();
    for (let i = 0; i < ids.length - 1; i++) {
      const awaken = i === ids.length - 2;
      const tag = new Container();
      const g = new Graphics();
      const label = uiLabel(t(awaken ? 'cats.awaken' : 'cats.merge'), { size: 24, color: Color.inkDeep });
      // A longer word (English "Awaken") is set smaller instead of widening the tag over the photos.
      if (label.width > 50) label.scale.set(20 / 24);
      const w = Math.round(label.width) + 26;
      const pts = [-w / 2, -TAG_H / 2, w / 2 - 14, -TAG_H / 2, w / 2, 0, w / 2 - 14, TAG_H / 2, -w / 2, TAG_H / 2];
      drawCut(g, cutPoly(pts, seed + i, 0.6), awaken ? RARITY_GOLD : CLASS_ACCENT[o.classId], 4);
      cacheStatic(g);
      label.position.set(-6, 0);
      tag.addChild(g, label);
      tag.position.set(pitch * (i + 1), TAG_Y);
      tag.rotation = (i % 2 === 0 ? -1 : 1) * 0.03;
      this.addChild(tag);
    }
  }

  override destroy(options?: DestroyOptions): void {
    this.frames.clear();
    super.destroy(options);
  }
}
