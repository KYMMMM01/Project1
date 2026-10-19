/**
 * Sample layers. The game's sounds are synthesised; a few recipes (the skills' signatures: the clash of two blades, the glass, the lid
 * of a capsule) lay a short real recording UNDER their synthesis. Only the CC0 packs by Kenney are ever used and every file that ships is
 * listed in `docs/licenses/sounds.md`, which a test holds against `src/assets/sfx/`.
 *
 * A sample is a layer, never a sound of its own: it is mixed inside the offline bake of its recipe (`Synth.sample`), so it is normalised,
 * varied, limited and counted by the bank exactly like the synthesis around it. A file that has not loaded (or never will: no network, a
 * browser that cannot fetch) leaves the recipe with its synthesis, which is a complete sound on its own.
 *
 * The files are 16-bit mono 44.1 kHz WAV on purpose (docs/licenses/sounds.md, "How the files are converted"): every browser reads PCM,
 * iOS Safari cannot be relied on for Ogg, and a compressed format would add a start delay that smears the first millisecond of a "chiing".
 * They are read here by hand (a RIFF walk) and not through `decodeAudioData`, so the same bytes give the same samples on every device, in
 * the offline bake and in the tests, with no resampling before the bake.
 */

/** A decoded sample: mono floats in -1..1 and the rate they were recorded at. */
export interface Pcm {
  data: Float32Array;
  rate: number;
}

/** Id of a sample: `<pack>/<file name without extension>`, the same key the sound board's candidate list uses. */
export type SampleId = string;

/** Read a 16-bit PCM WAV (any channel count, mixed to mono). Null for anything else: the caller treats the sample as missing. */
export function parseWav(buf: ArrayBuffer): Pcm | null {
  const v = new DataView(buf);
  if (buf.byteLength < 44 || v.getUint32(0, false) !== 0x52494646 || v.getUint32(8, false) !== 0x57415645) return null;
  let rate = 0;
  let channels = 0;
  let bits = 0;
  let format = 0;
  let pos = 12;
  while (pos + 8 <= buf.byteLength) {
    const tag = v.getUint32(pos, false);
    const size = v.getUint32(pos + 4, true);
    const body = pos + 8;
    if (tag === 0x666d7420) {
      // "fmt "
      format = v.getUint16(body, true);
      channels = v.getUint16(body + 2, true);
      rate = v.getUint32(body + 4, true);
      bits = v.getUint16(body + 14, true);
    } else if (tag === 0x64617461) {
      // "data"
      if (format !== 1 || bits !== 16 || channels < 1 || rate < 8000 || rate > 96000) return null;
      const frames = Math.floor(Math.min(size, buf.byteLength - body) / (2 * channels));
      if (frames < 1) return null;
      const data = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) sum += v.getInt16(body + (i * channels + c) * 2, true);
        data[i] = sum / channels / 32768;
      }
      return { data, rate };
    }
    pos = body + size + (size & 1);
  }
  return null;
}

/** How long a bake waits for a file before it goes on with the synthesis alone. */
const SETTLE_TIMEOUT_MS = 6000;

type Fetcher = (url: string) => Promise<ArrayBuffer>;

const defaultFetch: Fetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.arrayBuffer();
};

export class SampleStore {
  private readonly pcm = new Map<SampleId, Pcm>();
  private readonly flying = new Map<SampleId, Promise<void>>();
  private readonly failed = new Set<SampleId>();
  /** Bytes of the files read so far (what the debug stats show). */
  bytes = 0;

  constructor(
    private readonly urls: ReadonlyMap<SampleId, string>,
    private readonly fetcher: Fetcher = defaultFetch,
  ) {}

  /** Every sample the build carries. */
  get ids(): SampleId[] {
    return [...this.urls.keys()];
  }

  /** Whether the build carries this sample at all (loaded or not). */
  known(id: SampleId): boolean {
    return this.urls.has(id);
  }

  /** The decoded sample, or undefined while it has not loaded (or never will). */
  get(id: SampleId): Pcm | undefined {
    return this.pcm.get(id);
  }

  hasFailed(id: SampleId): boolean {
    return this.failed.has(id);
  }

  get loaded(): number {
    return this.pcm.size;
  }

  /** Start reading a sample (once). Resolves when it is loaded or has failed; never rejects. */
  load(id: SampleId): Promise<void> {
    if (this.pcm.has(id) || this.failed.has(id)) return Promise.resolve();
    const have = this.flying.get(id);
    if (have) return have;
    const url = this.urls.get(id);
    if (url === undefined) {
      this.failed.add(id);
      return Promise.resolve();
    }
    let run: Promise<void>;
    try {
      run = this.fetcher(url).then((bytes) => {
        const decoded = parseWav(bytes);
        if (decoded) {
          this.pcm.set(id, decoded);
          this.bytes += bytes.byteLength;
        } else this.failed.add(id);
      });
    } catch {
      run = Promise.reject(new Error('fetch refused'));
    }
    const settled = run
      .catch(() => {
        this.failed.add(id);
      })
      .then(() => {
        this.flying.delete(id);
      });
    this.flying.set(id, settled);
    return settled;
  }

  /** Read every sample the build carries (the engine calls it once the context runs). */
  preload(): Promise<void> {
    return Promise.all(this.ids.map((id) => this.load(id))).then(() => undefined);
  }

  /**
   * Resolves once each of these is loaded or has failed, starting the reading of any that has not begun; a file that takes longer than
   * a few seconds is given up on for this wait (the bake goes on without it). Used before a recipe that `needs` samples is baked.
   */
  settled(ids: readonly SampleId[]): Promise<void> {
    const all = Promise.all(ids.map((id) => this.load(id))).then(() => undefined);
    if (ids.every((id) => this.pcm.has(id) || this.failed.has(id))) return all;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, SETTLE_TIMEOUT_MS);
    });
    return Promise.race([all, timeout]).finally(() => clearTimeout(timer));
  }
}

/** `/src/assets/sfx/impact-sounds/impactMetal_light_000.wav` to `impact-sounds/impactMetal_light_000`. */
export function sampleIdOf(path: string): SampleId {
  const rel = path.slice(path.indexOf('/sfx/') + 5);
  return rel.slice(0, rel.length - 4);
}

const files = import.meta.glob('/src/assets/sfx/**/*.wav', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** The sample files of this build, by id. */
export const SAMPLE_URLS: ReadonlyMap<SampleId, string> = new Map(Object.entries(files).map(([path, url]): [SampleId, string] => [sampleIdOf(path), url]));

/** The game's store: shared by every context, loaded once. */
export const sampleStore = new SampleStore(SAMPLE_URLS);
