/**
 * The nickname on the home name plate and the profile screen: the ranking name from the server when signed in, "nameless butler" otherwise.
 * The last name read is kept on the device (with the account it belongs to), so an offline start still shows it.
 */
import { Emitter } from '@/core/events';
import { t } from '@/core/i18n';
import { account, ranking } from '@/platform';
import { loadRoutinePrefs, patchRoutinePrefs, routinePrefs } from './prefs';
import './strings';

const events = new Emitter<{ change: string }>();
/** Bumped by every rename and every read: a read that comes back after a newer one started, or after a rename, is dropped. */
let version = 0;

/** Called with the name to show whenever it may have changed (a read finished, the player renamed). */
export function onNameChange(fn: (name: string) => void): () => void {
  return events.on('change', fn);
}

/** The name to show right now, without waiting for the server. */
export function shownName(): string {
  const s = account.state();
  const p = routinePrefs();
  return s.status === 'on' && p.nickUid === s.uid && p.nick ? p.nick : t('prof.nameless');
}

/** Remember `name` for the signed-in account and tell the listeners. */
export function nameChanged(name: string): void {
  const s = account.state();
  version++;
  if (s.status === 'on') patchRoutinePrefs({ nick: name, nickUid: s.uid });
  events.emit('change', shownName());
}

/** Read the name from the server (signed in and online), keep it, and tell the listeners; signed out or offline they get what the device remembers. */
export async function refreshName(): Promise<void> {
  const mine = ++version;
  await loadRoutinePrefs();
  const s = account.state();
  const name = s.status === 'on' ? ((await ranking.me())?.name ?? null) : null;
  if (mine !== version) return;
  const now = account.state();
  if (name && now.status === 'on' && s.status === 'on' && now.uid === s.uid) patchRoutinePrefs({ nick: name, nickUid: s.uid });
  events.emit('change', shownName());
}
