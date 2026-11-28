/**
 * The hit-feel pass of 2026-11-27 (a tester: the fight's sounds are bland; the owner: that means the hits have no impact). What it changed can be switched off
 * together, so that the same build can be heard both ways: `?oldsound=1` plays the game as it sounded before the pass (the takes alone, the old spacing of the hit
 * sounds, no confirm on a kill). Only a test build reads the switch; a store build (`VITE_SOUNDBOARD=off`) always plays the new sounds.
 */
function readOld(): boolean {
  if (import.meta.env.VITE_SOUNDBOARD === 'off') return false;
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).has('oldsound');
  } catch {
    return false;
  }
}

export const soundPass = { old: readOld() };
