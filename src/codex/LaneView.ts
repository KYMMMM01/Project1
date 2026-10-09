/**
 * The lane picture: the field with the board in its middle, the loop the enemies walk (traced from the real path), arrows for the
 * direction, the entrance and an example zone on the lane. Origin = the middle of the mat.
 */
import { Container, Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { mixColor } from '@/core/math';
import { COLS, ROWS } from '@/game/geometry';
import { cacheStatic, Color, drawDashedLine, PaperLabel, paperSeed, paperShape } from '@/ui';
import { laneDiagram } from './boards';
import './strings';

const MAT_PAD = 18;

export class LaneView extends Container {
  readonly size: { w: number; h: number };

  /** `width` is the width of the field's picture; the mat is a little wider. */
  constructor(width: number) {
    super();
    const d = laneDiagram();
    const s = width / d.field.w;
    const w = d.field.w * s;
    const h = d.field.h * s;
    this.size = { w: w + MAT_PAD * 2, h: h + MAT_PAD * 2 };
    this.addChild(paperShape({ w: this.size.w, h: this.size.h, radius: 28, fill: Color.kraft, seed: paperSeed(), grain: false }));

    const art = new Graphics();
    const ox = -w / 2;
    const oy = -h / 2;
    const at = (x: number, y: number): [number, number] => [ox + x * s, oy + y * s];
    // The lane: a wide band along the loop.
    const loop: number[] = [];
    for (let i = 0; i < d.loop.length; i += 2) loop.push(...at(d.loop[i] as number, d.loop[i + 1] as number));
    art.poly(loop, true).stroke({ color: mixColor(Color.kraftDark, Color.paperLight, 0.4), width: d.laneWidth * s, join: 'round', alpha: 0.9 });
    // The board in the middle, with its cell lines.
    const [bx, by] = at(d.board.x, d.board.y);
    const bw = d.board.w * s;
    const bh = d.board.h * s;
    art.roundRect(bx, by, bw, bh, 12).fill(Color.paperLight);
    art.roundRect(bx, by, bw, bh, 12).stroke({ color: Color.kraftDark, width: 2, alpha: 0.6 });
    for (let c = 1; c < COLS; c++) art.moveTo(bx + (bw * c) / COLS, by).lineTo(bx + (bw * c) / COLS, by + bh).stroke({ color: Color.kraftDark, width: 1.5, alpha: 0.3 });
    for (let r = 1; r < ROWS; r++) art.moveTo(bx, by + (bh * r) / ROWS).lineTo(bx + bw, by + (bh * r) / ROWS).stroke({ color: Color.kraftDark, width: 1.5, alpha: 0.3 });
    // Which way they walk.
    for (const a of d.arrows) {
      const [x, y] = at(a.x, a.y);
      const k = 15;
      const c = Math.cos(a.angle);
      const sn = Math.sin(a.angle);
      art.poly([x + c * k, y + sn * k, x - c * k * 0.6 - sn * k * 0.8, y - sn * k * 0.6 + c * k * 0.8, x - c * k * 0.6 + sn * k * 0.8, y - sn * k * 0.6 - c * k * 0.8]).fill(Color.ink);
    }
    // The entrance, and the zone an attack leaves on the lane.
    const [ex, ey] = at(d.entrance.x, d.entrance.y);
    art.circle(ex, ey, 22).fill(Color.leaf).circle(ex, ey, 22).stroke({ color: Color.leafDark, width: 3 });
    const [zx, zy] = at(d.zone.x, d.zone.y);
    art.circle(zx, zy, d.zone.radius * s).fill({ color: Color.teal, alpha: 0.28 });
    art.circle(zx, zy, d.zone.radius * s).stroke({ color: Color.tealDark, width: 3, alpha: 0.9 });
    art.circle(zx, zy, 13).fill(Color.berry).circle(zx, zy, 13).stroke({ color: Color.berryDark, width: 2.5 });
    cacheStatic(art);
    this.addChild(art);

    const entrance = new PaperLabel({ text: t('codex.lane.entrance'), size: 24, paper: 'success', padX: 18, padY: 6, seed: 3 });
    entrance.position.set(ex + entrance.width / 2 - 20, ey + 56);
    const line = new Graphics();
    drawDashedLine(line, ex, ey + 22, ex, ey + 56 - 18, { color: Color.leafDark, width: 3 });
    const zone = new PaperLabel({ text: t('codex.lane.zone'), size: 24, paper: 'info', padX: 18, padY: 6, seed: 5 });
    zone.position.set(zx - zone.width / 2 - 36, zy + 4);
    this.addChild(line, entrance, zone);
  }
}
