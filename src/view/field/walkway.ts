import { Container, Graphics, Sprite } from 'pixi.js';
import { Color, cacheStatic } from '@/ui';
import { fxTex } from '@/fx';
import { PATH_BOTTOM, PATH_LEFT, PATH_LENGTH, PATH_RADIUS, PATH_RIGHT, PATH_TOP, pathPoint, type PathPoint } from '@/game/geometry';

const PAW_SPACING = 40;
const STRAIGHT_H = PATH_RIGHT - PATH_LEFT - 2 * PATH_RADIUS;
const STRAIGHT_V = PATH_BOTTOM - PATH_TOP - 2 * PATH_RADIUS;
const ARC = (Math.PI / 2) * PATH_RADIUS;

/** A small cream paper tag on the floor: a flat shadow, the paper, an ink chevron that points along the way. */
function arrowTag(x: number, y: number, rotation: number, big: boolean): Graphics {
  const s = big ? 1.25 : 1;
  const g = new Graphics();
  const body = [-17, -12, 6, -12, 19, 0, 6, 12, -17, 12].map((v) => v * s);
  g.poly(body.map((v, i) => (i % 2 === 0 ? v + 3 * s : v + 4 * s))).fill({ color: Color.shadow, alpha: 0.24 });
  g.poly(body).fill(Color.paperLight);
  g.poly(body).stroke({ width: 1.6, color: Color.kraftDark, alpha: 0.55, join: 'round' });
  g.moveTo(-6 * s, -6 * s).lineTo(3 * s, 0).lineTo(-6 * s, 6 * s).stroke({ width: 3.6 * s, color: big ? Color.coral : Color.inkSoft, cap: 'round', join: 'round' });
  g.position.set(x, y);
  g.rotation = rotation;
  return g;
}

/**
 * Where the enemies come in: a cut-paper mouse door with a dark opening, and a coral arrow tag laid
 * on the lane in front of it (the one place the quiet trail gets a louder colour).
 */
function entrance(x: number, y: number): Container {
  const root = new Container();
  const g = new Graphics();
  const arch = (dx: number, dy: number): Graphics => g.circle(x + dx, y - 20 + dy, 25).rect(x - 25 + dx, y - 20 + dy, 50, 30);
  arch(3, 5).fill({ color: Color.shadow, alpha: 0.26 });
  arch(0, 0).fill(Color.kraft);
  arch(0, 0).stroke({ width: 2, color: Color.kraftDark, alpha: 0.8, join: 'round' });
  g.circle(x, y - 18, 17.5).rect(x - 17.5, y - 18, 35, 26).fill(Color.inkDeep);
  g.ellipse(x, y + 4, 12, 4).fill({ color: Color.ink, alpha: 0.55 });
  root.addChild(g, arrowTag(x + 52, y + 2, 0, true));
  return root;
}

/**
 * Decoration of the enemy loop, all of it flat and all of it quieter than a cat: a trail of paw
 * prints in a darker wood tone that walks the way the enemies do, small paper arrow tags at the four
 * corners, and the entrance. Baked once.
 */
export function buildWalkway(): Container {
  const root = new Container();
  root.label = 'walkway';

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
    s.tint = Color.woodDark;
    s.alpha = 0.34;
    root.addChild(s);
  }

  const corners = [STRAIGHT_H + ARC / 2, STRAIGHT_H + ARC + STRAIGHT_V + ARC / 2, 2 * STRAIGHT_H + 2 * ARC + STRAIGHT_V + ARC / 2, 2 * STRAIGHT_H + 2 * STRAIGHT_V + 3 * ARC + ARC / 2];
  for (const s of corners) {
    pathPoint(s, p);
    root.addChild(arrowTag(p.x, p.y, p.angle, false));
  }
  pathPoint(0, p);
  root.addChild(entrance(p.x, p.y));
  cacheStatic(root);
  return root;
}
