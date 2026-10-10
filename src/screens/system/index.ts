import { closeCodex } from '@/codex';
import { debugExpose } from '@/core/debug';
import { profile } from '@/meta';
import { popups } from '@/ui/Popup';
import { ensureSettings } from '@/view/hud/settings';
import { provide, services, type Shell } from '../contract';
import { AutoPopups, markCalendarOffered } from './autoPopups';
import { CalendarPopup } from './calendarPopup';
import { stopConfetti } from './kit/confetti';
import { loadRoutinePrefs, markProfileSeen } from './prefs';
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

  let calendar: CalendarPopup | null = null;
  /** The attendance calendar, from the home tab's button or by itself at the start: one at a time, resolves when it has been closed. */
  const openCalendar = (): Promise<void> => {
    if (calendar && !calendar.destroyed) return Promise.resolve();
    const popup = new CalendarPopup(shell);
    calendar = popup;
    return popups.open(popup).then(() => {
      if (calendar === popup) calendar = null;
    });
  };
  const auto = new AutoPopups(shell, openCalendar);
  provide('openSettings', () => void openSettingsScreen(() => shell.refresh()));
  provide('openCalendar', () => void openCalendar());

  const self: Installed = {
    dispose: () => {
      auto.dispose();
      closeSettingsScreen();
      closeCodex();
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
    /** QA: count every level and unlock as announced and today's attendance as offered, so no automatic popup interrupts a screenshot. */
    markSeen: () => {
      markProfileSeen();
      markCalendarOffered(profile.today());
    },
  });
}
