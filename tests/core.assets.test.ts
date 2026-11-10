import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ load: vi.fn(async (_url: string) => ({ label: _url })) }));

vi.mock('pixi.js', () => ({ Assets: { load: h.load }, Texture: { EMPTY: { empty: true } } }));

const assets = await import('@/core/assets');

beforeEach(() => h.load.mockClear());

describe('the two image loads', () => {
  it('boot brings in the menu images and leaves every battle effect sprite for later', async () => {
    const battle = assets.imageKeys().filter((k) => k.startsWith('fx_'));
    expect(battle.length).toBeGreaterThan(40);
    await assets.loadImages();
    expect(h.load).toHaveBeenCalledTimes(assets.imageKeys().length - battle.length);
    expect(assets.hasTex(battle[0] as string)).toBe(false);
    expect(assets.hasTex('unit_knight')).toBe(assets.hasImage('unit_knight'));
  });

  it('loads the battle sprites once, however many routes into a battle ask', async () => {
    const battle = assets.imageKeys().filter((k) => k.startsWith('fx_'));
    await Promise.all([assets.loadBattleImages(), assets.loadBattleImages()]);
    expect(h.load).toHaveBeenCalledTimes(battle.length);
    for (const key of battle) expect(assets.hasTex(key), key).toBe(true);
    await assets.loadBattleImages();
    expect(h.load).toHaveBeenCalledTimes(battle.length);
  });

  it('has no image for the two foe effects that were dropped', () => {
    expect(assets.hasImage('fx_foe_haste')).toBe(false);
    expect(assets.hasImage('fx_foe_heal')).toBe(false);
  });

  it('opens the battle after 8 s even when a request never answers (the rest keeps loading)', async () => {
    vi.resetModules();
    h.load.mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers();
    try {
      const fresh = await import('@/core/assets');
      let opened = false;
      void fresh.loadBattleImages().then(() => (opened = true));
      await vi.advanceTimersByTimeAsync(7999);
      expect(opened).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(opened).toBe(true);
    } finally {
      vi.useRealTimers();
      h.load.mockImplementation(async (url: string) => ({ label: url }));
    }
  });
});
