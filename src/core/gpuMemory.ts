/**
 * Graphics memory of the baked pictures (cached panels, buttons, icons, drawn sprites), which is most of what a phone holds beside the art.
 *
 * Pixi gives every cache and every `generateTexture` a render target, and the renderer's own setting (`antialias: true`, for the stage) is the default for each of
 * them: a texture that is drawn into once comes with a 4x multisample renderbuffer that no one ever draws into again, and Pixi keeps it for as long as the texture lives
 * (the pool never gives it back). By count that was 560 renderbuffers, 240 MB in a battle (up to 465 MB after a few scenes), four times the memory of the pictures
 * they helped to bake. The picture is identical without them once the pass is done, so:
 *
 *  - the renderbuffers of a baked texture are released the moment its pass is finished (the next bake of the same texture makes them again: the edges stay as smooth);
 *  - a bake whose multisample buffer would be huge (a tall list cached as one picture) is drawn without multisampling at all, instead of asking the phone for it;
 *  - pooled textures are sized to the next 16 pixels, not to the next power of two (a 300 px panel took 512: two and a half times the pixels);
 *  - a scene that is leaving lets go of the pooled textures nobody holds (`trimBakePool`): the next scene starts from what it really needs.
 *
 * Everything here works on Pixi's WebGL renderer through its internals (underscore members), and does nothing where they are not there.
 */
import { GenerateTextureSystem, RenderGroupPipe, TexturePool, type Renderer, type Texture } from 'pixi.js';

/** Samples of a baked texture's multisample renderbuffer (what Pixi asks for). */
const SAMPLES = 4;
/** The most bytes a bake may ask of the multisample renderbuffer (colour only) before it is drawn without: 40 MB is a 1024 x 2432 picture. */
export const MAX_MULTISAMPLE_BYTES = 40 * 1024 * 1024;
/** Pooled textures are rounded up to a multiple of this many pixels. */
export const POOL_GRAIN = 16;

/** A pool size for `pixels`: the next multiple of `POOL_GRAIN`, never less than one grain. */
export function grainSize(pixels: number): number {
  return Math.max(POOL_GRAIN, Math.ceil(pixels / POOL_GRAIN) * POOL_GRAIN);
}

/** Whether a baked texture of this size (pixels) may have its multisample renderbuffer: it is released after the pass, but it exists during it. */
export function mayMultisample(width: number, height: number): boolean {
  return width * height * 4 * SAMPLES <= MAX_MULTISAMPLE_BYTES;
}

interface RenderTargetSystemLike {
  _renderSurfaceToRenderTargetHash?: Map<unknown, unknown>;
  _releaseGpuRenderTarget?: (renderTarget: unknown) => void;
}

/** The count of multisample renderbuffers released and the pooled textures cut, for the debug stats. */
export const gpuMemoryStats = { released: 0, capped: 0, trimmed: 0 };

/**
 * Free the framebuffers and the multisample (and stencil) renderbuffers Pixi built for a texture it has just drawn into. The texture itself, with the finished
 * picture, stays; drawing into it again builds them anew. Returns whether there was anything to release.
 */
export function releaseMultisample(renderer: Renderer, texture: Texture): boolean {
  const source = texture.source;
  if (!source.antialias) return false;
  const system = renderer.renderTarget as unknown as RenderTargetSystemLike;
  const target = system._renderSurfaceToRenderTargetHash?.get(source);
  if (!target || !system._releaseGpuRenderTarget) return false;
  system._releaseGpuRenderTarget(target);
  gpuMemoryStats.released++;
  return true;
}

let installed = false;

/** Install the patches once; `renderer` is the game's (it is the one whose textures are released). */
export function installGpuMemory(getRenderer: () => Renderer | null): void {
  if (installed) return;
  installed = true;

  // 1. Pool sizes: the next 16 pixels (or the stage's own size, as Pixi picks for a texture that fits it), not the next power of two.
  const pool = TexturePool as unknown as { getOptimalSize: (w: number, h: number, resolution?: number) => { width: number; height: number } };
  const originalSize = pool.getOptimalSize.bind(TexturePool);
  pool.getOptimalSize = (frameWidth, frameHeight, resolution = 1) => {
    const pow2 = originalSize(frameWidth, frameHeight, resolution);
    const width = grainSize(Math.ceil(frameWidth * resolution - 1e-6));
    const height = grainSize(Math.ceil(frameHeight * resolution - 1e-6));
    return { width: Math.min(pow2.width, width), height: Math.min(pow2.height, height) };
  };

  // 2. A bake that would ask for a huge multisample buffer is drawn without it.
  interface Request {
    width: number;
    height: number;
    resolution?: number;
    antialias?: boolean;
  }
  const holder = TexturePool as unknown as { getOptimalTexture: (options: Request) => Texture };
  const request = holder.getOptimalTexture.bind(TexturePool);
  holder.getOptimalTexture = (options: Request): Texture => {
    if (options && typeof options === 'object' && options.antialias) {
      const size = pool.getOptimalSize(options.width, options.height, options.resolution ?? 1);
      if (!mayMultisample(size.width, size.height)) {
        gpuMemoryStats.capped++;
        return request({ ...options, antialias: false });
      }
    }
    return request(options);
  };

  // 3. A cached container's bake: release the renderbuffers once its pass is finished.
  const pipe = RenderGroupPipe.prototype as unknown as {
    _executeCacheAsTexture?: (this: unknown, group: { textureNeedsUpdate: boolean; texture: Texture | null }) => void;
  };
  const bake = pipe._executeCacheAsTexture;
  if (bake) {
    pipe._executeCacheAsTexture = function (this: unknown, group): void {
      const draws = group.textureNeedsUpdate;
      bake.call(this, group);
      const renderer = getRenderer();
      if (draws && group.texture && renderer) releaseMultisample(renderer, group.texture);
    };
  }

  // 4. `generateTexture`: the same, for the textures the game keeps (painted bars, sheets, drawn art).
  const generator = GenerateTextureSystem.prototype as unknown as {
    generateTexture: (this: { _renderer: Renderer }, options: unknown) => Texture;
  };
  const generate = generator.generateTexture;
  generator.generateTexture = function (this: { _renderer: Renderer }, options: unknown): Texture {
    const texture = generate.call(this, options);
    releaseMultisample(this._renderer, texture);
    return texture;
  };
}

/**
 * Let go of the pooled textures that no cache holds (the caches of the scene that has just been destroyed returned theirs): a pool keeps
 * them for good, and each scene change would otherwise add its own sizes to the ones before.
 */
export function trimBakePool(): void {
  const buckets = (TexturePool as unknown as { _buckets?: Map<unknown, unknown[]> })._buckets;
  let idle = 0;
  if (buckets) for (const list of buckets.values()) idle += list.length;
  TexturePool.clear(true);
  gpuMemoryStats.trimmed += idle;
}

let trimTimer: ReturnType<typeof setTimeout> | null = null;
/** How long after a screen closes the pool is trimmed (ms): long enough for the next screen of a chain to take back what it can use. */
export const TRIM_DELAY_MS = 400;

/** Trim the pool a moment from now (once, however often it is asked): what a popup or a screen that has just closed left idle in it. */
export function trimBakePoolSoon(): void {
  if (trimTimer !== null) return;
  trimTimer = setTimeout(() => {
    trimTimer = null;
    trimBakePool();
  }, TRIM_DELAY_MS);
}
