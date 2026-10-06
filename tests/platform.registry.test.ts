import { describe, expect, it } from 'vitest';
import { ads, analytics, iap, lifecycleSignals, platform } from '@/platform/registry';

// registry.ts is what every module imports as { ads, iap, analytics, platform }. Before initPlatform()
// runs (boot is browser-only) it is backed by the safe fallback adapter: nothing may throw.
describe('singletons before boot', () => {
  it('ads answer "unavailable" and never throw', async () => {
    analytics.consoleSink = false;
    expect(platform.id).toBe('fallback');
    expect(ads.canOffer('revive')).toBe(false);
    expect(ads.remaining('revive')).toBeGreaterThanOrEqual(0);
    await expect(ads.showRewarded('revive')).resolves.toBe('unavailable');
    await expect(ads.showRewarded('???')).resolves.toBe('unavailable');
    await expect(ads.showInterstitial('run_end')).resolves.toBe(false);
    expect(() => ads.beginRun()).not.toThrow();
    expect(() => ads.endRun('victory')).not.toThrow();
    expect(() => ads.setAdFree(false)).not.toThrow();
  });

  it('iap is unavailable and never throws', async () => {
    expect(iap.isAvailable()).toBe(false);
    await expect(iap.purchase('anything')).resolves.toBe('unavailable');
    await expect(iap.recoverPending()).resolves.toBe(0);
  });

  it('lifecycle, storage and analytics work and never throw', async () => {
    const l = platform.lifecycle;
    expect(() => {
      l.loadingStart();
      l.loadingFinished();
      l.firstFrameReady();
      l.gameReady();
      l.gameplayStart();
      l.gameplayStop();
      l.happyMoment(0.5);
    }).not.toThrow();
    let paused = 0;
    const off = l.onPause(() => paused++);
    lifecycleSignals.pause.emit();
    off();
    lifecycleSignals.pause.emit();
    expect(paused).toBe(1);

    await platform.storage.set('x', '1');
    await expect(platform.storage.get('x')).resolves.toBe('1');
    await platform.storage.remove('x');
    await expect(platform.storage.get('x')).resolves.toBeNull();
    expect(platform.storage.maxBytes).toBeGreaterThan(0);

    expect(platform.capabilities.rewardedAds).toBe(false);
    expect(() => analytics.track('run_start', { mode: 'classic' })).not.toThrow();
    expect(analytics.count).toBeGreaterThan(0);
  });
});
