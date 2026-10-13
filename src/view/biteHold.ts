/**
 * The gunner's bite and the boss bar (docs/design_skills_v2.md 3.5). The simulation takes the bite's health at the tick of the cast, so the
 * boss's health is already lower while the poster is still going up and the cork is still in the air. The scene (`director/sp/wanted.ts`)
 * and the bar (`hud/BossBar.ts`) meet here, because parts of the view never import each other:
 *
 *  - the scene HOLDS the bar of the target (`hold`): the bar shows that much more health than the simulation has, until the cork lands;
 *  - the scene LANDS the cork (`land`): the hold ends and the bar lets the bite fall out of it;
 *  - the bar reads `heldOf` every frame, and holds a hold only while the battle clock moves: a popup stands the battle still, and the hold with it.
 *
 * A hold that nobody lands (the scene was cleared, a revive, a bug) ends by itself after `BITE_HOLD_MAX` battle seconds, so a bar can never be
 * left showing health the boss does not have. The registry is per battle (a `WeakMap` on the `BattleApi` object), so a restart starts clean.
 *
 * Pure, so `tests/view.director.sp.wanted.test.ts` holds it to its numbers.
 */

/** Battle seconds from the cast to the moment the cork goes through the poster (the bar drops then), and the same moment's floor in real seconds (3x speed). */
export const BITE_LAND = 0.4;
export const BITE_LAND_FLOOR = 0.28;
/** The same for the small shot at a plain enemy: there is no bar to hold, so the picture is quick. */
export const SMALL_LAND = 0.24;
export const SMALL_LAND_FLOOR = 0.2;
/** A hold nobody landed ends by itself after this many battle seconds. */
export const BITE_HOLD_MAX = 1.2;
/** The pool is cut into this many eggs, one per bite (6% of 12%). */
export const EGGS = 2;

interface Hold {
  uid: number;
  amount: number;
  until: number;
}

/** The holds of one battle. */
export class BiteHolds {
  private readonly list: Hold[] = [];

  /** The bar of enemy `uid` keeps showing `amount` more health than the simulation has, from battle time `now`. */
  hold(uid: number, amount: number, now: number): void {
    if (!(amount > 0)) return;
    this.list.push({ uid, amount, until: now + BITE_HOLD_MAX });
  }

  /** The cork landed: the oldest hold of `uid` ends. Returns whether there was one. */
  land(uid: number): boolean {
    for (let i = 0; i < this.list.length; i++) {
      if ((this.list[i] as Hold).uid !== uid) continue;
      this.list.splice(i, 1);
      return true;
    }
    return false;
  }

  /** The health the bar of `uid` still shows beyond the simulation's, at battle time `now` (0 when nothing holds it). */
  heldOf(uid: number, now: number): number {
    let sum = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i] as Hold;
      if (now > h.until) {
        this.list.splice(i, 1);
        continue;
      }
      if (h.uid === uid) sum += h.amount;
    }
    return sum;
  }

  /** Every hold ends (victory, defeat, the scene going). */
  clear(): void {
    this.list.length = 0;
  }

  get size(): number {
    return this.list.length;
  }
}

const registry = new WeakMap<object, BiteHolds>();

/** The holds of `battle` (made on first use). */
export function biteHoldsOf(battle: object): BiteHolds {
  let h = registry.get(battle);
  if (!h) {
    h = new BiteHolds();
    registry.set(battle, h);
  }
  return h;
}

/**
 * The bites the bar has been told of and has not yet shown: it adds up what arrives (two gunners can bite in one tick) and hands over the
 * sum once the bar is free to show it (no hold on the target).
 */
export class BitePending {
  share = 0;
  taken = 0;
  pool = 0;
  closed = false;
  count = 0;

  add(share: number, taken: number, pool: number, closed: boolean): void {
    this.share += share;
    this.taken = taken;
    this.pool = pool;
    this.closed = this.closed || closed;
    this.count++;
  }

  reset(): void {
    this.share = 0;
    this.taken = 0;
    this.pool = 0;
    this.closed = false;
    this.count = 0;
  }
}

/** How many of the `EGGS` eggs a target that has given `taken` of its `pool` has filled (0 to 2). */
export function eggsFilled(taken: number, pool: number): number {
  if (!(pool > 0) || !(taken > 0)) return 0;
  return Math.max(0, Math.min(EGGS, Math.round((taken / pool) * EGGS)));
}

/** The label of a bite: its share of the target's maximum health as a whole percent, at least 1: "-6%". */
export function biteText(share: number): string {
  return `-${Math.max(1, Math.round(share * 100))}%`;
}

/** The health the bar shows: the simulation's (health plus shield) plus what is held, never above the bar's full length. */
export function shownHealth(hp: number, shield: number, held: number, maxHp: number, maxShield: number): number {
  return Math.min(maxHp + maxShield, Math.max(0, hp) + Math.max(0, shield) + Math.max(0, held));
}
