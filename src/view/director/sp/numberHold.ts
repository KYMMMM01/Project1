/**
 * Numbers that wait for a picture (docs/handoff/skills2_sim.md 1.1, `knock`: "the view keeps the ice sticker on the shards' enemies and queues
 * their numbers until the shard lands"). The simulation does the whole of a cast in its own tick: the frost queen's damage is dealt and her
 * `hit`s are sent before the glass has even left the paw, so without this the "-15" would pop up over an enemy about half a second before the
 * shard that causes it arrives. The scene (`knock.ts`) HOLDS the enemy's numbers when it makes the shard and RELEASES them when the shard
 * lands; the combat director (`combat.ts`) asks `defer` for every number it is about to show and says the numbers it was handed back when
 * they are released. Everything the hold keeps is the sum of what would have been shown, so a held enemy shows one number, not a stack.
 *
 * A hold nobody released (the scene was cleared, a bug) ends by itself after `NUMBER_HOLD_MAX` battle seconds and the numbers it holds are
 * shown then, so a hit can never go without its number. The registry is per battle (a `WeakMap` on the `BattleApi` object), so a restart starts
 * clean. With no hold made (skills off, or no knock yet) `defer` answers false on its first line and nothing else runs.
 *
 * Pure (no pixi), so `tests/view.director.sp.cloudKnock.test.ts` holds it to its numbers.
 */
import type { NumStyle } from '@/fx';
import type { EnemyState } from '@/game';

/** A hold that was never released lets its numbers go after this many battle seconds. */
export const NUMBER_HOLD_MAX = 1.5;

/** Shows one number; the combat director's own, which knows how to place it. */
export type SayNumber = (en: EnemyState, value: number, style: NumStyle, color: number | undefined) => void;

interface Held {
  en: EnemyState;
  value: number;
  style: NumStyle;
  color: number | undefined;
}

interface Hold {
  uid: number;
  until: number;
}

/** The holds of one battle. */
export class NumberHolds {
  /** Set by the combat director: how a number is really shown. Until it is set, released numbers are dropped (nothing was listening anyway). */
  say: SayNumber | null = null;
  private readonly holds: Hold[] = [];
  private readonly pending: Held[] = [];

  /** The numbers of enemy `uid` wait from battle time `now` until `release(uid)` (or `NUMBER_HOLD_MAX` seconds). */
  hold(uid: number, now: number): void {
    this.holds.push({ uid, until: now + NUMBER_HOLD_MAX });
  }

  /**
   * The combat director offers a number it is about to show. True: it is held (kept, added to what is held for the same enemy in the same
   * style and colour) and must not be shown now. False: show it.
   */
  defer(en: EnemyState, value: number, style: NumStyle, color: number | undefined, now: number): boolean {
    if (this.holds.length === 0) return false;
    this.sweep(now);
    let held = false;
    for (const h of this.holds) {
      if (h.uid === en.uid) {
        held = true;
        break;
      }
    }
    if (!held) return false;
    for (const p of this.pending) {
      if (p.en.uid === en.uid && p.style === style && p.color === color) {
        p.value += value;
        return true;
      }
    }
    this.pending.push({ en, value, style, color });
    return true;
  }

  /** The shard for `uid` landed: the oldest hold of that enemy ends, and when it was the last one the numbers kept for it are shown. */
  release(uid: number): void {
    for (let i = 0; i < this.holds.length; i++) {
      if ((this.holds[i] as Hold).uid !== uid) continue;
      this.holds.splice(i, 1);
      break;
    }
    this.show(uid);
  }

  /** Holds that ran out end now; their numbers are shown. */
  sweep(now: number): void {
    for (let i = this.holds.length - 1; i >= 0; i--) {
      const h = this.holds[i] as Hold;
      if (!(now > h.until)) continue;
      this.holds.splice(i, 1);
      this.show(h.uid);
    }
  }

  /** Every hold ends and every number is shown (victory, defeat, the scene going or breaking). */
  flush(): void {
    this.holds.length = 0;
    const list = this.pending.splice(0, this.pending.length);
    for (const p of list) this.say?.(p.en, p.value, p.style, p.color);
  }

  /** How many holds are up (QA and tests). */
  get size(): number {
    return this.holds.length;
  }

  /** How many numbers are waiting (QA and tests). */
  get waiting(): number {
    return this.pending.length;
  }

  /** The numbers kept for `uid` are shown, unless another hold of that enemy is still up. */
  private show(uid: number): void {
    for (const h of this.holds) if (h.uid === uid) return;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i] as Held;
      if (p.en.uid !== uid) continue;
      this.pending.splice(i, 1);
      this.say?.(p.en, p.value, p.style, p.color);
    }
  }
}

const registry = new WeakMap<object, NumberHolds>();

/** The holds of `battle` (made on first use). */
export function numberHoldsOf(battle: object): NumberHolds {
  let h = registry.get(battle);
  if (!h) {
    h = new NumberHolds();
    registry.set(battle, h);
  }
  return h;
}
