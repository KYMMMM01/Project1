/**
 * The skill rings of one battle: which cats wear one, what each shows this frame, which full rings pulse, and the flash and shrug of a
 * cast. It reads the unit's own state (`UnitState.sp`, `blocked`) and the battle's clock (`BattleApi.time`: it stands still under a popup
 * and runs with the game speed) and listens to one event, `spCast`, for the flash. Made only when the battle plays with skills
 * (`BattleApi.spOn`): with them off no listener is added, nothing is painted and no view gets a ring (the screen is exactly what it was).
 *
 * `UnitViews` calls `begin` once a frame, `attach` when a view is given a cat and `tick` after each view has stepped.
 */
import { fxSettings } from '@/fx/settings';
import { unitDef } from '@/game';
import type { UnitState } from '@/game/api';
import { motion } from '@/ui';
import type { FieldEnv } from './env';
import { SpRingView, spRingArt, type RingLook, type SpRingArt } from './spRing';
import {
  FLASH_SECONDS, PULSE_MAX, PULSE_PERIOD, PulseClock, PulseRoster, RING_FULL, SHRUG_SECONDS, momentK, pulseWave, ringFrame, ringMarkOf, shrugCurve,
} from './spRingMath';
import type { UnitView } from './unitView';

export class SpRings {
  private sheet: SpRingArt | null = null;
  private readonly roster = new PulseRoster();
  private readonly clock = new PulseClock();
  /** uid -> battle time of the cat's last cast: what the flash and the shrug count from. */
  private readonly castAt = new Map<number, number>();
  private lastTime: number;
  private dt = 0;
  /** What a ring is told each frame: one object refilled for every cat, so a frame allocates nothing. */
  private readonly look: RingLook = { frame: 0, blocked: false, pulsing: false, wave: 0, flash: -1, mark: null, calm: false, low: false };
  private readonly off: () => void;

  constructor(private readonly env: FieldEnv) {
    this.lastTime = env.battle.time;
    this.off = env.battle.events.on('spCast', (e) => {
      this.castAt.set(e.unit.uid, env.battle.time);
    });
  }

  /** Once a frame, before any cat is drawn: moves the pulse clock and works out which full rings pulse. */
  begin(dt: number): void {
    const { battle } = this.env;
    const now = battle.time;
    this.clock.advance(Math.max(0, now - this.lastTime), dt);
    this.lastTime = now;
    this.dt = dt;
    this.roster.begin();
    for (const u of battle.units) {
      if (!u || u.sp < 1 || u.blocked) continue;
      // A gunner that is saving its shot is full but NOT ready: it stays calm and takes no pulse slot from a cat that really is ready.
      const skill = unitDef(u.id).spSkill;
      this.roster.see(u.uid, !(skill && ringMarkOf(skill.id, u, battle, false) === 'holstered'));
    }
    this.roster.end();
    if (this.castAt.size > 0) {
      for (const [uid, at] of this.castAt) if (now - at > Math.max(FLASH_SECONDS, SHRUG_SECONDS)) this.castAt.delete(uid);
    }
  }

  /** A view was given `u`: it wears a ring if the cat has a skill, and its class sticker steps aside for it. */
  attach(v: UnitView, u: UnitState): void {
    if (!unitDef(u.id).spSkill) {
      v.attachRing(null);
      return;
    }
    this.sheet ??= spRingArt();
    v.attachRing(v.ringKept ?? new SpRingView(this.sheet));
  }

  /** Draw the ring of the cat on `v` (after the view has stepped) and give its shrug to the next step. */
  tick(v: UnitView, u: UnitState): void {
    const ring = v.spRing;
    const skill = unitDef(u.id).spSkill;
    if (!ring || !skill) return;
    const { battle } = this.env;
    const at = this.castAt.get(u.uid);
    const calm = motion.reduced;
    v.shrug = !calm && at !== undefined ? shrugCurve(momentK(battle.time, at, SHRUG_SECONDS)) : 0;
    const frame = ringFrame(u.sp);
    const look = this.look;
    look.frame = frame;
    look.blocked = u.blocked;
    look.pulsing = frame === RING_FULL && this.roster.pulses(u.uid);
    // The pulsing rings swell a quarter of a pulse apart (not in lockstep: four rings swelling together are a wall, one after another a ripple).
    look.wave = pulseWave(this.clock.seconds + this.roster.slot(u.uid) * (PULSE_PERIOD / PULSE_MAX));
    look.flash = at === undefined ? -1 : momentK(battle.time, at, FLASH_SECONDS);
    look.mark = ringMarkOf(skill.id, u, battle, calm);
    look.calm = calm;
    look.low = fxSettings.tier === 'low';
    ring.draw(look, this.dt);
  }

  /** Cats whose rings pulse right now, in the order they became full (a QA hook). */
  pulsing(): number[] {
    return this.roster.order();
  }

  destroy(): void {
    this.off();
    this.castAt.clear();
    this.roster.clear();
  }
}
