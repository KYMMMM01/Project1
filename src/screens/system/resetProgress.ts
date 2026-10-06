/** "Erase progress": two confirmations, then the saved progress is removed and the game restarts. */
import { getStorageBackend } from '@/core/save';
import { t } from '@/core/i18n';
import { profile } from '@/meta';
import { SAVE_KEY } from '@/meta/profileData';
import { confirmDialog } from '@/ui/dialogs';
import './strings';

/** Everything that records progress. Settings (volume, language, quality tier) are kept. */
const PROGRESS_KEYS: readonly string[] = [SAVE_KEY, 'meowguard.hints', 'meowguard.promo', 'meowguard.routine'];

export async function resetProgress(): Promise<void> {
  const first = await confirmDialog({
    title: t('rt.sys.reset.title1'),
    message: t('rt.sys.reset.msg1'),
    confirmLabel: t('rt.sys.reset.yes1'),
    cancelLabel: t('rt.sys.reset.no'),
    danger: true,
  });
  if (!first) return;
  const second = await confirmDialog({
    title: t('rt.sys.reset.title2'),
    message: t('rt.sys.reset.msg2'),
    confirmLabel: t('rt.sys.reset.yes2'),
    cancelLabel: t('rt.sys.reset.no'),
    danger: true,
  });
  if (!second) return;
  // Settle any debounced write first so nothing re-creates the save after it is removed.
  await profile.flush();
  const backend = getStorageBackend();
  for (const key of PROGRESS_KEYS) await backend.remove(key);
  window.location.reload();
}
