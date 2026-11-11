/**
 * The game account (docs/계정_Firebase.md): an optional Google sign-in to Firebase Authentication, and the cloud save it unlocks (one
 * Firestore document, users/{uid}). On the Android app the Google account is picked with Android's own sheet (Credential Manager, through
 * @capacitor-firebase/authentication with skipNativeAuth: only this web SDK holds the session); on the web build it is Google's popup.
 * Guests never need it: without a Firebase config the state stays 'none' and nothing here does anything.
 */
import type { AuthCredential, User } from 'firebase/auth';
import { firebase, firebaseConfigured, type FirebaseKit } from './firebase';
import { errorMessage } from './util';

/** none: no Firebase on this build; wait: asking; on: signed in; off: signed out (the sign-in button). */
export type AccountState = { status: 'none' } | { status: 'wait' } | { status: 'on'; uid: string; email: string } | { status: 'off' };

/** How long a cloud write may take before it counts as failed (offline: the next change or resume tries again). */
const WRITE_TIMEOUT_MS = 15_000;

let state: AccountState = { status: 'none' };
const listeners = new Set<(s: AccountState) => void>();
let started = false;
/** The cloud copy's record, as last read or written: a write never lowers it (the rules refuse a lower one). */
let cloudBest = 0;

function set(next: AccountState): void {
  state = next;
  for (const fn of [...listeners]) fn(state);
}

const native = (): boolean => import.meta.env.VITE_PLATFORM === 'capacitor';

/** A Google credential from Android's account sheet, null when the player closed it. */
async function nativeCredential(k: FirebaseKit): Promise<AuthCredential | null> {
  if (import.meta.env.VITE_PLATFORM !== 'capacitor') return null;
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
  try {
    const r = await FirebaseAuthentication.signInWithGoogle();
    const idToken = r.credential?.idToken;
    return idToken ? k.authMod.GoogleAuthProvider.credential(idToken) : null;
  } catch (e) {
    // A closed sheet, no Google account on the phone, no network: all a quiet "not now".
    console.warn('[account] Google sheet:', errorMessage(e));
    return null;
  }
}

const cancelled = (e: unknown): boolean => /popup-closed|cancelled-popup|user-cancel/i.test(errorMessage(e));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

let listening = false;
/** Follow Firebase's session (restored, signed in, signed out): once, by whoever loaded the SDK first. */
function listen(k: FirebaseKit): void {
  if (listening) return;
  listening = true;
  k.authMod.onAuthStateChanged(k.auth, signedIn);
}

function signedIn(u: User | null): void {
  if (u) set({ status: 'on', uid: u.uid, email: u.email ?? '' });
  else {
    cloudBest = 0;
    set({ status: 'off' });
  }
}

export const account = {
  state(): AccountState {
    return state;
  },

  /** Calls `fn` on every change; returns the unsubscribe. */
  onChange(fn: (s: AccountState) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Boot: restore the last session (Firebase keeps it on the device). Never throws. */
  async start(): Promise<void> {
    if (started || !firebaseConfigured()) return;
    started = true;
    set({ status: 'wait' });
    const k = await firebase();
    if (!k) {
      started = false;
      set({ status: 'off' });
      return;
    }
    listen(k);
  },

  /** The sign-in button. True when the player is signed in afterwards; false when they closed the sheet or it failed. */
  async signIn(): Promise<boolean> {
    const k = await firebase();
    if (!k) return false;
    listen(k);
    const before = state;
    set({ status: 'wait' });
    try {
      if (native()) {
        const cred = await nativeCredential(k);
        if (!cred) {
          set(before.status === 'wait' ? { status: 'off' } : before);
          return false;
        }
        await k.authMod.signInWithCredential(k.auth, cred);
      } else {
        await k.authMod.signInWithPopup(k.auth, new k.authMod.GoogleAuthProvider());
      }
      return true;
    } catch (e) {
      if (!cancelled(e)) console.warn('[account] sign-in failed:', errorMessage(e));
      signedIn(k.auth.currentUser);
      return false;
    }
  },

  async signOut(): Promise<void> {
    const k = await firebase();
    if (!k) return;
    if (native()) {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      await FirebaseAuthentication.signOut().catch(() => undefined);
    }
    await k.authMod.signOut(k.auth).catch(() => undefined);
  },

  /**
   * Deletes the account and its cloud data (Google Play's account deletion rule). Google asks for the account once more first (Firebase
   * only deletes after a recent sign-in). The cloud save goes first, while the rules still let this user remove it; the server's deletion
   * trigger then removes the ranking records. The copy on this device stays (Settings' reset clears it).
   */
  async deleteAccount(): Promise<'deleted' | 'cancelled' | 'failed'> {
    const k = await firebase();
    const u = k?.auth.currentUser;
    if (!k || !u) return 'failed';
    try {
      if (native()) {
        const cred = await nativeCredential(k);
        if (!cred) return 'cancelled';
        await k.authMod.reauthenticateWithCredential(u, cred);
      } else {
        await k.authMod.reauthenticateWithPopup(u, new k.authMod.GoogleAuthProvider());
      }
      await k.dbMod.deleteDoc(k.dbMod.doc(k.db, 'users', u.uid));
      await k.authMod.deleteUser(u);
      if (native()) {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        await FirebaseAuthentication.signOut().catch(() => undefined);
      }
      return 'deleted';
    } catch (e) {
      if (cancelled(e)) return 'cancelled';
      console.warn('[account] delete failed:', errorMessage(e));
      return 'failed';
    }
  },

  /** The cloud save's text, null when there is none. Throws when the read failed (offline): a failed read must never look like "no copy". */
  async loadSave(): Promise<string | null> {
    const k = await firebase();
    const u = k?.auth.currentUser;
    if (!k || !u) return null;
    const snap = await k.dbMod.getDocFromServer(k.dbMod.doc(k.db, 'users', u.uid));
    if (!snap.exists()) {
      cloudBest = 0;
      return null;
    }
    const d = snap.data();
    cloudBest = Math.max(0, Math.trunc(Number(d.bestWave) || 0));
    return typeof d.data === 'string' ? d.data : null;
  },

  /**
   * Writes the cloud save (the text CloudSave made: { v, device, savedAt, data }) with the endless record beside it, where a future
   * leaderboard or a support check can read it without parsing the save. False when signed out, refused or slower than the timeout.
   */
  async writeSave(text: string, best: number): Promise<boolean> {
    const k = await firebase();
    const u = k?.auth.currentUser;
    if (!k || !u) return false;
    let head: { v?: unknown; device?: unknown; savedAt?: unknown };
    try {
      head = JSON.parse(text) as typeof head;
    } catch {
      return false;
    }
    const ref = k.dbMod.doc(k.db, 'users', u.uid);
    const write = async (): Promise<void> => {
      const bestWave = Math.max(cloudBest, Math.max(0, Math.trunc(best) || 0));
      await withTimeout(
        k.dbMod.setDoc(ref, { v: head.v, device: head.device, savedAt: head.savedAt, data: text, bestWave, updatedAt: k.dbMod.serverTimestamp() }, { merge: true }),
        WRITE_TIMEOUT_MS,
      );
      cloudBest = bestWave;
    };
    try {
      await write();
      return true;
    } catch (e) {
      // The rules refuse a lower record: another device raised it since this one last read. Read it and try once more.
      if (!/permission/i.test(errorMessage(e))) {
        console.warn('[account] cloud save failed:', errorMessage(e));
        return false;
      }
      try {
        const snap = await k.dbMod.getDocFromServer(ref);
        cloudBest = Math.max(cloudBest, Math.trunc(Number(snap.data()?.bestWave) || 0));
        await write();
        return true;
      } catch (again) {
        console.warn('[account] cloud save failed:', errorMessage(again));
        return false;
      }
    }
  },
};

/** Tests: forget the state between cases. */
export function resetAccountForTests(): void {
  state = { status: 'none' };
  listeners.clear();
  started = false;
  listening = false;
  cloudBest = 0;
}
