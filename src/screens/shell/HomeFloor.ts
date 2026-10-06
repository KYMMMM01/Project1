import { Container, Graphics } from 'pixi.js';
import { Color, drawFloor } from '@/ui';
import { makeRng } from '@/ui/paperMath';

const PANE_W = 168;
const PANE_H = 236;
const FRAME = 30;
const SKEW = 0.46;
const PAWS = 11;

/** One paw print at (x, y), turned by `rot`: a pad and four toes. */
function drawPaw(g: Graphics, x: number, y: number, rot: number, scale: number): void {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const at = (px: number, py: number): [number, number] => [x + (px * cos - py * sin) * scale, y + (px * sin + py * cos) * scale];
  const [px, py] = at(0, 9);
  g.ellipse(px, py, 15 * scale, 12 * scale).fill({ color: Color.woodDark, alpha: 0.13 });
  for (const [tx, ty] of [[-17, -7], [-6, -17], [7, -17], [18, -7]] as const) {
    const [ex, ey] = at(tx, ty);
    g.ellipse(ex, ey, 5.5 * scale, 7 * scale).fill({ color: Color.woodDark, alpha: 0.13 });
  }
}

/**
 * The home screen's backdrop: the same wooden floor the battle board lies on, with window light
 * falling across it in flat panes and a trail of paw prints. Everything is flat shapes (no blur, no
 * gradients) drawn once per size; origin = top-left of the screen.
 */
export class HomeFloor extends Container {
  private readonly g = new Graphics();
  private w = 0;
  private h = 0;

  constructor() {
    super();
    this.eventMode = 'none';
    this.addChild(this.g);
  }

  resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    const g = this.g;
    g.clear();
    drawFloor(g, w, h);
    this.drawWindowLight(g, w, h);
    this.drawPaws(g, w, h);
  }

  /** Two columns by three rows of lit panes, sheared like sun through a window, with the frame left dark between them. */
  private drawWindowLight(g: Graphics, w: number, h: number): void {
    const x0 = w * 0.42;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) {
        const x = x0 + col * (PANE_W + FRAME);
        const y = -40 + row * (PANE_H + FRAME);
        if (y > h * 0.7) continue;
        const shear = PANE_H * SKEW;
        g.poly([x + shear, y, x + shear + PANE_W, y, x + PANE_W, y + PANE_H, x, y + PANE_H]).fill({ color: Color.paperLight, alpha: 0.1 });
      }
    }
  }

  /** Someone small walked across the room: prints on a gentle diagonal, seeded so they never move. */
  private drawPaws(g: Graphics, w: number, h: number): void {
    const rnd = makeRng(0xc47);
    for (let i = 0; i < PAWS; i++) {
      const k = i / (PAWS - 1);
      const side = i % 2 === 0 ? -1 : 1;
      const x = w * (0.08 + 0.84 * k) + side * 18;
      const y = h * (0.94 - 0.8 * k) + (rnd() - 0.5) * 24;
      drawPaw(g, x, y, -0.9 + (rnd() - 0.5) * 0.3, 1.05);
    }
  }
}
