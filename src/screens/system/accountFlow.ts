/**
 * The game account's steps that ask the player something (docs/계정_Firebase.md): sign in (the first time, the age question: under-14s may
 * not make an account, Korean privacy law; they keep playing as guests), and delete the account (Google Play's rule: from inside the app).
 * The title card and the settings sheet both use these.
 */
import { t } from '@/core/i18n';
import { getStorageBackend } from '@/core/save';
import { account } from '@/platform';
import { confirmDialog, toast } from '@/ui';
import './strings';

/** Set once the player said they are 14 or older (kept on the device; a reinstall asks again). */
const AGE_KEY = 'account.age14';

async function ageConfirmed(): Promise<boolean> {
  const store = getStorageBackend();
  if ((await store.get(AGE_KEY).catch(() => null)) === '1') return true;
  const ok = await confirmDialog({
    title: t('rt.sys.acct.age.title'),
    message: t('rt.sys.acct.age.body'),
    confirmLabel: t('rt.sys.acct.age.yes'),
    cancelLabel: t('rt.sys.acct.age.no'),
  });
  if (ok) await store.set(AGE_KEY, '1').catch(() => undefined);
  else toast(t('rt.sys.acct.age.guest'), 'info');
  return ok;
}

/** The sign-in button: the age question the first time, then Google's sheet. True when signed in. */
export async function signInFlow(): Promise<boolean> {
  if (!(await ageConfirmed())) return false;
  const ok = await account.signIn();
  if (ok) toast(t('rt.sys.acct.signedIn'), 'success');
  return ok;
}

export async function signOutFlow(): Promise<void> {
  const ok = await confirmDialog({
    title: t('rt.sys.acct.out.title'),
    message: t('rt.sys.acct.out.body'),
    confirmLabel: t('rt.sys.acct.out.yes'),
    cancelLabel: t('rt.sys.acct.cancel'),
  });
  if (ok) await account.signOut();
}

/** Account deletion: what goes and what stays, then Google asks for the account once more, then it is gone. */
export async function deleteAccountFlow(): Promise<void> {
  const ok = await confirmDialog({
    title: t('rt.sys.acct.del.title'),
    message: t('rt.sys.acct.del.body'),
    confirmLabel: t('rt.sys.acct.del.yes'),
    cancelLabel: t('rt.sys.acct.cancel'),
    danger: true,
  });
  if (!ok) return;
  const r = await account.deleteAccount();
  if (r === 'deleted') toast(t('rt.sys.acct.del.done'), 'success');
  else if (r === 'failed') toast(t('rt.sys.acct.del.failed'), 'warning');
}
