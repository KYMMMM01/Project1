/**
 * Player settings that the battle screens expose (volumes, shake, flashes, haptics, damage numbers,
 * language). Stored under one key and pushed into audio, the shake scale, the effect switches, haptics
 * and i18n. The meta profile has no settings slot yet, so this owns the save (see the hand-off note).
 */
import { audio } from '@/audio';
import { game } from '@/core/game';
import { setHapticsEnabled } from '@/core/haptics';
import { setLang, type Lang } from '@/core/i18n';
import { SaveStore } from '@/core/save';
import { setFxSettings, type NumbersMode } from '@/fx';
import { motion } from '@/ui';
import { shakeScaleOf, type ShakeMode } from './settingsMath';

export interface SettingsData {
  sfx: number;
  music: number;
  shake: ShakeMode;
  flashes: boolean;
  haptics: boolean;
  numbers: NumbersMode;
  /** Off by default and never taken from the OS flag (see `motion` in the UI kit). */
  reduceMotion: boolean;
  /** '' = follow the device language. */
  lang: Lang | '';
}

const store = new SaveStore<SettingsData>({
  key: 'meowguard.settings',
  version: 1,
  defaults: () => ({
    sfx: 0.8,
    music: 0.5,
    shake: 'full',
    flashes: true,
    haptics: true,
    numbers: 'full',
    reduceMotion: false,
    lang: '',
  }),
});

let loading: Promise<void> | null = null;

function apply(s: Partial<SettingsData>): void {
  if (s.sfx !== undefined) audio.setSfxVolume(s.sfx);
  if (s.music !== undefined) audio.setMusicVolume(s.music);
  if (s.shake !== undefined) {
    game.shakeScale = shakeScaleOf(s.shake);
    game.shakeEnabled = s.shake !== 'off';
  }
  if (s.flashes !== undefined) setFxSettings({ flashes: s.flashes });
  if (s.numbers !== undefined) setFxSettings({ numbers: s.numbers });
  if (s.reduceMotion !== undefined) {
    motion.reduced = s.reduceMotion;
    setFxSettings({ reducedMotion: s.reduceMotion });
  }
  if (s.haptics !== undefined) setHapticsEnabled(s.haptics);
  if (s.lang) setLang(s.lang);
}

/** Load the saved settings once and apply them. Safe to call from every battle. */
export function ensureSettings(): Promise<void> {
  loading ??= store.load().then(() => apply(store.data));
  return loading;
}

export function currentSettings(): Readonly<SettingsData> {
  return store.data;
}

export function updateSettings(patch: Partial<SettingsData>): void {
  Object.assign(store.data, patch);
  apply(patch);
  store.save();
}
