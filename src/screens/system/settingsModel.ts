/** Pure maps of the settings screen: effect-quality choices to fx switches, and the backup preview rows. */
import type { FxSettings, FxTier } from '@/fx/settings';

export type Quality = 'auto' | 'high' | 'mid' | 'low';

export const QUALITIES: readonly Quality[] = ['auto', 'high', 'mid', 'low'];

/** The fx switches a quality choice sets: 'auto' lets the frame-time governor move the tier, the others pin it. */
export function qualityPatch(q: Quality, current: FxTier): Pick<FxSettings, 'autoTier' | 'tier'> {
  return q === 'auto' ? { autoTier: true, tier: current } : { autoTier: false, tier: q };
}

export function isQuality(v: unknown): v is Quality {
  return v === 'auto' || v === 'high' || v === 'mid' || v === 'low';
}

/** A backup code's saved-at time as a short local date, or '' when the code carries none. */
export function savedAtText(ms: number): string {
  if (!(ms > 0)) return '';
  const d = new Date(ms);
  const two = (n: number): string => (n < 10 ? '0' + n : String(n));
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
