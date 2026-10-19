/**
 * The sound board page. Three tabs under a sticky bar (volume, stop all): "효과음" (every SFX id of the game, grouped by where it is heard),
 * "음악" (the tracks and stingers) and "후보 (CC0)" (the free samples a later step may use). Nothing plays until a tap: the page opens with a
 * gate whose one button lets the browser start audio (iOS needs it), and every sound afterwards starts from a button.
 */
import type { MusicId, StingerId } from '@/audio/api';
import { candidateKey, candidateUrl, db, groupManifest, loadManifest, type PackView } from './candidates';
import { MUSIC_ROWS, ROWS, SECTIONS, STINGER_ROWS, type Cue, type Row, type Section } from './catalog';
import { fill, h, hasClass, setClass, type Child } from './dom';
import { NEW_VERSIONS, OLD_VERSIONS } from './next';
import { Player } from './player';
import { injectStyle } from './style';
import { matchGain, type BoardAudio, type Candidate, type Manifest, type SampleBackend, type Timers } from './types';

export type TabId = 'sfx' | 'music' | 'cand';

export interface BoardDeps {
  doc: Document;
  audio: BoardAudio;
  samples: SampleBackend;
  timers: Timers;
  /** The page's base address, for the candidate files. */
  base: string;
  /** Reads the candidate manifest; rejects when it is not there. */
  manifest(): Promise<Manifest>;
  /** Called with the manifest once it is loaded, so the sample player can find the files. */
  onManifest?(m: Manifest): void;
  /** Favourite picks survive a reload when this is given. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  random?: () => number;
}

export interface BoardHandle {
  readonly root: HTMLElement;
  /** Show another version beside a row ("새것"), or none (null). The same as an entry of `next.ts`, for a try-out. */
  setNew(key: string, cues: readonly Cue[] | null): void;
  tab(id: TabId): void;
  destroy(): void;
}

const PICKS_KEY = 'meowguard.soundboard.picks';
/** The slider starts where the game's sound volume starts (`SFX_DEFAULT`); the music follows it at the game's own ratio. */
const DEFAULT_VOLUME = 0.8;
const MUSIC_FADE = 0.4;
/** A press that has not sounded after this long shows the "waiting" look. */
const WAIT_SHOWN_MS = 350;

const HOW_TO: readonly string[] = [
  '맨 처음에 "소리 켜기"를 한 번 눌러 주세요. 아이폰은 한 번 눌러야 소리가 나요. 무음 스위치는 꺼 주세요.',
  '위의 탭: "효과음"은 게임의 소리 전부, "음악"은 곡과 팡파르, "후보"는 무료 소리 파일 후보예요.',
  '큰 재생 버튼은 게임이 내는 그대로 한 번 들려줘요.',
  '"×5 · 3배속"은 3배속 전투에서 소리가 바쁘게 쌓일 때처럼 다섯 번을 이어서 들려줘요.',
  '"지금"과 "새것"이 같이 있는 줄은 바꾸기 전과 후를 비교하는 줄이에요. "지금, 새것 이어서"를 누르면 차례로 들려줘요.',
  '시끄러우면 "모두 멈춤". 이 페이지는 게임 저장 데이터를 건드리지 않아요.',
];

export function mountBoard(root: HTMLElement, deps: BoardDeps): BoardHandle {
  const { doc, audio, samples, timers } = deps;
  injectStyle(doc);
  const player = new Player(audio, samples, timers, deps.random);

  const versionsNew = new Map<string, readonly Cue[]>(Object.entries(NEW_VERSIONS));
  const glows = new Map<Element, unknown>();
  /** Buttons whose press is still waiting for its sound to be baked. */
  const waiting = new Set<Element>();
  let tab: TabId = 'sfx';
  let musicNow: MusicId | null = null;
  let intensity = 0.5;
  let matchOn = true;
  let volume = DEFAULT_VOLUME;
  let manifest: Manifest | null = null;
  let packs: PackView[] = [];
  let pack = '';
  let manifestState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  const picks = readPicks(deps.storage);

  // ───── small helpers ─────

  const say = (text: string): void => {
    fill(statusEl, text);
    setClass(statusEl, 'hide', text === '');
  };

  /**
   * Run an async play; light the button for as long as the sound lasts; show a failure instead of throwing. A sound that is not baked yet (the first
   * seconds after the gate, while the engine renders everything once) makes the button look "waiting" so a slow press is not taken for a dead one.
   */
  const run = (button: Element, job: Promise<number>): void => {
    const slow = timers.set(() => {
      waiting.add(button);
      setClass(button, 'wait', true);
    }, WAIT_SHOWN_MS);
    const done = (): void => {
      timers.clear(slow);
      waiting.delete(button);
      setClass(button, 'wait', false);
    };
    job.then(
      (seconds) => {
        done();
        glow(button, seconds);
      },
      (err: unknown) => {
        done();
        say(`소리를 내지 못했어요: ${String((err as Error)?.message ?? err)}`);
      },
    );
  };

  const glow = (button: Element, seconds: number): void => {
    if (!(seconds > 0)) return;
    const old = glows.get(button);
    if (old !== undefined) timers.clear(old);
    setClass(button, 'on', true);
    glows.set(
      button,
      timers.set(() => {
        setClass(button, 'on', false);
        glows.delete(button);
      }, Math.min(seconds, 6) * 1000),
    );
  };

  const stopEverything = (): void => {
    player.stopAll();
    for (const [button, handle] of glows) {
      timers.clear(handle);
      setClass(button, 'on', false);
    }
    glows.clear();
    for (const b of waiting) setClass(b, 'wait', false);
    waiting.clear();
    setMusic(null);
  };

  const playIcon = (): HTMLElement => h(doc, 'span', { class: 'tri', 'aria-hidden': 'true' });
  const stopIcon = (): HTMLElement => h(doc, 'span', { class: 'sqr', 'aria-hidden': 'true' });
  const button = (cls: string, act: string, key: string, onClick: (b: HTMLElement) => void, ...children: Child[]): HTMLElement => {
    const b = h(doc, 'button', { type: 'button', class: `sb-btn ${cls}`, 'data-act': act, 'data-key': key }, ...children);
    b.addEventListener('click', () => onClick(b));
    return b;
  };

  // ───── the gate ─────

  const gateMsg = h(doc, 'p', { class: 'sb-msg' });
  const gate = h(
    doc,
    'div',
    { class: 'sb-gate', role: 'dialog', 'aria-label': '소리 켜기' },
    h(
      doc,
      'div',
      { class: 'sb-paper' },
      h(doc, 'h1', { text: '냥이 수비대 소리판' }),
      h(doc, 'p', { text: '게임의 효과음과 음악을 하나씩 들어 보는 페이지예요.' }),
      h(doc, 'p', { text: '아이폰은 소리를 켜려면 한 번 눌러야 해요. 무음 스위치도 꺼 주세요.' }),
      button('play', 'unlock', '', () => unlock(), playIcon(), '소리 켜기'),
      gateMsg,
    ),
  );

  let unlocking = false;
  const unlock = (): void => {
    // The tap itself unlocks the engine (its window listeners see this click); the sample player is made here, inside the tap.
    audio.init();
    samples.unlock();
    samples.setVolume(volume);
    audio.setVolume(volume);
    if (unlocking) return;
    unlocking = true;
    fill(gateMsg, '');
    let tries = 0;
    const check = (): void => {
      if (audio.unlocked) {
        unlocking = false;
        setClass(gate, 'hide', true);
        return;
      }
      if (++tries > 25) {
        unlocking = false;
        fill(gateMsg, '소리가 아직 안 켜졌어요. 한 번 더 눌러 보세요. 계속 안 되면 다른 브라우저로 열어 주세요.');
        return;
      }
      timers.set(check, 100);
    };
    check();
  };

  // ───── the sticky bar ─────

  const statusEl = h(doc, 'p', { class: 'sb-msg hide', role: 'status' });
  const tabButtons = new Map<TabId, HTMLElement>();
  const tabLabels: Array<[TabId, string]> = [
    ['sfx', '효과음'],
    ['music', '음악'],
    ['cand', '후보 (CC0)'],
  ];
  const tabs = h(doc, 'div', { class: 'sb-tabs', role: 'tablist' });
  for (const [id, label] of tabLabels) {
    const b = h(doc, 'button', { type: 'button', class: 'sb-tab', role: 'tab', 'aria-selected': id === tab ? 'true' : 'false', 'data-tab': id, text: label });
    b.addEventListener('click', () => showTab(id));
    tabButtons.set(id, b);
    tabs.appendChild(b);
  }

  const volLabel = h(doc, 'label', { text: '소리 크기', for: 'sb-volume' });
  const volume_ = h(doc, 'input', { id: 'sb-volume', type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(volume * 100)), 'aria-label': '소리 크기' });
  volume_.addEventListener('input', () => {
    volume = Math.min(1, Math.max(0, Number((volume_ as HTMLInputElement).value) / 100));
    audio.setVolume(volume);
    samples.setVolume(volume);
  });
  const stopBtn = button('stop-all', 'stop', '', () => stopEverything(), stopIcon(), '모두 멈춤');
  setClass(stopBtn, 'sb-stop', true);
  setClass(stopBtn, 'sb-btn', false);
  const top = h(doc, 'div', { class: 'sb-top' }, h(doc, 'div', { class: 'sb-wrap' }, tabs, h(doc, 'div', { class: 'sb-ctl' }, h(doc, 'div', { class: 'sb-vol' }, volLabel, volume_), stopBtn)));

  // ───── tab 1: every sound of the game ─────

  const slots = new Map<string, HTMLElement>();

  const rowFor = (row: Row): HTMLElement => {
    const slot = h(doc, 'div', { class: 'sb-slot' });
    slots.set(row.key, slot);
    renderRow(row, slot);
    return slot;
  };

  const renderRow = (row: Row, slot: HTMLElement): void => {
    const oldCues = OLD_VERSIONS[row.key] ?? row.now;
    const newCues = versionsNew.get(row.key);
    const ab = newCues !== undefined;
    const title = h(doc, 'h3', { text: row.ko });
    if (ab) title.appendChild(h(doc, 'span', { class: 'sb-badge', text: '새것 있음' }));
    const buttons = ab
      ? h(
          doc,
          'div',
          { class: 'sb-btns' },
          button('play', 'now', row.key, (b) => run(b, player.play(oldCues)), playIcon(), '지금'),
          button('new', 'new', row.key, (b) => run(b, player.play(newCues)), playIcon(), '새것'),
          button('x5', 'x5-now', row.key, (b) => run(b, player.stack(oldCues, row.gap, row.ladder)), '×5 · 3배속', h(doc, 'small', { text: '지금' })),
          button('x5', 'x5-new', row.key, (b) => run(b, player.stack(newCues, row.gap, row.ladder)), '×5 · 3배속', h(doc, 'small', { text: '새것' })),
          button('both', 'both', row.key, (b) => run(b, player.both(oldCues, newCues)), '지금, 새것 이어서 듣기'),
        )
      : h(
          doc,
          'div',
          { class: 'sb-btns plain' },
          button('play', 'now', row.key, (b) => run(b, player.play(oldCues)), playIcon(), '재생'),
          button('x5', 'x5-now', row.key, (b) => run(b, player.stack(oldCues, row.gap, row.ladder)), '×5', h(doc, 'small', { text: '3배속' })),
        );
    fill(
      slot,
      h(doc, 'article', { class: `sb-row sb-paper sec-${row.section}`, 'data-row': row.key }, title, h(doc, 'p', { text: row.when }), row.id ? h(doc, 'span', { class: 'sb-id', text: row.id }) : null, buttons),
    );
  };

  const sectionEl = (s: Section): HTMLElement => {
    const head = h(doc, 'button', { type: 'button', class: 'sb-sec-head', 'aria-expanded': 'true', 'data-sec': s.id }, h(doc, 'span', { text: s.ko }), h(doc, 'small', { text: `${s.rows.length}개` }), h(doc, 'span', { class: 'chev' }));
    const body = h(doc, 'div', { class: 'sb-sec-body' }, h(doc, 'p', { class: 'sb-hint', text: s.hint }), ...s.rows.map(rowFor));
    const sec = h(doc, 'section', { class: 'sb-sec', id: `sec-${s.id}` }, head, body);
    head.addEventListener('click', () => {
      const closed = !hasClass(sec, 'closed');
      setClass(sec, 'closed', closed);
      head.setAttribute('aria-expanded', closed ? 'false' : 'true');
    });
    sectionNodes.set(s.id, { sec, head });
    return sec;
  };
  const sectionNodes = new Map<string, { sec: HTMLElement; head: HTMLElement }>();

  const sfxPanel = h(doc, 'div', { class: 'sb-panel', 'data-panel': 'sfx' });
  const chips = h(doc, 'nav', { class: 'sb-chips', 'aria-label': '소리 종류로 가기' });
  for (const s of SECTIONS) {
    const chip = h(doc, 'button', { type: 'button', class: 'sb-chip', 'data-chip': s.id }, s.ko, h(doc, 'small', { text: String(s.rows.length) }));
    chip.addEventListener('click', () => {
      const node = sectionNodes.get(s.id);
      if (!node) return;
      setClass(node.sec, 'closed', false);
      node.head.setAttribute('aria-expanded', 'true');
      node.head.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    });
    chips.appendChild(chip);
  }
  fill(sfxPanel, chips, ...SECTIONS.map(sectionEl));

  // ───── tab 2: music ─────

  const musicPanel = h(doc, 'div', { class: 'sb-panel hide', 'data-panel': 'music' });
  const musicRows = new Map<MusicId, HTMLElement>();
  const musicButtons = new Map<MusicId, HTMLElement>();
  const intensityButtons: Array<[number, HTMLElement]> = [];

  const setMusic = (id: MusicId | null): void => {
    musicNow = id;
    for (const [mid, rowEl] of musicRows) setClass(rowEl, 'playing', mid === id);
    for (const [mid, b] of musicButtons) {
      const on = mid === id;
      fill(b, on ? stopIcon() : playIcon(), on ? '멈춤' : '재생');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  };

  const buildMusic = (): void => {
    const levels: Array<[string, number]> = [
      ['잔잔 · 0', 0],
      ['중간 · 0.5', 0.5],
      ['가득 · 1', 1],
    ];
    const seg = h(doc, 'div', { class: 'sb-grp' });
    for (const [label, v] of levels) {
      const b = h(doc, 'button', { type: 'button', class: 'sb-seg', 'aria-pressed': v === intensity ? 'true' : 'false', 'data-intensity': String(v), text: label });
      b.addEventListener('click', () => {
        intensity = v;
        audio.setIntensity(v);
        for (const [lv, other] of intensityButtons) other.setAttribute('aria-pressed', lv === v ? 'true' : 'false');
      });
      intensityButtons.push([v, b]);
      seg.appendChild(b);
    }
    const intro = h(
      doc,
      'section',
      { class: 'sb-sec' },
      h(doc, 'p', { class: 'sb-hint', text: '전투 곡은 싸움이 거세질수록 악기가 늘어요. 아래 세기를 바꿔 들어 보세요(레이어가 있는 곡만 달라져요).' }),
      seg,
    );
    const tracks = MUSIC_ROWS.map((m) => {
      const b = h(doc, 'button', { type: 'button', class: 'sb-btn play', 'data-act': 'music', 'data-key': m.id, 'aria-pressed': 'false' }, playIcon(), '재생');
      musicButtons.set(m.id, b);
      b.addEventListener('click', () => {
        if (musicNow === m.id) {
          audio.music('none', MUSIC_FADE);
          setMusic(null);
          return;
        }
        audio.setIntensity(intensity);
        audio.music(m.id, MUSIC_FADE);
        setMusic(m.id);
      });
      const rowEl = h(doc, 'article', { class: 'sb-row sb-paper music sec-board', 'data-row': `music:${m.id}` }, h(doc, 'h3', { text: m.ko }), h(doc, 'p', { text: m.when }), h(doc, 'span', { class: 'sb-id', text: m.id }), h(doc, 'div', { class: 'sb-btns', style: 'grid-template-columns:1fr' }, b));
      musicRows.set(m.id, rowEl);
      return rowEl;
    });
    const stingers = STINGER_ROWS.map((s) => {
      const b = button('play', 'stinger', s.id, (btn) => run(btn, player.play([{ stinger: s.id as StingerId }])), playIcon(), '재생');
      return h(doc, 'article', { class: 'sb-row sb-paper sec-rewards', 'data-row': `stinger:${s.id}` }, h(doc, 'h3', { text: s.ko }), h(doc, 'p', { text: s.when }), h(doc, 'span', { class: 'sb-id', text: `stinger:${s.id}` }), h(doc, 'div', { class: 'sb-btns', style: 'grid-template-columns:1fr' }, b));
    });
    fill(
      musicPanel,
      intro,
      h(doc, 'section', { class: 'sb-sec' }, h(doc, 'div', { class: 'sb-sec-head' }, h(doc, 'span', { text: '곡' }), h(doc, 'small', { text: `${MUSIC_ROWS.length}개` })), ...tracks),
      h(doc, 'section', { class: 'sb-sec' }, h(doc, 'div', { class: 'sb-sec-head' }, h(doc, 'span', { text: '짧은 팡파르' }), h(doc, 'small', { text: `${STINGER_ROWS.length}개` })), h(doc, 'p', { class: 'sb-hint', text: '곡 위에 잠깐 얹혀 나오는 소리예요. 곡을 틀어 놓고 들으면 음악이 작아지는 것도 들려요.' }), ...stingers),
    );
  };
  buildMusic();

  // ───── tab 3: candidates ─────

  const candPanel = h(doc, 'div', { class: 'sb-panel hide', 'data-panel': 'cand' });

  const savePicks = (): void => {
    try {
      deps.storage?.setItem(PICKS_KEY, JSON.stringify([...picks]));
    } catch {
      // storage may be blocked (private window): the picks then last until the page closes
    }
  };

  const candRow = (c: Candidate): HTMLElement => {
    const key = candidateKey(c);
    const play = button('play', 'cand', key, (b) => run(b, player.play([{ file: key }])), playIcon());
    play.setAttribute('aria-label', `${c.name} 재생`);
    const star = h(doc, 'button', { type: 'button', class: 'sb-star', 'data-act': 'pick', 'data-key': key, 'aria-pressed': picks.has(key) ? 'true' : 'false', 'aria-label': `${c.name} 고르기`, text: '★' });
    star.addEventListener('click', () => {
      if (picks.has(key)) picks.delete(key);
      else picks.add(key);
      star.setAttribute('aria-pressed', picks.has(key) ? 'true' : 'false');
      savePicks();
      renderPicks();
    });
    const gain = matchOn ? matchGain(c) : 1;
    const meta = `${(c.ms / 1000).toFixed(2)}초 · 최대 ${db(c.peak)} dB · 평균 ${db(c.loud)} dB${matchOn ? ` · 크기 맞춤 ${db(gain)} dB` : ''}`;
    const x5 = button('x5', 'cand-x5', key, (b) => run(b, player.stack([{ file: key }], 'hit')), '×5 · 3배속', h(doc, 'small', { text: '쌓이는 소리' }));
    return h(
      doc,
      'article',
      { class: 'sb-row sb-paper cand sec-battle', 'data-row': key },
      h(doc, 'div', { class: 'sb-cand' }, play, h(doc, 'div', {}, h(doc, 'div', { class: 'name', text: c.name }), h(doc, 'div', { class: 'meta', text: meta }))),
      h(doc, 'div', { class: 'sb-cand-x5' }, x5, star),
    );
  };

  const picksBox = h(doc, 'section', { class: 'sb-picks sb-paper hide' });
  const renderPicks = (): void => {
    const list = [...picks].sort();
    setClass(picksBox, 'hide', list.length === 0);
    fill(picksBox, h(doc, 'h2', { text: `내가 고른 소리 ${list.length}개` }), h(doc, 'p', { text: '이 목록을 그대로 알려 주세요.' }), h(doc, 'pre', { text: list.join('\n') }));
  };

  const candBody = h(doc, 'div', { class: 'sb-cand-body' });
  const packChips = h(doc, 'div', { class: 'sb-chips' });

  const renderCand = (): void => {
    if (manifestState === 'loading' || manifestState === 'idle') {
      fill(candBody, h(doc, 'p', { class: 'sb-empty', text: '후보 목록을 불러오는 중이에요…' }));
      return;
    }
    if (manifestState === 'failed' || !manifest) {
      fill(candBody, h(doc, 'p', { class: 'sb-empty', text: '후보 목록을 못 불러왔어요. 인터넷이 연결됐는지 보고 다시 열어 주세요.' }));
      return;
    }
    const current = packs.find((p) => p.pack === pack) ?? packs[0];
    fill(packChips);
    for (const p of packs) {
      const chip = h(doc, 'button', { type: 'button', class: 'sb-chip', 'aria-pressed': p.pack === current?.pack ? 'true' : 'false', 'data-pack': p.pack }, p.ko, h(doc, 'small', { text: String(p.count) }));
      chip.addEventListener('click', () => {
        pack = p.pack;
        renderCand();
      });
      packChips.appendChild(chip);
    }
    if (!current) {
      fill(candBody, h(doc, 'p', { class: 'sb-empty', text: '후보가 없어요.' }));
      return;
    }
    const sections = current.groups.map((g) => {
      const head = h(doc, 'button', { type: 'button', class: 'sb-sec-head', 'aria-expanded': 'false', 'data-group': g.group }, h(doc, 'span', { text: g.ko }), h(doc, 'small', { text: `${g.files.length}개` }), h(doc, 'span', { class: 'chev' }));
      let built = false;
      const body = h(doc, 'div', { class: 'sb-sec-body' });
      const sec = h(doc, 'section', { class: 'sb-sec closed' }, head, body);
      head.addEventListener('click', () => {
        const closed = !hasClass(sec, 'closed');
        if (!closed && !built) {
          built = true;
          fill(body, ...g.files.map(candRow));
        }
        setClass(sec, 'closed', closed);
        head.setAttribute('aria-expanded', closed ? 'false' : 'true');
      });
      return sec;
    });
    fill(candBody, h(doc, 'div', { class: 'sb-pack sb-paper' }, h(doc, 'p', { text: current.blurb })), ...sections);
  };

  const buildCand = (): void => {
    const opt = h(doc, 'button', { type: 'button', class: 'sb-opt', 'aria-pressed': 'true', 'data-opt': 'match' }, h(doc, 'span', { class: 'box' }), h(doc, 'span', { text: '게임 소리 크기에 맞춰 듣기 (끄면 파일 그대로)' }));
    opt.addEventListener('click', () => {
      matchOn = !matchOn;
      samples.setMatch(matchOn);
      opt.setAttribute('aria-pressed', matchOn ? 'true' : 'false');
      renderCand();
    });
    fill(
      candPanel,
      h(doc, 'p', { class: 'sb-hint', text: '무료로 쓸 수 있는 소리 파일(CC0)이에요. 마음에 드는 것에 ★를 눌러 두면 위에 목록이 쌓여요. 이 중 일부는 이미 게임에 들어 있어요. 합성 소리 밑에 깔려 있고, 소리 줄 설명에 쓴 파일 이름이 적혀 있어요.' }),
      opt,
      picksBox,
      packChips,
      candBody,
    );
    renderPicks();
  };
  buildCand();

  const ensureManifest = (): void => {
    if (manifestState !== 'idle') return;
    manifestState = 'loading';
    renderCand();
    deps.manifest().then(
      (m) => {
        manifest = m;
        packs = groupManifest(m);
        pack = packs[0]?.pack ?? '';
        manifestState = 'ready';
        deps.onManifest?.(m);
        renderCand();
      },
      () => {
        manifestState = 'failed';
        renderCand();
      },
    );
  };

  // ───── the page ─────

  const panels: Record<TabId, HTMLElement> = { sfx: sfxPanel, music: musicPanel, cand: candPanel };
  const showTab = (id: TabId): void => {
    tab = id;
    for (const [tid, b] of tabButtons) b.setAttribute('aria-selected', tid === id ? 'true' : 'false');
    for (const tid of Object.keys(panels) as TabId[]) setClass(panels[tid], 'hide', tid !== id);
    if (id === 'cand') ensureManifest();
  };

  const head = h(
    doc,
    'div',
    { class: 'sb-wrap sb-head' },
    h(doc, 'h1', { class: 'sb-title', text: '냥이 수비대 소리판' }),
    h(doc, 'p', { class: 'sb-sub', text: '게임의 소리를 하나씩 들어 보는 페이지' }),
    h(doc, 'section', { class: 'sb-note sb-paper' }, h(doc, 'h2', { text: '쓰는 법' }), h(doc, 'ol', {}, ...HOW_TO.map((t) => h(doc, 'li', { text: t })))),
  );
  const main = h(doc, 'main', { class: 'sb-wrap' }, statusEl, sfxPanel, musicPanel, candPanel, h(doc, 'p', { class: 'sb-foot', text: `소리 ${ROWS.length}줄 · 게임이 내는 소리와 같은 엔진으로 들려줘요` }));
  const page = h(doc, 'div', { class: 'sb', 'data-soundboard': '' }, head, top, main, gate);
  root.appendChild(page);

  // The phone may suspend either context (a call, the lock screen), and on a touch screen the engine's own first attempt starts at pointerdown, which is
  // not a gesture yet: every tap (its click) is a fresh chance to wake both.
  page.addEventListener(
    'click',
    () => {
      if (!audio.unlocked) audio.wake();
      if (!samples.unlocked) samples.unlock();
    },
    true,
  );

  // A tab that goes to the background must not keep sounding (a phone call, the lock screen).
  const onVisibility = (): void => {
    if (doc.hidden) stopEverything();
  };
  doc.addEventListener('visibilitychange', onVisibility);

  // The engine is created now, silent and suspended; the first tap on the gate wakes it.
  audio.init();

  return {
    root: page,
    setNew(key, cues) {
      const row = ROWS.find((r) => r.key === key);
      const slot = slots.get(key);
      if (!row || !slot) return;
      if (cues) versionsNew.set(key, cues);
      else versionsNew.delete(key);
      renderRow(row, slot);
    },
    tab: showTab,
    destroy() {
      stopEverything();
      doc.removeEventListener('visibilitychange', onVisibility);
      page.parentNode?.removeChild(page);
    },
  };
}

function readPicks(storage: BoardDeps['storage']): Set<string> {
  try {
    const raw = storage?.getItem(PICKS_KEY);
    if (!raw) return new Set();
    const list: unknown = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** The address of a candidate file, for the sample player. */
export function candidateAddress(file: string, base: string): string {
  return candidateUrl(file, base);
}

/** Convenience for the page code that mounts the board: the manifest reader for a base address. */
export function manifestReader(base: string): () => Promise<Manifest> {
  return () => loadManifest(base);
}
