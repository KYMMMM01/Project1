import { debugExpose } from '@/core/debug';
import { accountProgress, profile } from '@/meta';
import { popups } from '@/ui/Popup';
import { ensureSettings } from '@/view/hud/settings';
import { provide, services, type Shell } from '../contract';
import { AutoPopups } from './autoPopups';
import { CalendarPopup } from './calendarPopup';
import { stopConfetti } from './kit/confetti';
import { loadRoutinePrefs, patchRoutinePrefs } from './prefs';
import { closeSettingsScreen, openSettingsScreen, scrollSettingsTo } from './settingsScreen';
import './strings';

interface Installed {
  dispose(): void;
}

let installed: Installed | null = null;

/**
 * Registers the system screens as services (settings, calendar) and starts the automatic popups.
 * Called once at boot with the app's shell, which outlives every home scene; a second call replaces
 * the first.
 */
export function installSystemScreens(shell: Shell): void {
  installed?.dispose();
  void ensureSettings();
  void loadRoutinePrefs();

  const auto = new AutoPopups(shell);
  let calendar: CalendarPopup | null = null;
  provide('openSettings', () => void openSettingsScreen(() => shell.refresh()));
  provide('openCalendar', () => {
    if (calendar && !calendar.destroyed) return;
    calendar = new CalendarPopup(shell);
    void popups.open(calendar).then(() => {
      calendar = null;
    });
  });

  const self: Installed = {
    dispose: () => {
      auto.dispose();
      closeSettingsScreen();
      calendar?.close();
      stopConfetti();
    },
  };
  installed = self;
  debugExpose('routine', {
    openSettings: () => services.openSettings(),
    openCalendar: () => services.openCalendar(),
    popups,
    scrollSettingsTo,
    /** QA: count every level and unlock as announced, so no automatic popup interrupts a screenshot. */
    markSeen: () => patchRoutinePrefs({ seenLevel: accountProgress(profile.data.accountXp).level, seenUnlocked: [...profile.data.unlocked] }),
  });
}
