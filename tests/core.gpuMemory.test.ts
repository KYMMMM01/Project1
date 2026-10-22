import { describe, expect, it, vi } from 'vitest';
import { TexturePool, type Renderer, type Texture } from 'pixi.js';
import { MAX_MULTISAMPLE_BYTES, POOL_GRAIN, TRIM_DELAY_MS, gpuMemoryStats, grainSize, installGpuMemory, mayMultisample, releaseMultisample, trimBakePool, trimBakePoolSoon } from '@/core/gpuMemory';

describe('pool sizes', () => {
  it('round up to the next grain, never to a power of two', () => {
    expect(grainSize(300)).toBe(304);
    expect(grainSize(305)).toBe(320);
    expect(grainSize(POOL_GRAIN)).toBe(POOL_GRAIN);
    expect(grainSize(1)).toBe(POOL_GRAIN);
    expect(grainSize(1024)).toBe(1024);
    expect(grainSize(3429 * 1.35)).toBe(4640);
  });
});

describe('the multisample limit', () => {
  it('lets a panel or a screen-sized sheet keep its smooth edges and refuses the tall cached list', () => {
    expect(mayMultisample(304, 304)).toBe(true);
    expect(mayMultisample(1024, 1024)).toBe(true);
    expect(mayMultisample(2048, 1024)).toBe(true);
    expect(mayMultisample(1024, 2432)).toBe(true);
    expect(mayMultisample(1024, 4096)).toBe(false);
    expect(mayMultisample(1024, 8192)).toBe(false);
    // The limit is on the renderbuffer's bytes: width x height x 4 samples x 4 bytes.
    const edge = Math.floor(Math.sqrt(MAX_MULTISAMPLE_BYTES / 16));
    expect(mayMultisample(edge, edge)).toBe(true);
    expect(mayMultisample(edge + 8, edge + 8)).toBe(false);
  });
});

/** A texture and a renderer that only keep the books of what is released. */
function fake(antialias: boolean): { renderer: Renderer; texture: Texture; released: unknown[]; target: object } {
  const source = { antialias };
  const target = { id: 'render target' };
  const released: unknown[] = [];
  const renderer = {
    renderTarget: {
      _renderSurfaceToRenderTargetHash: new Map<unknown, unknown>([[source, target]]),
      _releaseGpuRenderTarget: (t: unknown) => void released.push(t),
    },
  } as unknown as Renderer;
  return { renderer, texture: { source } as unknown as Texture, released, target };
}

describe('releasing the multisample buffers of a baked texture', () => {
  it('releases the render target of a texture that has them', () => {
    const f = fake(true);
    const before = gpuMemoryStats.released;
    expect(releaseMultisample(f.renderer, f.texture)).toBe(true);
    expect(f.released).toEqual([f.target]);
    expect(gpuMemoryStats.released).toBe(before + 1);
  });

  it('leaves a texture without multisampling alone', () => {
    const f = fake(false);
    expect(releaseMultisample(f.renderer, f.texture)).toBe(false);
    expect(f.released).toEqual([]);
  });

  it('does nothing for a texture the renderer has no render target for (never drawn into)', () => {
    const f = fake(true);
    (f.renderer.renderTarget as unknown as { _renderSurfaceToRenderTargetHash: Map<unknown, unknown> })._renderSurfaceToRenderTargetHash.clear();
    expect(releaseMultisample(f.renderer, f.texture)).toBe(false);
    expect(f.released).toEqual([]);
  });

  it('copes with a renderer whose internals are not the ones it knows', () => {
    const renderer = { renderTarget: {} } as unknown as Renderer;
    expect(releaseMultisample(renderer, { source: { antialias: true } } as unknown as Texture)).toBe(false);
  });
});

describe('the pool', () => {
  installGpuMemory(() => null);

  it('sizes a texture to the grain, and a request for a huge multisample buffer is answered without one', () => {
    const small = TexturePool.getOptimalTexture({ width: 300, height: 290, resolution: 1, antialias: true });
    expect([small.source.pixelWidth, small.source.pixelHeight]).toEqual([304, 304]);
    expect(small.source.antialias).toBe(true);
    const capped = gpuMemoryStats.capped;
    const tall = TexturePool.getOptimalTexture({ width: 1000, height: 3429, resolution: 1.35, antialias: true });
    expect(tall.source.antialias).toBe(false);
    expect(gpuMemoryStats.capped).toBe(capped + 1);
    // An ordinary request for no multisampling is not counted as a cut.
    TexturePool.getOptimalTexture({ width: 1000, height: 3429, resolution: 1.35, antialias: false });
    expect(gpuMemoryStats.capped).toBe(capped + 1);
    TexturePool.returnTexture(small);
    TexturePool.returnTexture(tall);
  });

  it('gives back the same texture for the same size, and drops the idle ones when asked to trim', () => {
    const a = TexturePool.getOptimalTexture({ width: 200, height: 100, resolution: 1 });
    TexturePool.returnTexture(a);
    const b = TexturePool.getOptimalTexture({ width: 205, height: 105, resolution: 1 });
    expect(b).toBe(a);
    TexturePool.returnTexture(b);
    const destroy = vi.spyOn(b, 'destroy');
    const trimmed = gpuMemoryStats.trimmed;
    trimBakePool();
    expect(destroy).toHaveBeenCalled();
    expect(gpuMemoryStats.trimmed).toBeGreaterThan(trimmed);
  });
});

describe('trimming a moment after a screen closes', () => {
  it('trims once however often it is asked, and again for a later ask', () => {
    vi.useFakeTimers();
    try {
      const clear = vi.spyOn(TexturePool, 'clear');
      trimBakePoolSoon();
      trimBakePoolSoon();
      trimBakePoolSoon();
      vi.advanceTimersByTime(TRIM_DELAY_MS - 1);
      expect(clear).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2);
      expect(clear).toHaveBeenCalledTimes(1);
      trimBakePoolSoon();
      vi.advanceTimersByTime(TRIM_DELAY_MS + 1);
      expect(clear).toHaveBeenCalledTimes(2);
      clear.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});
