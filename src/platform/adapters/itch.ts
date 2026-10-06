/**
 * itch.io: no ad SDK exists, no IAP, plain localStorage (research C-2.4: "광고 SDK 없음").
 * No network request and no vendor API, so there is no SDK documentation to confirm.
 */
import { createFallbackAdapter } from '../fallback';
import type { PlatformAdapter } from '../types';

export function createAdapter(): PlatformAdapter {
  return createFallbackAdapter('itch', 'platform-adapter:itch');
}
