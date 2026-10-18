/**
 * The fish that wait for a flask (docs/handoff/skills2_sim.md 1.2 and 6.7, `fish`: "keep the small enemies' sprites on screen until their
 * flask lands ... play the pink puff and the fish flying to the counter"). The simulation turns the weakest ordinary enemies into fish in the
 * cast's own tick: it says `fish` (the doubled reward, with the enemy's place) and `enemyDie` (`transmuted`) before the flask has left the
 * alchemist's paw. Left alone, the death director would puff the enemy away and fly its fish to the counter a quarter of a second before the flask
 * lands on it. The alchemist's scene (`fish.ts`) EXPECTS each small target when it throws its flask and RELEASES it when the flask lands:
 *
 *   - the death director asks `hold` for every `fish` event it is about to fly: a kill that is expected is kept (the event is stored) and flown by
 *     `fire` on release, so the fish leave the pink puff the moment the flask breaks;
 *   - and asks `staged` for every `transmuted` death: an enemy the scene stages gets no ordinary death puff and sound (the scene draws its own).
 *
 * An expectation nobody released (the scene was cleared, a bug) ends by itself `FISH_HOLD_MAX` battle seconds after it was made and its event is
 * flown then, so a kill can never lose its reward picture. The registry is per battle (a `WeakMap` on the `BattleApi`). With nothing expected (always,
 * with skills off, and in every battle before the first big flask) `hold` answers false on its first line and `staged` after one length check.
 *
 * Pure (no pixi): `tests/view.director.sp.jamFish.test.ts` holds it to its numbers.
 */
import type { BattleEvents } from '@/game';

/** An expectation nobody released ends after this many battle seconds, and its fish fly then. */
export const FISH_HOLD_MAX = 1.2;
/** A `fish` event belongs to an expected kill when it stands within this many px of where the flask's target stood (the simulation sends both from the same numbers). */
const SAME_SPOT = 0.75;

export type FishPay = BattleEvents['fish'];

interface Expected {
  uid: number;
  x: number;
  y: number;
  until: number;
  /** The reward, once the death director has offered it. */
  pay: FishPay | null;
}

export class FishHolds {
  /** Set by the death director: how a reward is really flown. Until it is set, released rewards are dropped (nobody was listening anyway). */
  fire: ((e: FishPay) => void) | null = null;
  private readonly list: Expected[] = [];

  /** The scene threw a flask at enemy `uid` standing at (`x`, `y`): its death and its reward wait for the flask until battle time `until`. */
  expect(uid: number, x: number, y: number, until: number): void {
    this.list.push({ uid, x, y, until, pay: null });
  }

  /**
   * The death director offers a reward it is about to fly. True: it belongs to an enemy the scene is staging, is kept and will be flown on
   * release; the caller must not fly it. False: fly it now.
   */
  hold(e: FishPay): boolean {
    if (this.list.length === 0 || e.reason !== 'kill' || e.x === undefined || e.y === undefined) return false;
    for (const h of this.list) {
      if (h.pay || Math.abs(h.x - e.x) > SAME_SPOT || Math.abs(h.y - e.y) > SAME_SPOT) continue;
      h.pay = e;
      return true;
    }
    return false;
  }

  /** Whether the scene is staging the death of enemy `uid`: the ordinary death puff and sound are left to it. */
  staged(uid: number): boolean {
    if (this.list.length === 0) return false;
    for (const h of this.list) if (h.uid === uid) return true;
    return false;
  }

  /** The flask landed on `uid`: its kept reward flies now, and the death is no longer the scene's to stage. */
  release(uid: number): void {
    for (let i = 0; i < this.list.length; i++) {
      const h = this.list[i] as Expected;
      if (h.uid !== uid) continue;
      this.list.splice(i, 1);
      if (h.pay) this.fire?.(h.pay);
      return;
    }
  }

  /** Expectations that ran out end now; what they kept flies. */
  sweep(now: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i] as Expected;
      if (!(now > h.until)) continue;
      this.list.splice(i, 1);
      if (h.pay) this.fire?.(h.pay);
    }
  }

  /** Everything ends and everything kept flies (victory, defeat, the scene going or breaking). */
  flush(): void {
    const all = this.list.splice(0, this.list.length);
    for (const h of all) if (h.pay) this.fire?.(h.pay);
  }

  /** How many kills are expected (QA and tests). */
  get size(): number {
    return this.list.length;
  }

  /** How many rewards are being kept (QA and tests). */
  get kept(): number {
    let n = 0;
    for (const h of this.list) if (h.pay) n++;
    return n;
  }
}

const registry = new WeakMap<object, FishHolds>();

/** The holds of `battle` (made on first use). */
export function fishHoldsOf(battle: object): FishHolds {
  let h = registry.get(battle);
  if (!h) {
    h = new FishHolds();
    registry.set(battle, h);
  }
  return h;
}
