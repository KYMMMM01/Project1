/**
 * Loads one vendor SDK script the way the vendor documents (a <script src> element). This is the ONLY
 * external request the platform layer ever makes, and only the four portal adapters call it, each with
 * its own vendor URL, only in that platform's build.
 */
import { errorMessage } from './util';

export interface LoadScriptOptions {
  /** Skip loading when the SDK global already exists (host page already included it, or tests). */
  isLoaded?: () => boolean;
  /** Give up after this long. Default 4000 (boot's total budget is 5000). */
  timeoutMs?: number;
  /** id attribute for the script element (GameDistribution's documented loader uses one). */
  id?: string;
}

export function loadScript(src: string, o: LoadScriptOptions = {}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      if (o.isLoaded?.()) {
        resolve();
        return;
      }
      if (typeof document === 'undefined') {
        reject(new Error('no document'));
        return;
      }
      const el = document.createElement('script');
      const timer = setTimeout(() => {
        el.remove();
        reject(new Error(`timeout loading ${src}`));
      }, o.timeoutMs ?? 4000);
      el.src = src;
      el.async = true;
      if (o.id) el.id = o.id;
      el.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      el.onerror = () => {
        clearTimeout(timer);
        el.remove();
        reject(new Error(`failed to load ${src} (blocked or offline)`));
      };
      (document.head ?? document.documentElement).appendChild(el);
    } catch (e) {
      reject(new Error(errorMessage(e)));
    }
  });
}
