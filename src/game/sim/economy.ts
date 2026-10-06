/** Fish and purr bookkeeping. Every change goes through here so each one is announced exactly once. */
import type { CurrencyReason } from '../api';
import { CELL_COUNT, cellCenterX, cellCenterY } from '../geometry';
import type { Sim } from './sim';

export function addFish(s: Sim, amount: number, reason: CurrencyReason, x?: number, y?: number): void {
  if (amount === 0) return;
  s.fish += amount;
  if (s.ev.has('fish')) s.ev.emit('fish', { total: s.fish, delta: amount, reason, x, y });
}

/** Income that the "rich" daily rule doubles; fractions accumulate until they make a whole fish. */
export function earnFish(s: Sim, amount: number, reason: CurrencyReason, x?: number, y?: number): number {
  s.fishFrac += amount * s.fishMult;
  const whole = Math.floor(s.fishFrac + 1e-9);
  if (whole <= 0) return 0;
  s.fishFrac -= whole;
  addFish(s, whole, reason, x, y);
  return whole;
}

export function addPurr(s: Sim, amount: number, reason: CurrencyReason, x?: number, y?: number): void {
  if (amount === 0) return;
  s.purr += amount;
  if (s.ev.has('purr')) s.ev.emit('purr', { total: s.purr, delta: amount, reason, x, y });
}

/** Chef cats: +1 fish per chef in range of a death, at most `cap` per wave across the whole board. */
export function chefHarvest(s: Sim, x: number, y: number): void {
  let cap = 0;
  let hits = 0;
  for (let c = 0; c < CELL_COUNT; c++) {
    const u = s.units[c];
    const chef = u?.spec.aura.chef;
    if (!u || !chef) continue;
    const limit = Math.round(chef.cap * (1 + u.perk.aura));
    if (limit > cap) cap = limit;
    const dx = x - cellCenterX(c);
    const dy = y - cellCenterY(c);
    if (!u.blocked && dx * dx + dy * dy <= u.stats.range * u.stats.range) hits++;
  }
  const gain = Math.min(hits, cap - s.chefFish);
  if (gain <= 0) return;
  s.chefFish += gain;
  earnFish(s, gain, 'unit', x, y);
}
