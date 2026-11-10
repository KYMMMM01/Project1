import { getLang, t } from '@/core/i18n';
import type { BackupPreview, CloudChoice } from '@/meta';
import { choiceDialog } from '@/ui';

/**
 * The question after a Google Play Games sign-in when the cloud holds another device's progress and this device has its own: both side by
 * side. Only a tap on one of the two buttons decides; closing it leaves both copies as they are.
 */
export async function askCloudChoice(cloud: BackupPreview, local: BackupPreview): Promise<CloudChoice> {
  const when = new Date(cloud.savedAt).toLocaleString(getLang() === 'ko' ? 'ko-KR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const pick = await choiceDialog({
    title: t('meta.cloud.ask.title'),
    message: t('meta.cloud.ask.body', {
      cl: cloud.accountLevel,
      cc: cloud.chaptersCleared,
      cg: cloud.gems,
      cw: when,
      ll: local.accountLevel,
      lc: local.chaptersCleared,
      lg: local.gems,
    }),
    confirmLabel: t('meta.cloud.ask.cloud'),
    cancelLabel: t('meta.cloud.ask.local'),
    danger: true,
  });
  // Closed with Back or Escape: no answer, nothing is written; the question comes again at the next resume.
  return pick === null ? 'later' : pick ? 'cloud' : 'local';
}
