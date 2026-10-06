/** Vibration feedback (Android Chrome; a no-op on iOS Safari and desktop). */
export type HapticId = 'tap' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'jackpot';

const PATTERNS: Record<HapticId, number | number[]> = {
  tap: 8,
  light: 12,
  medium: 22,
  heavy: 40,
  success: [14, 40, 22],
  warning: [30, 50, 30],
  error: [40, 40, 40, 40, 40],
  jackpot: [20, 30, 20, 30, 20, 30, 60],
};

let enabled = true;
let last = 0;

export function setHapticsEnabled(v: boolean): void {
  enabled = v;
}

export function haptic(id: HapticId): void {
  if (!enabled || typeof navigator === 'undefined' || !navigator.vibrate) return;
  // Rate-limit: dozens of hits per second would turn into one continuous buzz.
  const now = performance.now();
  if (now - last < 45 && (id === 'tap' || id === 'light')) return;
  last = now;
  try {
    navigator.vibrate(PATTERNS[id]);
  } catch {
    // Some embedded webviews throw when there has been no user gesture yet.
  }
}
