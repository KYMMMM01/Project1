/** Every music score by track id. The player, the offline report and the tests all read the tracks from here. */
import { BATH, CLINIC, ELITE, GARDEN, GOLD, HOME2, KITCHEN, LOSE, WIN } from './tracks';
import { BATTLE, BOSS, HOME, type MusicTrackId, type Score } from './scores';

export const SCORES: Readonly<Record<MusicTrackId, Score>> = {
  home: HOME,
  home2: HOME2,
  battle: BATTLE,
  kitchen: KITCHEN,
  bath: BATH,
  garden: GARDEN,
  clinic: CLINIC,
  elite: ELITE,
  boss: BOSS,
  gold: GOLD,
  win: WIN,
  lose: LOSE,
};

export const TRACK_IDS = Object.keys(SCORES) as MusicTrackId[];
