/**
 * The developer lab (`?scene=lab`): the debug battle as a pure test space, with a plain-DOM panel beside it. A cat button stands that cat at once
 * on the free cell nearest the scarecrows; a tap on an empty cell of the board itself stands the last chosen cat there, and the board's own drags
 * move, merge and sell as in a battle. Scarecrows stand still on the road and never die (their health refills, one that is taken away comes back),
 * the run cannot be lost, and the gauges, the waves and the battle clock (pause, step, slow) are the panel's. Loaded only from the debug route.
 */
import { t } from '@/core/i18n';
import { ENEMY_IDS, UNIT_GRID, spTextsOfUnit, unitSpec, type ClassId, type EnemyId, type UnitId } from '@/game';
import { BOSS_APPEAR } from '@/game/data/balance';
import { SP_ROWS, type SpRows } from '@/game/data/spSkills';
import { killEnemy, removeEnemy, spawnEnemy } from '@/game/sim/enemies';
import { Sim } from '@/game/sim/sim';
import type { SimEnemy, SimUnit } from '@/game/sim/types';
import { CELL_COUNT, PATH_LENGTH, cellCenterX, cellCenterY, pathPoint, wrapPath } from '@/game/geometry';
import { TOPIC_LIST } from '@/guide/topics';
import type { GuideProgress } from '@/guide';
import type { BattleScene } from '@/scenes/BattleScene';
import type { installBattleDebug } from './debug';

type Api = ReturnType<typeof installBattleDebug>;

/** A wave clock that never runs out: the held waves. */
const HELD = 1e9;
/** Battle seconds between a cat's cast and the next one when the skills repeat. */
const REFILL_GAP = 4;
/** Battle seconds between two casts the panel asks for (one after another, so each motion is seen and the bard has gauges to fill). */
const SKILL_GAP = 0.8;
/** Battle seconds after which a cast the panel asked for that did not happen is reported. */
const SKILL_WATCH = 0.6;
/**
 * The skills' own conditions, loosened while the lab's "ignore the conditions" is on: one scarecrow is enough for every skill (put back as
 * they were when it is turned off or the lab is left). The frost queen's chill and the bard's second cat are staged at the cast instead.
 */
const LOOSE: ReadonlyArray<readonly [keyof SpRows, string, unknown]> = [
  ['shove', 'minTravelled', 0], ['shove', 'window', 0],
  ['cut', 'minEnemies', 1],
  ['charge', 'minWeight', 1], ['charge', 'crowd', 1],
  // One enemy, and a clone throws at the ninja's own target (else the clones stand idle beside a lone scarecrow).
  ['clones', 'readyMinEnemies', 1], ['clones', 'spread', false],
  ['wanted', 'hold', 'none'],
  ['lap', 'minEnemies', 1],
  ['knock', 'minChilled', 1],
  ['meteor', 'minWeight', 1],
  // Any health counts as weak (the scarecrows have a hundredfold health).
  ['fish', 'minTargets', 1], ['fish', 'maxHp', Infinity],
];
/** How many enemies short of the overflow cap the lab stops bringing more (the danger alarm sounds near it). */
const CAP_ROOM = 5;
/** Real milliseconds each frame's slow-motion request lasts (renewed every frame; the clock eases back once it lapses). */
const SLOW_HOLD_MS = 150;
const SLOW = [1, 0.5, 0.25, 0.1] as const;
/** Most real frames one step press runs (a slow motion or a hit-stop stretches how many it takes to move the battle the asked time). */
const STEP_CAP = 2000;
/** The cell the scarecrows stand beside (the middle of the top row: the road over it stays in view on a phone, where the panel covers the lower half). */
const POST_CELL = 2;
/** Px of road between two scarecrows, and how many may stand. */
const DUMMY_GAP = 34;
const DUMMY_MAX = 12;
/**
 * A scarecrow's health, in the stage's base health, and the share below which it is filled again. Never "hurt" in the alchemist's sense
 * (0.6 base health): under the real conditions only an elite or boss look lets the alchemist cast; "ignore the conditions" counts any health.
 */
const DUMMY_HP = 100;
const DUMMY_REFILL = 0.4;
/** Walking enemies: how many one press brings, their health in base health, and how far up the road from the scarecrows they start. */
const WALKERS = 8;
const WALKER_HP = 60;
const WALKER_LEAD = 240;
/** Seconds a boss wave's clock is kept short of its limit (a boss that runs out of time ends the run). */
const BOSS_ROOM = 2;

const CSS = `
#lab{position:fixed;top:8px;right:8px;z-index:50;width:300px;max-height:calc(100vh - 16px);overflow:auto;font:13px/1.35 system-ui,sans-serif;
 color:#2b2118;background:#fff8ecf2;border:2px solid #c9a679;border-radius:10px;box-shadow:0 4px 16px #0004;padding:8px;box-sizing:border-box}
#lab.closed{width:auto;padding:4px}#lab.closed>:not(.bar),#lab.closed .bar span{display:none}
#lab .bar{display:flex;justify-content:space-between;align-items:center;font-weight:700}
#lab h4{margin:8px 0 4px;font-size:12px;color:#7a5a36}
#lab button,#lab select{font:inherit;margin:1px;padding:3px 6px;border:1px solid #c9a679;border-radius:6px;background:#fff}
#lab button.on{background:#f3b84b;font-weight:700}
#lab .cats{display:grid;grid-template-columns:repeat(5,1fr);gap:2px}
#lab .cats button{padding:3px 1px;font-size:11px}
#lab .cats button.sp{border-color:#e07b2a;border-width:2px}
#lab .note{font-size:11px;color:#7a5a36;margin:2px 0}
@media (max-width:600px){#lab{top:auto;bottom:4px;right:4px;left:4px;width:auto;max-height:45vh}
 #lab.closed{top:62%;bottom:auto;left:auto}}
`;

let mounted: { root: HTMLElement; stop(): void } | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', cls = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

function button(parent: HTMLElement, text: string, onClick: () => void, title = ''): HTMLButtonElement {
  const b = el('button', text);
  if (title) b.title = title;
  b.onclick = onClick;
  parent.appendChild(b);
  return b;
}

const unitName = (id: UnitId): string => t(`unit.${id}.name`);

/** The distance along the road of its point nearest to `cell` (sampled every 8 px: enough for a cat's reach). */
function roadBeside(cell: number): number {
  const x = cellCenterX(cell);
  const y = cellCenterY(cell);
  let best = 0;
  let bestD = Infinity;
  for (let d = 0; d < PATH_LENGTH; d += 8) {
    const p = pathPoint(d);
    const dist = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best;
}

/** Mounts the panel for this battle (a battle opened again, a retry or a continue, gets a fresh one). */
export function mountLab(scene: BattleScene, api: Api): void {
  mounted?.stop();
  const sim = scene.battle instanceof Sim ? scene.battle : null;
  if (!sim) return;
  // The first-encounter cards hold the battle: the lab has every topic read, in the sandbox's own memory (the HUD built just now exposed it).
  const progress = (window.__dbg?.lessons as { progress?: GuideProgress } | null | undefined)?.progress;
  if (progress) for (const topic of TOPIC_LIST) progress.markRead(topic.id);
  const doc = document;
  if (!doc.getElementById('lab-css')) {
    const style = el('style');
    style.id = 'lab-css';
    style.textContent = CSS;
    doc.head.appendChild(style);
  }
  const root = el('div');
  root.id = 'lab';

  // ── state ──
  /** The cat a tap on an empty cell of the board stands (the last one chosen). */
  let pen: UnitId = 'w_paw';
  let waveHeld = true;
  let repeat = false;
  let loose = true;
  let slow: number = 1;
  let paused = false;
  const refilled = new Map<number, number>();
  const post = roadBeside(POST_CELL);
  const postAt = pathPoint(post);
  const far = (c: number): number => (cellCenterX(c) - postAt.x) ** 2 + (cellCenterY(c) - postAt.y) ** 2;
  /** The cells by how near they are to the scarecrows: a cat button takes the first free one. */
  const nearest = Array.from({ length: CELL_COUNT }, (_, c) => c).sort((a, b) => far(a) - far(b));
  /** The scarecrows standing, each with its place on the road (the first on the post, then one either side in turn). */
  const dummies: Array<{ uid: number; at: number }> = [];
  let look: EnemyId = 'cucumber';

  /** A cat leaves through the real sell command, so what it left behind (the ninja's clones, a cut on its way) ends with it. */
  const clearCell = (c: number): void => {
    if (sim.units[c]) sim.sell(c);
  };
  const stand = (cell: number, id: UnitId): void => {
    clearCell(cell);
    api.put(cell, id);
  };
  const rows = SP_ROWS as unknown as Record<string, Record<string, unknown>>;
  const kept = new Map<string, unknown>();
  /** Loosens (or puts back) the skills' conditions. */
  const loosen = (on: boolean): void => {
    for (const [skill, field, value] of LOOSE) {
      const row = rows[skill] as Record<string, unknown>;
      const key = `${skill}.${field}`;
      if (on && !kept.has(key)) {
        kept.set(key, row[field]);
        row[field] = value;
      } else if (!on && kept.has(key)) {
        row[field] = kept.get(key);
        kept.delete(key);
      }
    }
  };
  /** The casts the panel asked for, cast one after another, and the asked casts that have not come yet (named after SKILL_WATCH). */
  const queue: number[] = [];
  let nextCast = 0;
  const watch: Array<{ uid: number; at: number }> = [];
  const unitOf = (uid: number): SimUnit | null => sim.units.find((u) => u?.uid === uid) ?? null;
  const ask = (u: SimUnit): void => {
    if (u.spec.spSkill && !queue.includes(u.uid)) queue.push(u.uid);
  };
  /**
   * What a skill needs that no number gives, while the conditions are ignored (for every full gauge, asked or filled on its own): the frost
   * queen's chilled enemy, and for the bard a cat that can take a note (a skill cat under the note's limit, or a cat without a skill).
   */
  const stage = (u: SimUnit): void => {
    const id = u.spec.spSkill?.id;
    if (id === 'knock') api.chill(0, 99, 30);
    else if (id === 'jam' && !sim.units.some((o) => o && o !== u && (!o.spec.spSkill || o.sp < SP_ROWS.jam.skip))) {
      const free = nearest.find((c) => !sim.units[c]);
      if (free !== undefined) {
        api.put(free, 'w_paw');
        skillNote.textContent = '악사냥의 음표를 받을 고양이가 없어서 솜방망이를 옆에 세웠어요.';
      }
    }
  };
  /** Casts now: the gauge is filled (the cast comes in the next tick, staged by the loop). */
  const fire = (u: SimUnit): void => {
    // Another rank 5 cast just before would make this one wait its 1.2 s gap.
    if (loose) sim.spRank5Until = 0;
    api.gauge(u.cell, 1);
    refilled.set(u.uid, sim.time);
    watch.push({ uid: u.uid, at: sim.time });
  };
  /** Pauses the battle under the lab's own reason, which the HUD's pause menu and guidebook never touch (and which leaves the board to the touch). */
  const holdLab = (on: boolean): void => scene.ctx.setPaused('lab', on);
  /** Runs `seconds` of battle while the lab holds it, a real frame at a time until the battle clock has moved that far (whatever the speed, slow motion or hit-stop). */
  const advance = (seconds: number): void => {
    if (!paused) return;
    const frame = 1 / 60;
    const until = sim.time + seconds - 1e-6;
    holdLab(false);
    for (let i = 0; i < STEP_CAP && sim.time < until; i++) scene.update(frame / scene.ctx.speed);
    holdLab(true);
  };

  const holdWaves = (): void => {
    // A wave's elite or boss on the field ends its own wave when it falls (held before that, the next wave would start under it).
    if (sim.phase !== 'wave' || sim.boss) return;
    sim.stage = 'between';
    sim.stageTimer = waveHeld ? HELD : 1;
    // Nothing more comes this wave: the skills that wait for the rest of a wave (the tiger's run on a thin stretch) see an empty queue.
    sim.spawnIdx = sim.spawnIds.length;
  };

  const raise = (at: number): SimEnemy => {
    const e = spawnEnemy(sim, look, at, sim.baseHp(), false, sim.baseHp() * DUMMY_HP);
    e.speed = 0;
    return e;
  };
  const dummyOf = (uid: number): SimEnemy | undefined => sim.enemies.find((e) => e.uid === uid);
  const addDummy = (): void => {
    if (dummies.length >= DUMMY_MAX || sim.enemies.length >= sim.enemyCap - CAP_ROOM) return;
    const i = dummies.length;
    const at = wrapPath(post + (i % 2 === 1 ? 1 : -1) * Math.ceil(i / 2) * DUMMY_GAP);
    dummies.push({ uid: raise(at).uid, at });
  };
  const dropDummy = (d: { uid: number }): void => {
    const e = dummyOf(d.uid);
    if (e) removeEnemy(sim, e);
  };
  /** Keeps every scarecrow: one that was taken away (a kill after all, the alchemist's flask) stands again, a low one is filled, a pushed one walks back. */
  const keepDummies = (): void => {
    for (const d of dummies) {
      let e = dummyOf(d.uid);
      if (!e) {
        e = raise(d.at);
        d.uid = e.uid;
      }
      if (e.hp < e.maxHp * DUMMY_REFILL) {
        e.hp = e.maxHp;
        e.shield = e.maxShield;
      }
      if (e.shoveLeft > 0) continue;
      // Pushed or pulled back along the road, it walks to its place at its own pace (the road's distance only grows forwards).
      const behind = wrapPath(d.at - e.travelled);
      if (behind > 0.5 && behind < PATH_LENGTH / 2) {
        e.speed = e.spec.speed;
      } else if (e.speed !== 0 || behind !== 0) {
        e.speed = 0;
        e.travelled += behind > PATH_LENGTH / 2 ? behind - PATH_LENGTH : behind;
        pathPoint(e.travelled, e);
      }
    }
  };

  // ── title bar ──
  const bar = el('div', '', 'bar');
  bar.appendChild(el('span', '개발자 시험장'));
  const fold = button(bar, '접기', () => {
    root.classList.toggle('closed');
    fold.textContent = root.classList.contains('closed') ? '시험장 열기' : '접기';
  });
  root.appendChild(bar);

  // ── cats ──
  root.appendChild(el('h4', '고양이 (주황 테두리: 스킬 있음)'));
  const cats = el('div', '', 'cats');
  const catButtons = new Map<UnitId, HTMLButtonElement>();
  const choose = (id: UnitId): void => {
    pen = id;
    for (const [k, b] of catButtons) b.classList.toggle('on', k === id);
    picked.textContent = catLine(id);
  };
  for (const classId of Object.keys(UNIT_GRID) as ClassId[]) {
    for (const id of UNIT_GRID[classId]) {
      const spec = unitSpec(id);
      const b = button(cats, unitName(id), () => {
        choose(id);
        const free = nearest.find((c) => !sim.units[c]);
        if (free === undefined) {
          catNote.textContent = '판이 꽉 찼어요. 고양이를 아래 판매 칸으로 끌어 치우거나 판을 비워 주세요.';
          return;
        }
        catNote.textContent = '';
        stand(free, id);
      }, spec.spSkill ? `스킬: ${t(spec.spSkill.nameKey)}` : '');
      if (spec.spSkill) b.classList.add('sp');
      catButtons.set(id, b);
    }
  }
  root.appendChild(cats);
  const tools = el('div');
  button(tools, '판 비우기', () => {
    for (let c = 0; c < CELL_COUNT; c++) clearCell(c);
  });
  root.appendChild(tools);
  root.appendChild(el('div', '누르면 허수아비와 가까운 빈 칸에 바로 섭니다. 게임 화면의 빈 칸을 누르면 마지막에 고른 고양이가 그 칸에 서고, 끌어서 옮기기와 합치기, 아래 판매 칸으로 끌어 치우기는 게임과 같습니다.', 'note'));
  const catNote = el('div', '', 'note');
  root.appendChild(catNote);
  const picked = el('div', '', 'note');
  picked.style.whiteSpace = 'pre-line';
  root.appendChild(picked);

  // ── skills ──
  root.appendChild(el('h4', '스킬'));
  const skills = el('div');
  button(skills, '모두 쓰기', () => {
    skillNote.textContent = '';
    for (const u of sim.units) if (u) ask(u);
  }, '판의 스킬 고양이가 차례로 하나씩 스킬을 씁니다.');
  button(skills, '고른 고양이 쓰기', () => {
    const c = scene.ctx.selected;
    const u = c === null ? null : sim.units[c];
    skillNote.textContent = u?.spec.spSkill ? '' : '게임 화면에서 스킬 고양이를 눌러 고른 뒤 누르세요.';
    if (u?.spec.spSkill) fire(u);
  });
  const repeatBtn = button(skills, '계속 쓰기', () => {
    repeat = !repeat;
    repeatBtn.classList.toggle('on', repeat);
    refilled.clear();
  }, `스킬을 쓰고 ${REFILL_GAP}초 뒤 다시 씁니다.`);
  const looseBtn = button(skills, '조건 무시', () => {
    loose = !loose;
    looseBtn.classList.toggle('on', loose);
    loosen(loose);
  }, '켜 두면 허수아비 한 마리로도 모든 스킬이 나갑니다. 끄면 실제 게임 조건(적 수, 정예와 보스, 얼린 적, 다른 고양이 등)으로 씁니다.');
  looseBtn.classList.add('on');
  loosen(true);
  root.appendChild(skills);
  root.appendChild(el('div', '"조건 무시"가 켜져 있으면 허수아비 한 마리로도 모든 스킬이 나갑니다. 끄면 실제 게임 조건으로 씁니다.', 'note'));
  const skillNote = el('div', '', 'note');
  const waitNote = el('div', '', 'note');
  root.append(skillNote, waitNote);

  // ── scarecrows ──
  root.appendChild(el('h4', '허수아비 (죽지 않고 움직이지 않아요)'));
  const foes = el('div');
  const kind = el('select');
  for (const id of ENEMY_IDS) {
    const o = el('option', `${t(`enemy.${id}.name`)} (${id})`);
    o.value = id;
    kind.appendChild(o);
  }
  kind.value = look;
  kind.title = '허수아비와 걷는 적의 모습. 바꾸면 서 있는 허수아비도 바뀝니다.';
  kind.onchange = () => {
    look = kind.value as EnemyId;
    for (const d of dummies) {
      dropDummy(d);
      d.uid = raise(d.at).uid;
    }
  };
  foes.appendChild(kind);
  button(foes, '한 마리 더', addDummy);
  button(foes, '한 마리 빼기', () => {
    const d = dummies.pop();
    if (d) dropDummy(d);
  });
  const tally = el('span');
  foes.appendChild(tally);
  root.appendChild(foes);

  // ── walking enemies ──
  root.appendChild(el('h4', '걷는 적'));
  const walk = el('div');
  button(walk, `${WALKERS}마리 부르기`, () => {
    // The danger alarm sounds near the overflow cap: the lab stays a few short of it.
    const n = Math.min(WALKERS, sim.enemyCap - CAP_ROOM - sim.enemies.length);
    if (n <= 0) {
      foeNote.textContent = `적이 너무 많아요(최대 ${sim.enemyCap - CAP_ROOM}마리). 먼저 치워 주세요.`;
      return;
    }
    foeNote.textContent = '';
    // A row 30 px apart a little up the road from the scarecrows, so it walks past the cats beside them.
    api.spawn(look, n, wrapPath(post - WALKER_LEAD - (n - 1) * 30), WALKER_HP);
  }, '허수아비보다 조금 앞 길에서 출발해 고양이 앞을 지나갑니다. 이 적은 죽습니다.');
  button(walk, '얼리기', () => api.chill(99, 0, 30), '필드의 적을 30초 동안 얼립니다(보스는 얼지 않음).');
  button(walk, '걷는 적 치우기', () => {
    const kept = new Set(dummies.map((d) => d.uid));
    // A wave's own elite or boss is killed, as the real end of its wave; the rest just leave.
    for (const e of sim.enemies.slice()) {
      if (kept.has(e.uid)) continue;
      if (e.target) killEnemy(sim, e, null);
      else removeEnemy(sim, e);
    }
  });
  root.appendChild(walk);
  const foeNote = el('div', '', 'note');
  root.appendChild(foeNote);

  // ── time ──
  root.appendChild(el('h4', '시간'));
  const time = el('div');
  const pauseBtn = button(time, '멈춤', () => {
    paused = !paused;
    pauseBtn.classList.toggle('on', paused);
    pauseBtn.textContent = paused ? '재생' : '멈춤';
    holdLab(paused);
  });
  button(time, '1프레임', () => advance(1 / 60), '멈춘 상태에서 1/60초 진행');
  button(time, '0.5초', () => advance(0.5), '멈춘 상태에서 0.5초 진행');
  const slowRow = el('div');
  slowRow.appendChild(el('span', '느리게 '));
  const slowButtons = SLOW.map((f) =>
    button(slowRow, f === 1 ? '보통' : `x${f}`, () => {
      slow = f;
      slowButtons.forEach((b, i) => b.classList.toggle('on', SLOW[i] === f));
    }),
  );
  slowButtons[0]?.classList.add('on');
  const waveBtn = button(time, '웨이브 멈춤', () => {
    waveHeld = !waveHeld;
    waveBtn.classList.toggle('on', waveHeld);
    holdWaves();
  }, '켜 두면 새 웨이브와 적이 오지 않습니다. 끄면 다음 웨이브가 곧 시작됩니다.');
  waveBtn.classList.add('on');
  root.append(time, slowRow);
  root.appendChild(el('div', '빠르게는 화면의 배속 버튼(최대 3배)을 쓰면 됩니다. 여기서는 게임 오버가 없습니다.', 'note'));

  doc.body.appendChild(root);
  choose(pen);
  addDummy();

  function catLine(id: UnitId): string {
    const sp = spTextsOfUnit(id);
    return sp ? `${unitName(id)}: ${sp.name} (${sp.cooldown})\n${sp.desc}` : `${unitName(id)}: 스킬 없음 (공격만)`;
  }

  // A tap on an empty cell of the board (nothing selected, no special cell to explain) stands the last chosen cat there.
  const offTap = scene.ctx.events.on('emptyTap', ({ cell }) => stand(cell, pen));

  // ── the loop: the run cannot be lost, the scarecrows are kept, the waves stay held, the gauges refill, the slow motion runs ──
  let raf = 0;
  const frame = (): void => {
    // Neither way to lose comes: the overflow count waits as after a revive, and a boss wave's clock stays short of its limit.
    sim.reviveGrace = Infinity;
    if (sim.bossSpawned && sim.boss) sim.waveClock = Math.min(sim.waveClock, BOSS_APPEAR + sim.waveDuration - BOSS_ROOM);
    keepDummies();
    if (waveHeld && sim.phase === 'wave' && sim.stage !== 'between') holdWaves();
    // The lab starts at once: no prep wait before the cats may act.
    if (sim.phase === 'prep') sim.prepTime = 0;
    if (repeat) {
      for (const u of sim.units) {
        if (!u || !u.spec.spSkill || u.sp >= 1) continue;
        if (sim.time - (refilled.get(u.uid) ?? -Infinity) >= REFILL_GAP) ask(u);
      }
    }
    // One asked cast at a time, SKILL_GAP of battle time apart (a held battle holds the line too).
    if (queue.length > 0 && sim.time >= nextCast) {
      const u = unitOf(queue.shift() as number);
      if (u) {
        fire(u);
        nextCast = sim.time + SKILL_GAP;
      }
    }
    // Every full gauge is staged until it casts (a scarecrow raised again after the alchemist's flask has no chill on it).
    if (loose) for (const u of sim.spCats.slice()) if (u.sp >= 1 - 1e-9) stage(u);
    // The asked casts still to come: those still waiting SKILL_WATCH later are named (the skill's own condition holds them back); a cat that
    // casts later (a pushed scarecrow walked back into its reach) leaves the line.
    const late: string[] = [];
    for (let i = watch.length - 1; i >= 0; i--) {
      const w = watch[i] as { uid: number; at: number };
      const u = unitOf(w.uid);
      if (!u || u.sp < 1 - 1e-9) {
        watch.splice(i, 1);
        continue;
      }
      if (sim.time - w.at >= SKILL_WATCH) late.push(unitName(u.id));
    }
    const wait = late.length > 0 ? `조건이 맞을 때까지 기다리는 중: ${late.join(', ')} (게이지는 찬 채로 기다립니다)` : '';
    if (waitNote.textContent !== wait) waitNote.textContent = wait;
    // The battle clock's own slow motion (the one a big hit asks for), renewed every frame while it is chosen.
    if (slow < 1) scene.ctx.slowmo(slow, SLOW_HOLD_MS);
    const text = ` ${dummies.length}마리`;
    if (tally.textContent !== text) tally.textContent = text;
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  mounted = {
    root,
    stop() {
      cancelAnimationFrame(raf);
      offTap();
      loosen(false);
      if (!scene.destroyed) holdLab(false);
      root.remove();
      mounted = null;
    },
  };
  // A battle that is left (home, a new battle) takes its panel with it.
  scene.once('destroyed', () => mounted?.root === root && mounted.stop());
}
