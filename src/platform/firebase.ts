/**
 * The Firebase project (docs/계정_Firebase.md): one app, its auth, Firestore and the ranking functions (asia-northeast3), loaded on first
 * use so the first screen does not wait for the SDK. The config is per build (VITE_FIREBASE_*, public by design: the Firestore rules and the
 * functions guard the data); without it every caller sees "not available" and the game plays as a guest, as before the Firebase setup.
 */
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';

export interface FirebaseKit {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  fns: Functions;
  authMod: typeof import('firebase/auth');
  dbMod: typeof import('firebase/firestore');
  fnMod: typeof import('firebase/functions');
}

/** Where the functions run (firebase.json, functions/src): next to the Seoul Firestore. */
export const FUNCTIONS_REGION = 'asia-northeast3';

function config(): Record<string, string> | null {
  const e = import.meta.env;
  const apiKey = e.VITE_FIREBASE_API_KEY;
  const projectId = e.VITE_FIREBASE_PROJECT_ID;
  const appId = e.VITE_FIREBASE_APP_ID;
  if (!apiKey || !projectId || !appId) return null;
  return { apiKey, projectId, appId, authDomain: e.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com` };
}

export const firebaseConfigured = (): boolean => config() !== null;

let kit: Promise<FirebaseKit | null> | null = null;

/** The kit, made once; null without a config or when the SDK failed to load (offline first start: asked again next time). */
export function firebase(): Promise<FirebaseKit | null> {
  const cfg = config();
  if (!cfg) return Promise.resolve(null);
  kit ??= (async () => {
    const [appMod, authMod, dbMod, fnMod] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
      import('firebase/functions'),
    ]);
    const app = appMod.initializeApp(cfg);
    // initializeAuth, not getAuth: getAuth also loads the popup and redirect helpers, which an app's WebView cannot use; the session is kept
    // in IndexedDB (local storage where that is missing).
    const auth = authMod.initializeAuth(app, {
      persistence: [authMod.indexedDBLocalPersistence, authMod.browserLocalPersistence],
      popupRedirectResolver: import.meta.env.VITE_PLATFORM === 'capacitor' ? undefined : authMod.browserPopupRedirectResolver,
    });
    const db = dbMod.getFirestore(app);
    const fns = fnMod.getFunctions(app, FUNCTIONS_REGION);
    return { app, auth, db, fns, authMod, dbMod, fnMod };
  })().catch((e: unknown) => {
    console.warn('[firebase] SDK did not load:', e);
    kit = null;
    return null;
  });
  return kit;
}

/** Tests: forget the kit. */
export function resetFirebaseForTests(): void {
  kit = null;
}
