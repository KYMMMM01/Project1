/**
 * The way home from the result page with the run's pay. The home scene is built fresh, so its pills would simply show
 * the new totals; here they go back to what they showed before and the coins fly in from the middle of the iris, like
 * any other claim (`shell.pending` / `shell.landed` through `playClaim`).
 */
import { game } from '@/core/game';
import { scenes } from '@/core/scene';
import { uiTweens, type Tween } from '@/core/tween';
import type { BundlePart } from '@/meta';
import { playClaim } from '@/screens/battle/claim';
import { shell } from '@/screens/shell/controller';
import type { Paid } from './policy';

/** Seconds the scene change may take before the claim is dropped (a refused change leaves the battle where it is). */
const WAIT = 4;

/** The currency parts of a pay, zero amounts dropped. */
function paidParts(paid: Paid): BundlePart[] {
  const out: BundlePart[] = [];
  if (paid.gold > 0) out.push({ kind: 'gold', n: paid.gold });
  if (paid.gems > 0) out.push({ kind: 'gems', n: paid.gems });
  if (paid.tickets > 0) out.push({ kind: 'tickets', n: paid.tickets });
  return out;
}

/**
 * Starts the flight on the first frame the scene manager holds another scene: the new home scene has entered by then
 * (it attached itself to the shell) and has not been drawn yet, so its pills never show the new totals. Kill the
 * returned tween to take the claim back (a second tap asks again).
 */
export function claimAtHome(paid: Paid): Tween | null {
  const parts = paidParts(paid);
  if (parts.length === 0) return null;
  const leaving = scenes.current;
  const wait: Tween = uiTweens.run({
    duration: WAIT,
    onUpdate: () => {
      if (!scenes.current || scenes.current === leaving) return;
      wait.kill();
      playClaim({ x: game.w / 2, y: game.h / 2 }, parts, shell);
    },
  });
  return wait;
}
