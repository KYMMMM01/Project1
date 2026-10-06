import { Container, Graphics, Sprite } from 'pixi.js';
import { cacheStatic } from '@/ui';
import { fxTex } from '@/fx';
import {
  LANE_WIDTH,
  PATH_BOTTOM,
  PATH_LEFT,
  PATH_LENGTH,
  PATH_RADIUS,
  PATH_RIGHT,
  PATH_TOP,
  pathPoint,
  type PathPoint,
} from '@/game/geometry';

const PAW_SPACING = 40;
const STRAIGHT_H = PATH_RIGHT - PATH_LEFT - 2 * PATH_RADIUS;
const STRAIGHT_V = PATH_BOTTOM - PATH_TOP - 2 * PATH_RADIUS;
const ARC = (Math.PI / 2) * PATH_RADIUS;

function chevron(g: Graphics): void {
  g.moveTo(-6, -8).lineTo(5, 0).lineTo(-6, 8);
  g.stroke({ width: 9, color: 0x140a2e, alpha: 0.22, cap: 'round', join: 'round' });
  g.moveTo(-6, -8).lineTo(5, 0).lineTo(-6, 8);
  g.stroke({ width: 4.5, color: 0xffffff, alpha: 0.5, cap: 'round', join: 'round' });
}

/** The mouse hole enemies come out of: a dark arch with a lit rim over a floor shadow. */
function doorway(x: number, y: number): Graphics {
  const g = new Graphics();
  g.ellipse(x, y + 8, 34, 12).fill({ color: 0x000000, alpha: 0.28 });
  g.roundRect(x - 25, y - 44, 50, 54, 22).fill(0x5a3320).stroke({ width: 3, color: 0x2a140c });
  g.roundRect(x - 20, y - 39, 40, 49, 18).fill(0x1c0d10);
  g.roundRect(x - 20, y - 39, 40, 49, 18).stroke({ width: 3, color: 0xd9a066, alpha: 0.75 });
  g.ellipse(x, y + 4, 15, 6).fill({ color: 0xffd9a0, alpha: 0.18 });
  g.roundRect(x - 13, y - 33, 8, 20, 4).fill({ color: 0xffffff, alpha: 0.07 });
  return g;
}

/**
 * Decoration of the enemy loop: a faint worn lane, a paw-print trail that walks the way the
 * enemies do, direction chevrons at the four corners and the doorway at the spawn point. All of it
 * is baked once, low in contrast so characters stay the loudest thing on the floor.
 */
export function buildWalkway(): Container {
  const root = new Container();
  root.label = 'walkway';

  const lane = new Graphics();
  const w = PATH_RIGHT - PATH_LEFT;
  const h = PATH_BOTTOM - PATH_TOP;
  lane.roundRect(PATH_LEFT, PATH_TOP, w, h, PATH_RADIUS).stroke({ width: LANE_WIDTH - 2, color: 0x10060a, alpha: 0.05, join: 'round' });
  lane.roundRect(PATH_LEFT, PATH_TOP, w, h, PATH_RADIUS).stroke({ width: LANE_WIDTH - 12, color: 0x10060a, alpha: 0.085, join: 'round' });
  root.addChild(lane);

  const paw = fxTex('paw');
  const p: PathPoint = { x: 0, y: 0, angle: 0 };
  const count = Math.floor(PATH_LENGTH / PAW_SPACING);
  for (let i = 0; i < count; i++) {
    pathPoint((i + 0.5) * (PATH_LENGTH / count), p);
    const side = i % 2 === 0 ? -1 : 1;
    const s = new Sprite(paw.texture);
    s.anchor.set(paw.ax, paw.ay);
    s.scale.set(17 / paw.w);
    // Left and right feet alternate across the line of travel; the toes point along it.
    s.position.set(p.x + Math.cos(p.angle + Math.PI / 2) * side * 8, p.y + Math.sin(p.angle + Math.PI / 2) * side * 8);
    s.rotation = p.angle + Math.PI / 2 + side * 0.12;
    s.tint = 0x2a140c;
    s.alpha = 0.2;
    root.addChild(s);
  }

  const corners = [STRAIGHT_H + ARC / 2, STRAIGHT_H + ARC + STRAIGHT_V + ARC / 2, 2 * STRAIGHT_H + 2 * ARC + STRAIGHT_V + ARC / 2, 2 * STRAIGHT_H + 2 * STRAIGHT_V + 3 * ARC + ARC / 2];
  for (const s of corners) {
    pathPoint(s, p);
    const c = new Graphics();
    chevron(c);
    c.position.set(p.x, p.y);
    c.rotation = p.angle;
    root.addChild(c);
  }
  pathPoint(0, p);
  root.addChild(doorway(p.x, p.y));
  cacheStatic(root);
  return root;
}
