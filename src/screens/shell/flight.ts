import { Container } from 'pixi.js';
import { game } from '@/core/game';

/** Closer than this to a side of the screen, a flight keeps its burst and its curve short. */
const EDGE = 170;

/** Design-space x of a flight's start: a point as given, a display object where it stands on the overlay layer. */
export function originX(from: Container | { x: number }): number {
  return from instanceof Container ? game.overlayLayer.toLocal(from.getGlobalPosition()).x : from.x;
}

/**
 * Burst and curve for a flight from `fromX` to `toX`. Icons spread in every direction and bulge to one
 * side of the straight line, so a flight that begins or ends beside the screen edge would swing some of
 * them out of view; there they stay close and fly nearly straight. Elsewhere the effect's own defaults apply.
 */
export function flightTuning(fromX: number, toX: number): { burstRadius?: readonly [number, number]; bulge?: readonly [number, number] } {
  const near = (x: number): boolean => x < EDGE || x > game.w - EDGE;
  return near(fromX) || near(toX) ? { burstRadius: [28, 56], bulge: [16, 40] } : {};
}
