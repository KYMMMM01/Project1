/**
 * What the system screens remember on their own: the effect-quality choice and which level-ups and
 * unlocks were already announced. Volumes, shake, language and the like live in the battle HUD's
 * settings store (`@/view/hud/settings`), so the pause menu and this screen always agree.
 */
import { SaveStore } from '@/core/save';
import { fxSettings, setFxSettings } from '@/fx';
import { isQuality, qualityPatch, type Quality } from './settingsModel';

export interface RoutinePrefs {
  quality: Quality;
  seenLevel: number;
  seenUnlocked: string[];
}

const store = new SaveStore<RoutinePrefs>({
  key: 'meowguard.routine',
  version: 1,
  defaults: () => ({ quality: 'auto', seenLevel: 1, seenUnlocked: [] }),
});

let loading: Promise<void> | null = null;
let loaded = false;

export function applyQuality(q: Quality): void {
  setFxSettings(qualityPatch(q, fxSettings.tier));
}

/** Load once and apply the saved effect quality. Safe to call from every home scene. */
export function loadRoutinePrefs(): Promise<void> {
  loading ??= store.load().then(() => {
    if (!isQuality(store.data.quality)) store.data.quality = 'auto';
    applyQuality(store.data.quality);
    loaded = true;
  });
  return loading;
}

export function prefsLoaded(): boolean {
  return loaded;
}

export function routinePrefs(): Readonly<RoutinePrefs> {
  return store.data;
}

export function patchRoutinePrefs(patch: Partial<RoutinePrefs>): void {
  Object.assign(store.data, patch);
  store.save();
}

export function setQuality(q: Quality): void {
  patchRoutinePrefs({ quality: q });
  applyQuality(q);
}
