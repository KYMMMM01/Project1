/** The 30-tier season pass. Pure: every function returns a new slice. */
import {
  PASS_TIERS,
  PASS_XP_PER_TIER,
  SEASON_DAYS,
  SEASON_EPOCH,
  passFreeReward,
  passPremiumReward,
} from './data/schedule';
import { daysBetween } from './time';
import type { Bundle, PassSlice } from './types';

export type PassTrack = 'free' | 'premium';

export function freshPass(season: number): PassSlice {
  return { season, xp: 0, premium: false, claimedFree: [], claimedPremium: [] };
}

/** Season number of a date. Dates before the epoch count as season 0. */
export function seasonOf(date: string): number {
  return Math.max(0, Math.floor(daysBetween(SEASON_EPOCH, date) / SEASON_DAYS));
}

/** Days left in the season including `date`. */
export function seasonDaysLeft(date: string): number {
  const into = Math.max(0, daysBetween(SEASON_EPOCH, date)) % SEASON_DAYS;
  return SEASON_DAYS - into;
}

/** A new season wipes progress and the premium row; a date inside the stored season changes nothing. */
export function rollPass(pass: PassSlice, date: string): PassSlice {
  const season = seasonOf(date);
  return season > pass.season ? freshPass(season) : pass;
}

export function addPassXp(pass: PassSlice, xp: number): PassSlice {
  return { ...pass, xp: Math.min(PASS_TIERS * PASS_XP_PER_TIER, pass.xp + Math.max(0, Math.floor(xp))) };
}

/** Tiers reached so far (0..30). */
export function passTier(pass: PassSlice): number {
  return Math.min(PASS_TIERS, Math.floor(pass.xp / PASS_XP_PER_TIER));
}

export function passReward(track: PassTrack, tier: number): Bundle {
  return track === 'free' ? passFreeReward(tier) : passPremiumReward(tier);
}

/** Tiers whose reward can be taken now. The premium row opens retroactively on purchase. */
export function claimableTiers(pass: PassSlice, track: PassTrack): number[] {
  if (track === 'premium' && !pass.premium) return [];
  const done = track === 'free' ? pass.claimedFree : pass.claimedPremium;
  const out: number[] = [];
  for (let tier = 1; tier <= passTier(pass); tier++) if (!done.includes(tier)) out.push(tier);
  return out;
}

export function claimPassTier(
  pass: PassSlice,
  track: PassTrack,
  tier: number,
): { pass: PassSlice; reward: Bundle } | null {
  if (!claimableTiers(pass, track).includes(tier)) return null;
  const next: PassSlice =
    track === 'free'
      ? { ...pass, claimedFree: [...pass.claimedFree, tier] }
      : { ...pass, claimedPremium: [...pass.claimedPremium, tier] };
  return { pass: next, reward: passReward(track, tier) };
}
