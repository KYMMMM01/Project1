import { Assets, Texture } from 'pixi.js';

/**
 * Every image under src/assets/img is picked up automatically; its key is the file name without
 * extension (`unit_knight.webp` -> "unit_knight"). Dropping a file in is all the art pipeline has
 * to do — no manifest to keep in sync.
 *
 * Two loads: `loadImages` (boot) brings in everything the menus draw; the battle-only effect sprites (`fx_*`: shots, bursts, bolts, capsule
 * shells, the clouds, clones, cuts and meteors, a fifth of the bytes) wait for `loadBattleImages`, which the app starts once the first scene
 * is up and which every route into a battle awaits before the scene is built (its constructors read these textures).
 */
const urls = import.meta.glob('../assets/img/**/*.{png,webp,jpg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const registry = new Map<string, string>();
for (const path of Object.keys(urls)) {
  const file = path.slice(path.lastIndexOf('/') + 1);
  const key = file.slice(0, file.lastIndexOf('.'));
  if (registry.has(key)) console.warn(`[assets] duplicate image key "${key}" (${path})`);
  registry.set(key, urls[path] as string);
}

const textures = new Map<string, Texture>();
const missing = new Set<string>();

export function hasImage(key: string): boolean {
  return registry.has(key);
}

export function imageKeys(): string[] {
  return [...registry.keys()];
}

/** Images only a battle draws: the painted effect sprites. */
const isBattleImage = (key: string): boolean => key.startsWith('fx_');

async function loadEntries(entries: Array<[string, string]>, onProgress?: (p: number) => void): Promise<void> {
  let done = 0;
  const total = Math.max(1, entries.length);
  const CONCURRENCY = 8;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < entries.length) {
      const [key, url] = entries[next++] as [string, string];
      try {
        const tex = await Assets.load<Texture>(url);
        textures.set(key, tex);
      } catch (err) {
        console.warn(`[assets] failed to load "${key}"`, err);
      }
      done++;
      onProgress?.(done / total);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker));
  onProgress?.(1);
}

/** Load every registered image the menus draw. Individual failures are logged and skipped, never fatal. */
export function loadImages(onProgress?: (p: number) => void): Promise<void> {
  return loadEntries([...registry].filter(([key]) => !isBattleImage(key)), onProgress);
}

let battleLoad: Promise<void> | null = null;
/** A battle waits this long at most: a request a slow network never answers must not hold the run that was just paid for. */
const BATTLE_LOAD_CAP_MS = 8000;

/**
 * Load the battle-only images, once: every call shares the same load, so a battle entered while they are still coming simply waits for them,
 * up to BATTLE_LOAD_CAP_MS (then it opens with whatever arrived and the rest keeps loading for the next one).
 */
export function loadBattleImages(): Promise<void> {
  battleLoad ??= loadEntries([...registry].filter(([key]) => isBattleImage(key)));
  return Promise.race([battleLoad, new Promise<void>((done) => setTimeout(done, BATTLE_LOAD_CAP_MS))]);
}

/**
 * Texture by key. A key with no image returns Texture.EMPTY (and warns once) so a missing asset
 * shows as a gap instead of crashing the scene.
 */
export function tex(key: string): Texture {
  const t = textures.get(key);
  if (t) return t;
  if (!missing.has(key)) {
    missing.add(key);
    console.warn(`[assets] missing texture "${key}"`);
  }
  return Texture.EMPTY;
}

export function hasTex(key: string): boolean {
  return textures.has(key);
}

/** Register a runtime-generated texture (procedural particles, UI shapes) under a key. */
export function putTex(key: string, texture: Texture): void {
  textures.set(key, texture);
}
