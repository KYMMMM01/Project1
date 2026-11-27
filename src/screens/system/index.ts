import { closeCodex } from '@/codex';
import { debugExpose } from '@/core/debug';
import { guideProgress, TOPIC_IDS, type GuideProgress } from '@/guide';
import { profile, setCloudChooser } from '@/meta';
import { popups } from '@/ui/Popup';
import { ensureSettings } from '@/view/hud/settings';
import { provide, services, type Shell } from '../contract';
import { AutoPopups, markOffered } from './autoPopups';
import { CalendarPopup } from './calendarPopup';
import { askCloudChoice } from './cloudChoice';
import { stopConfetti } from './kit/confetti';
import { loadRoutinePrefs, markProfileSeen } from './prefs';
import { closeProfile, openProfile } from './profileScreen';
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
  setCloudChooser(askCloudChoice);
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
  provide('openProfile', openProfile);
  provide('openCalendar', () => void openCalendar());

  const self: Installed = {
    dispose: () => {
      auto.dispose();
      closeSettingsScreen();
      closeProfile();
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
    /**
     * QA: count every announcement as made (levels, unlocks, today's attendance, welcome back, gem pass) and every guidebook topic as
     * read (no first-encounter card; a sandbox battle keeps its own record, made new with each battle, so call it again once that
     * battle is open), then close the popups that are up. Resolves with how many are still open or queued. Call it again after a
     * cheat that unlocks or levels up (`meta.unlockAll`, `finishRuns`, `advance`).
     */
    markSeen: async (): Promise<number> => {
      await Promise.all([loadRoutinePrefs(), guideProgress.load()]);
      markProfileSeen();
      markOffered(profile.today());
      const live = (window.__dbg?.lessons as { progress?: GuideProgress } | null | undefined)?.progress;
      for (const book of new Set([guideProgress, live])) for (const id of TOPIC_IDS) book?.markRead(id);
      popups.closeAll();
      return popups.count + popups.queued;
    },
  });
}
