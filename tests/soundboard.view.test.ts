import { afterEach, describe, expect, it } from 'vitest';
import { GAME_SFX_IDS } from '@/audio/api';
import { MUSIC_ROWS, ROWS, SECTIONS, STINGER_ROWS } from '@/soundboard/catalog';
import { mountBoard, type BoardDeps, type BoardHandle } from '@/soundboard/view';
import type { Manifest } from '@/soundboard/types';
import { FakeDocument, FakeElement } from './soundboard-fakeDom';
import { FakeAudio, FakeSamples, FakeTimers, settle } from './soundboard-fakes';

const MANIFEST: Manifest = {
  made: '2026-10-18',
  codec: 'PCM 16-bit mono 44100 Hz WAV',
  files: [
    { pack: 'impact-sounds', name: 'impactMetal_heavy_000', file: 'impact-sounds/impactMetal_heavy_000.wav', bytes: 15000, ms: 170, peak: 0.9, loud: 0.09, hz: 3000 },
    { pack: 'impact-sounds', name: 'impactMetal_heavy_001', file: 'impact-sounds/impactMetal_heavy_001.wav', bytes: 30000, ms: 360, peak: 0.88, loud: 0.088, hz: 2800 },
    { pack: 'impact-sounds', name: 'impactWood_light_000', file: 'impact-sounds/impactWood_light_000.wav', bytes: 9000, ms: 100, peak: 0.5, loud: 0.04, hz: 1500 },
    { pack: 'rpg-audio', name: 'drawKnife1', file: 'rpg-audio/drawKnife1.wav', bytes: 40000, ms: 450, peak: 0.7, loud: 0.05, hz: 4000 },
    { pack: 'interface-sounds', name: 'click_001', file: 'interface-sounds/click_001.wav', bytes: 4000, ms: 40, peak: 0.6, loud: 0.07, hz: 5000 },
  ],
};

interface Rig {
  doc: FakeDocument;
  root: FakeElement;
  audio: FakeAudio;
  samples: FakeSamples;
  timers: FakeTimers;
  handle: BoardHandle;
  page: FakeElement;
  manifestCalls: number;
  store: Map<string, string>;
}

const rigs: Rig[] = [];
afterEach(() => {
  for (const r of rigs.splice(0)) r.handle.destroy();
});

function mount(overrides: Partial<BoardDeps> = {}): Rig {
  const doc = new FakeDocument();
  const audio = new FakeAudio();
  const samples = new FakeSamples();
  const timers = new FakeTimers();
  const store = new Map<string, string>();
  const rig = { manifestCalls: 0, store } as Rig;
  const handle = mountBoard(doc.body as unknown as HTMLElement, {
    doc: doc as unknown as Document,
    audio,
    samples,
    timers,
    base: doc.baseURI,
    manifest: () => {
      rig.manifestCalls++;
      return Promise.resolve(MANIFEST);
    },
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
    random: () => 0.5,
    ...overrides,
  });
  Object.assign(rig, { doc, root: doc.body, audio, samples, timers, handle, page: handle.root as unknown as FakeElement });
  rigs.push(rig);
  return rig;
}

/** Tap the gate and let the engine report that it is running. */
async function unlock(r: Rig): Promise<void> {
  r.page.one({ 'data-act': 'unlock' }).click();
  r.audio.unlocked = true;
  r.timers.advance(200);
  await settle();
}

const rowEl = (r: Rig, key: string): FakeElement => r.page.one({ 'data-row': key });
const btn = (r: Rig, key: string, act: string): FakeElement => rowEl(r, key).one({ 'data-act': act });

describe('sound board page: nothing plays by itself', () => {
  it('mounting, switching tabs, opening sections and the candidate list make no sound and load no sample', async () => {
    const r = mount();
    r.handle.tab('music');
    r.handle.tab('cand');
    await settle();
    r.handle.tab('sfx');
    for (const head of r.page.where({ class: 'sb-sec-head' })) head.click();
    for (const chip of r.page.where({ class: 'sb-chip' })) chip.click();
    r.page.one({ 'data-intensity': '1' }).click();
    r.timers.advance(10_000);
    await settle();
    expect(r.audio.sounding()).toEqual([]);
    expect(r.audio.calls('ready')).toEqual([]);
    expect(r.samples.calls('play')).toEqual([]);
    expect(r.samples.calls('load')).toEqual([]);
  });

  it('the engine is created silent and suspended at once, the samples’ context only inside the tap on the gate', async () => {
    const r = mount();
    expect(r.audio.calls('init')).toHaveLength(1);
    expect(r.samples.calls('unlock')).toHaveLength(0);
    const gate = r.page.one({ class: 'sb-gate', role: 'dialog', 'aria-label': '소리 켜기' });
    expect(gate.hasClass('hide')).toBe(false);
    r.page.one({ 'data-act': 'unlock' }).click();
    expect(r.samples.calls('unlock')).toHaveLength(1);
    expect(r.audio.calls('setVolume').length).toBeGreaterThan(0);
    // the gate stays until the engine says it runs
    r.timers.advance(300);
    expect(gate.hasClass('hide')).toBe(false);
    r.audio.unlocked = true;
    r.timers.advance(150);
    expect(gate.hasClass('hide')).toBe(true);
    expect(r.audio.sounding()).toEqual([]);
  });

  it('says what to do when the browser does not let audio start', async () => {
    const r = mount();
    r.page.one({ 'data-act': 'unlock' }).click();
    r.timers.advance(5000);
    const gate = r.page.one({ class: 'sb-gate', role: 'dialog', 'aria-label': '소리 켜기' });
    expect(gate.hasClass('hide')).toBe(false);
    expect(gate.textContent).toContain('한 번 더 눌러');
  });

  it('wakes the engine and the sample player on every tap while either sleeps, so a phone that suspended one can play again', async () => {
    const r = mount();
    const tap = (): void => {
      for (const fn of r.page.listeners.get('click') ?? []) fn({ type: 'click', target: r.page });
    };
    // before the first tap neither is running: the tap wakes the engine inside the gesture (a touch screen's pointerdown is not one)
    tap();
    expect(r.audio.calls('wake')).toHaveLength(1);
    expect(r.samples.calls('unlock')).toHaveLength(1);
    await unlock(r);
    r.audio.log.length = 0;
    r.samples.log.length = 0;
    // both run: a tap leaves them alone
    tap();
    expect(r.audio.calls('wake')).toHaveLength(0);
    expect(r.samples.calls('unlock')).toHaveLength(0);
    // the phone suspends them again
    r.audio.unlocked = false;
    r.samples.unlocked = false;
    tap();
    expect(r.audio.calls('wake')).toHaveLength(1);
    expect(r.samples.calls('unlock')).toHaveLength(1);
  });
});

describe('sound board page: every sound is on it', () => {
  it('has a row with a play button and a "x5" button for every SFX id', () => {
    const r = mount();
    for (const id of GAME_SFX_IDS) {
      const row = rowEl(r, id);
      // (a row that has an old and a new version says "지금" and "새것" instead of "재생")
      expect(['재생', '지금'].some((w) => row.one({ 'data-act': 'now' }).textContent.includes(w))).toBe(true);
      expect(row.one({ 'data-act': 'x5-now' }).textContent).toContain('×5');
      expect(row.textContent).toContain(id);
    }
  });

  it('shows the sections of the catalog in order, each with its rows, and a chip to jump to it', () => {
    const r = mount();
    const heads = r.page.where({ class: 'sb-sec-head' }).filter((h) => h.getAttribute('data-sec'));
    expect(heads.map((h) => h.getAttribute('data-sec'))).toEqual(SECTIONS.map((s) => s.id));
    expect(r.page.where({ class: 'sb-chip' }).filter((c) => c.getAttribute('data-chip'))).toHaveLength(SECTIONS.length);
    const rows = r.page.all().filter((e) => e.tagName === 'article' && ROWS.some((x) => x.key === e.getAttribute('data-row')));
    expect(rows).toHaveLength(ROWS.length);
  });

  it('lists the music tracks and the stingers', () => {
    const r = mount();
    for (const m of MUSIC_ROWS) r.page.one({ 'data-act': 'music', 'data-key': m.id });
    for (const s of STINGER_ROWS) r.page.one({ 'data-act': 'stinger', 'data-key': s.id });
  });

  it('opens with a short note in Korean on how to use it, and three tabs', () => {
    const r = mount();
    expect(r.page.textContent).toContain('쓰는 법');
    expect(r.page.textContent).toContain('지금');
    expect(r.page.where({ role: 'tab' }).map((t) => t.textContent)).toEqual(['효과음', '음악', '후보 (CC0)']);
  });
});

describe('sound board page: buttons play through the engine', () => {
  it('the play button plays the row’s sound once, as the game plays it', async () => {
    const r = mount();
    await unlock(r);
    btn(r, 'hit_light', 'now').click();
    await settle();
    const plays = r.audio.calls('play');
    expect(plays).toHaveLength(1);
    expect(plays[0]?.args).toEqual(['hit_light', { volume: 0.6, pitch: 1, delay: 0 }]);
  });

  it('on a row of the hit pass, "지금" plays the old recipe and "새것" what the game plays now, at the same level and pitch', async () => {
    const r = mount();
    await unlock(r);
    btn(r, 'hit_heavy', 'now').click();
    await settle();
    r.timers.advance(2000);
    btn(r, 'hit_heavy', 'new').click();
    await settle();
    const plays = r.audio.calls('play');
    expect(plays.map((p) => p.args[0])).toEqual(['old_hit_heavy', 'hit_heavy']);
    expect(plays[0]?.args[1]).toEqual(plays[1]?.args[1]);
    expect(plays[1]?.args[1]).toEqual({ volume: 0.8, pitch: 1, delay: 0 });
  });

  it('the "x5" button plays it five times, the director’s gap apart', async () => {
    const r = mount();
    await unlock(r);
    btn(r, 'hit_heavy', 'x5-now').click();
    await settle();
    const delays = r.audio.calls('play').map((p) => (p.args[1] as { delay: number }).delay);
    expect(delays).toHaveLength(5);
    expect(delays[4]).toBeCloseTo(4 * 0.14, 6);
  });

  it('a cat’s shot plays the release, then the landing and the enemy’s answer (what the game plays: "새것"), and the old versions of the three on "지금"', async () => {
    const r = mount();
    await unlock(r);
    btn(r, 'pair:w_sword', 'new').click();
    await settle();
    expect(r.audio.calls('play').map((p) => p.args[0])).toEqual(['atk_w_sword', 'imp_w_sword', 'foe_juicy_hit']);
    r.timers.advance(2000);
    btn(r, 'pair:w_sword', 'now').click();
    await settle();
    expect(r.audio.calls('play').slice(3).map((p) => p.args[0])).toEqual(['old_atk_w_sword', 'old_imp_w_sword', 'old_foe_juicy_hit']);
  });

  it('lights the button while the sound lasts and lets it go after', async () => {
    const r = mount();
    await unlock(r);
    const b = btn(r, 'hit_heavy', 'now');
    b.click();
    await settle();
    expect(b.hasClass('on')).toBe(true);
    r.timers.advance(2000);
    expect(b.hasClass('on')).toBe(false);
  });

  it('a stinger button plays the stinger', async () => {
    const r = mount();
    await unlock(r);
    r.page.one({ 'data-act': 'stinger', 'data-key': 'victory' }).click();
    await settle();
    expect(r.audio.calls('stinger').map((s) => s.args[0])).toEqual(['victory']);
  });

  it('a music button starts the track at the chosen intensity, and a second tap fades it out', async () => {
    const r = mount();
    await unlock(r);
    r.page.one({ 'data-intensity': '1' }).click();
    const b = r.page.one({ 'data-act': 'music', 'data-key': 'battle' });
    b.click();
    expect(r.audio.calls('music').map((m) => m.args[0])).toEqual(['battle']);
    expect(r.audio.calls('setIntensity').pop()?.args[0]).toBe(1);
    expect(b.textContent).toContain('멈춤');
    b.click();
    expect(r.audio.calls('music').map((m) => m.args[0])).toEqual(['battle', 'none']);
    expect(b.textContent).toContain('재생');
  });

  it('starting another track moves the "playing" mark to it', async () => {
    const r = mount();
    await unlock(r);
    r.page.one({ 'data-act': 'music', 'data-key': 'home' }).click();
    r.page.one({ 'data-act': 'music', 'data-key': 'boss' }).click();
    expect(rowEl(r, 'music:home').hasClass('playing')).toBe(false);
    expect(rowEl(r, 'music:boss').hasClass('playing')).toBe(true);
  });

  it('"모두 멈춤" stops everything: sounds, samples, the music and the lit buttons', async () => {
    const r = mount();
    await unlock(r);
    r.page.one({ 'data-act': 'music', 'data-key': 'battle' }).click();
    const b = btn(r, 'hit_heavy', 'now');
    b.click();
    await settle();
    r.page.one({ 'data-act': 'stop' }).click();
    expect(r.audio.calls('stopAll')).toHaveLength(1);
    expect(r.samples.calls('stopAll')).toHaveLength(1);
    expect(b.hasClass('on')).toBe(false);
    expect(rowEl(r, 'music:battle').hasClass('playing')).toBe(false);
  });

  it('the volume slider sets the level of the engine and of the samples', async () => {
    const r = mount();
    await unlock(r);
    const slider = r.page.one({ id: 'sb-volume' });
    slider.value = '30';
    slider.dispatch('input');
    expect(r.audio.calls('setVolume').pop()?.args[0]).toBeCloseTo(0.3, 6);
    expect(r.samples.calls('setVolume').pop()?.args[0]).toBeCloseTo(0.3, 6);
    slider.value = '250';
    slider.dispatch('input');
    expect(r.audio.calls('setVolume').pop()?.args[0]).toBe(1);
  });

  it('a page that goes to the background stops the sound', async () => {
    const r = mount();
    await unlock(r);
    r.doc.hidden = true;
    r.doc.fire('visibilitychange');
    expect(r.audio.calls('stopAll')).toHaveLength(1);
    r.doc.hidden = false;
    r.doc.fire('visibilitychange');
    expect(r.audio.calls('stopAll')).toHaveLength(1);
  });

  it('a press whose sound is still being baked looks "waiting" after a moment, and goes back to normal when it sounds', async () => {
    const r = mount();
    await unlock(r);
    let release: () => void = () => undefined;
    r.audio.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const b = btn(r, 'hit_heavy', 'now');
    b.click();
    await settle();
    expect(b.hasClass('wait')).toBe(false);
    r.timers.advance(400);
    expect(b.hasClass('wait')).toBe(true);
    expect(r.audio.calls('play')).toHaveLength(0);
    release();
    await settle();
    expect(b.hasClass('wait')).toBe(false);
    expect(r.audio.calls('play')).toHaveLength(1);
    expect(b.hasClass('on')).toBe(true);
  });

  it('"모두 멈춤" also ends a waiting look', async () => {
    const r = mount();
    await unlock(r);
    r.audio.hold = new Promise<void>(() => undefined);
    const b = btn(r, 'hit_heavy', 'now');
    b.click();
    await settle();
    r.timers.advance(400);
    expect(b.hasClass('wait')).toBe(true);
    r.page.one({ 'data-act': 'stop' }).click();
    expect(b.hasClass('wait')).toBe(false);
  });

  it('a failing play shows a message and does not throw', async () => {
    const r = mount();
    await unlock(r);
    r.audio.play = () => {
      throw new Error('boom');
    };
    btn(r, 'ui_click', 'now').click();
    await settle();
    expect(r.page.textContent).toContain('소리를 내지 못했어요');
  });
});

describe('sound board page: before / after', () => {
  it('a row has only "재생" until a new version is set', () => {
    const r = mount();
    expect(rowEl(r, 'ui_click').where({ 'data-act': 'new' })).toEqual([]);
    expect(rowEl(r, 'ui_click').where({ 'data-act': 'both' })).toEqual([]);
  });

  it('shows "지금" and "새것" side by side, each playable alone and stacked, and both in turn', async () => {
    const r = mount();
    await unlock(r);
    r.handle.setNew('ui_click', [{ sfx: 'ui_confirm' }]);
    const row = rowEl(r, 'ui_click');
    expect(row.textContent).toContain('새것 있음');
    expect(btn(r, 'ui_click', 'now').textContent).toContain('지금');
    expect(btn(r, 'ui_click', 'new').textContent).toContain('새것');

    btn(r, 'ui_click', 'now').click();
    await settle();
    expect(r.audio.calls('play').map((p) => p.args[0])).toEqual(['ui_click']);

    r.audio.log.length = 0;
    btn(r, 'ui_click', 'new').click();
    await settle();
    expect(r.audio.calls('play').map((p) => p.args[0])).toEqual(['ui_confirm']);

    r.audio.log.length = 0;
    btn(r, 'ui_click', 'x5-new').click();
    await settle();
    expect(r.audio.calls('play').map((p) => p.args[0])).toEqual(Array(5).fill('ui_confirm'));

    r.audio.log.length = 0;
    btn(r, 'ui_click', 'both').click();
    await settle();
    expect(r.audio.calls('play').map((p) => p.args[0])).toEqual(['ui_click', 'ui_confirm']);
  });

  it('a new version can be a sample of the free packs, and can be taken away again', async () => {
    const r = mount();
    await unlock(r);
    r.handle.setNew('skill:cut', [{ sfx: 'atk_w_samurai' }, { file: 'impact-sounds/impactMetal_heavy_001', at: 0.05 }]);
    btn(r, 'skill:cut', 'new').click();
    await settle();
    expect(r.audio.calls('play').map((p) => p.args[0])).toEqual(['atk_w_samurai']);
    expect(r.samples.calls('play').map((p) => p.args[0])).toEqual(['impact-sounds/impactMetal_heavy_001']);
    r.handle.setNew('skill:cut', null);
    expect(rowEl(r, 'skill:cut').where({ 'data-act': 'new' })).toEqual([]);
  });
});

describe('sound board page: the candidates tab (CC0 files)', () => {
  it('reads the list only when the tab is opened, then shows the packs and their groups', async () => {
    const r = mount();
    expect(r.manifestCalls).toBe(0);
    r.page.one({ 'data-tab': 'cand' }).click();
    await settle();
    expect(r.manifestCalls).toBe(1);
    r.page.one({ 'data-tab': 'sfx' }).click();
    r.page.one({ 'data-tab': 'cand' }).click();
    await settle();
    expect(r.manifestCalls).toBe(1);
    expect(r.page.where({ 'data-pack': 'impact-sounds' })).toHaveLength(1);
    expect(r.page.where({ 'data-pack': 'rpg-audio' })).toHaveLength(1);
    expect(r.page.where({ 'data-pack': 'interface-sounds' })).toHaveLength(1);
    expect(r.page.textContent).toContain('금속 · 무거운 타격 (챙)');
    expect(r.samples.calls('load')).toEqual([]);
  });

  it('hands the manifest to the sample player so it can find the files', async () => {
    const seen: Manifest[] = [];
    const r = mount({ onManifest: (m) => seen.push(m) });
    r.handle.tab('cand');
    await settle();
    expect(seen).toEqual([MANIFEST]);
  });

  it('a group opens to its files; the play button plays one, "x5" stacks it, and the file name is shown', async () => {
    const r = mount();
    await unlock(r);
    r.handle.tab('cand');
    await settle();
    r.page.one({ 'data-group': 'impactMetal_heavy' }).click();
    const key = 'impact-sounds/impactMetal_heavy_001';
    expect(rowEl(r, key).textContent).toContain('impactMetal_heavy_001');
    rowEl(r, key).one({ 'data-act': 'cand' }).click();
    await settle();
    expect(r.samples.calls('play').map((p) => p.args[0])).toEqual([key]);
    rowEl(r, key).one({ 'data-act': 'cand-x5' }).click();
    await settle();
    expect(r.samples.calls('play')).toHaveLength(6);
    expect(r.audio.sounding()).toEqual([]);
  });

  it('a star keeps a pick, lists it at the top and remembers it for the next visit', async () => {
    const r = mount();
    r.handle.tab('cand');
    await settle();
    r.page.one({ 'data-group': 'impactMetal_heavy' }).click();
    const key = 'impact-sounds/impactMetal_heavy_000';
    rowEl(r, key).one({ 'data-act': 'pick' }).click();
    expect(r.page.textContent).toContain('내가 고른 소리 1개');
    expect(JSON.parse(r.store.get('meowguard.soundboard.picks') ?? '[]')).toEqual([key]);
    const next = mount({ storage: { getItem: (k) => r.store.get(k) ?? null, setItem: (k, v) => void r.store.set(k, v) } });
    expect(next.page.textContent).toContain('내가 고른 소리 1개');
    rowEl(r, key).one({ 'data-act': 'pick' }).click();
    expect(r.page.textContent).not.toContain('내가 고른 소리 1개');
  });

  it('works when storage is blocked', async () => {
    const r = mount({
      storage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    r.handle.tab('cand');
    await settle();
    r.page.one({ 'data-group': 'impactMetal_heavy' }).click();
    rowEl(r, 'impact-sounds/impactMetal_heavy_000').one({ 'data-act': 'pick' }).click();
    expect(r.page.textContent).toContain('내가 고른 소리 1개');
  });

  it('says so when the list cannot be read', async () => {
    const r = mount({ manifest: () => Promise.reject(new Error('offline')) });
    r.handle.tab('cand');
    await settle();
    expect(r.page.textContent).toContain('후보 목록을 못 불러왔어요');
  });

  it('the "match the game’s loudness" switch is on by default and can be turned off', async () => {
    const r = mount();
    r.handle.tab('cand');
    await settle();
    const opt = r.page.one({ 'data-opt': 'match' });
    expect(opt.getAttribute('aria-pressed')).toBe('true');
    opt.click();
    expect(r.samples.calls('setMatch').pop()?.args[0]).toBe(false);
  });
});
