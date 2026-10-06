import { Bounds, Container, Point, Sprite, type Texture } from 'pixi.js';
import { game } from '@/core/game';
import { Pool } from '@/core/pool';
import { Ease, uiTweens, type Tween, type Tweener } from '@/core/tween';
import { TAU, rand } from '@/core/math';
import { flightAt, flightTotal, makeFlightPlan, planFlight, type FlightPlan, type FlightState } from './flyPath';
import { REDUCED, fxSettings } from './settings';

export interface FlyPoint {
  x: number;
  y: number;
}

/**
 * A point already in the parent's coordinates, or a display object: the centre of its bounds is the
 * landing spot (its origin only when it has nothing to measure), whatever its anchor or pivot.
 */
export type FlyEnd = FlyPoint | Container;

export interface FlyToOpts {
  from: FlyEnd;
  to: FlyEnd;
  count: number;
  /** Icon art as a texture (pooled sprites, recommended)... */
  texture?: Texture;
  /** ...or a factory for anything else; the container is destroyed on arrival. Wins over texture. */
  make?: () => Container;
  /** Width of texture icons in design px. Default 44. */
  size?: number;
  tint?: number;
  /** Where icons live. Default game.overlayLayer, so they cross scene and HUD freely. */
  parent?: Container;
  tweens?: Tweener;
  /** Distance of the outward burst [min, max] px. */
  burstRadius?: readonly [number, number];
  burstSeconds?: number;
  /** Rest time before an icon departs, [min, max] seconds. */
  hang?: readonly [number, number];
  flight?: readonly [number, number];
  /** Seconds between consecutive icon departures. Default 0.03. */
  stagger?: number;
  /** Sideways curve of the flight path [min, max] px (sign alternates per icon). */
  bulge?: readonly [number, number];
  /** Fired as each icon reaches the target: count up, play a tick, punch the HUD. */
  onArrive?: (index: number) => void;
  onDone?: () => void;
}

export interface FlyHandle {
  /** Stop everything now without firing onArrive/onDone, and remove every icon still in flight. */
  cancel(): void;
  readonly active: boolean;
  /**
   * Resolves when the last icon lands or the flight ends early (cancel(), or the Tweener driving it
   * being killed, e.g. on scene exit). onDone only fires for a flight that really finished.
   */
  readonly done: Promise<void>;
}

/** Number of icons to actually show for a reward of `total` units (the value is split between them). */
export function flyIconCount(total: number, cap = 12): number {
  return Math.max(1, Math.min(cap, Math.round(total)));
}

const iconPool = new Pool<Sprite>(
  () => {
    const s = new Sprite();
    s.anchor.set(0.5);
    s.eventMode = 'none';
    return s;
  },
  (s) => {
    s.parent?.removeChild(s);
    s.visible = false;
  },
);

const tmp = new Point();
const tmpBounds = new Bounds();

function resolveEnd(e: FlyEnd, parent: Container, out: FlyPoint): FlyPoint {
  if (e instanceof Container) {
    const b = e.getBounds(false, tmpBounds);
    // An empty or hidden container measures as a zero rectangle: fall back to its origin.
    if (b.maxX > b.minX && b.maxY > b.minY) tmp.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    else e.getGlobalPosition(tmp);
    parent.toLocal(tmp, undefined, tmp);
    out.x = tmp.x;
    out.y = tmp.y;
  } else {
    out.x = e.x;
    out.y = e.y;
  }
  return out;
}

/**
 * Currency / reward fly-to-HUD: N icons burst out of a source with a pop, hang briefly, then
 * accelerate along curved paths into the target and land one after another. Everything runs in
 * `parent` coordinates (game.overlayLayer by default), so the path may cross from scene to HUD.
 */
export function flyTo(o: FlyToOpts): FlyHandle {
  const parent = o.parent ?? game.overlayLayer;
  const tw = o.tweens ?? uiTweens;
  const from = resolveEnd(o.from, parent, { x: 0, y: 0 });
  const to = resolveEnd(o.to, parent, { x: 0, y: 0 });
  const n = Math.max(1, Math.floor(o.count));
  const speed = fxSettings.reducedMotion ? REDUCED.time : 1;
  const burst = (o.burstSeconds ?? 0.12) * speed;
  const stagger = o.stagger ?? 0.03;
  const rad = o.burstRadius ?? [60, 120];
  const hang = o.hang ?? [0.15, 0.25];
  const flight = o.flight ?? [0.45, 0.65];
  const bulge = o.bulge ?? [80, 140];
  const size = o.size ?? 44;
  const phase = Math.random() * TAU;

  const icons: (Container | null)[] = new Array<Container | null>(n).fill(null);
  const tweens: Tween[] = [];
  const landed: boolean[] = new Array<boolean>(n).fill(false);
  let arrived = 0;
  let active = true;
  let resolveDone!: () => void;
  const done = new Promise<void>((res) => {
    resolveDone = res;
  });

  const dropIcon = (i: number): void => {
    const c = icons[i];
    if (!c) return;
    icons[i] = null;
    if (o.make) c.destroy({ children: true });
    else iconPool.release(c as Sprite);
  };

  const handle: FlyHandle = {
    get active() {
      return active;
    },
    done,
    cancel() {
      if (!active) return;
      active = false;
      for (const t of tweens) t.kill();
      for (let i = 0; i < n; i++) dropIcon(i);
      resolveDone();
    },
  };

  for (let i = 0; i < n; i++) {
    const plan: FlightPlan = makeFlightPlan();
    const ang = phase + (i / n) * TAU + rand(-0.35, 0.35);
    planFlight(
      plan,
      from.x,
      from.y,
      to.x,
      to.y,
      ang,
      rand(rad[0], rad[1]),
      rand(bulge[0], bulge[1]) * (i % 2 === 0 ? 1 : -1),
      burst,
      rand(hang[0], hang[1]) * speed,
      rand(flight[0], flight[1]) * speed,
    );
    let icon: Container;
    let baseScale = 1;
    if (o.make) {
      icon = o.make();
    } else {
      const s = iconPool.get();
      s.texture = o.texture as Texture;
      s.tint = o.tint ?? 0xffffff;
      baseScale = size / Math.max(1, s.texture.width);
      icon = s;
    }
    icon.position.set(from.x, from.y);
    icon.scale.set(0);
    icon.visible = true;
    parent.addChild(icon);
    icons[i] = icon;

    const state: FlightState = { x: from.x, y: from.y, scale: 0 };
    const idx = i;
    const total = flightTotal(plan);
    const tween = tw.run({
      duration: total,
      delay: i * stagger,
      ease: Ease.linear,
      onUpdate: (k) => {
        flightAt(state, plan, k * total);
        icon.position.set(state.x, state.y);
        icon.scale.set(state.scale * baseScale);
      },
      onComplete: () => {
        landed[idx] = true;
        if (!active) return;
        dropIcon(idx);
        arrived++;
        o.onArrive?.(idx);
        if (arrived === n) {
          active = false;
          o.onDone?.();
          resolveDone();
        }
      },
    });
    tweens.push(tween);
    // Tween.kill and Tweener.killAll (scene exit) skip onComplete: without this the icons would stay
    // on the overlay layer, which outlives scenes, and `done` would never settle.
    void tween.finished.then(() => {
      if (active && !landed[idx]) handle.cancel();
    });
  }

  return handle;
}
