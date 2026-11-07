/**
 * The developer lab (`?scene=lab`): the debug battle with a plain-DOM panel over it, for trying a cat's attack and skill at once. Pick a cat
 * and a cell to stand it there, fill the gauges to cast now (or keep refilling them), bring sturdy enemies to hit, and pause, step or slow
 * the battle to look at one motion. The waves are held, so nothing walks in that the panel did not bring. Loaded only from the debug route.
 */
import { t } from '@/core/i18n';
import { ENEMY_IDS, UNIT_GRID, spTextsOfUnit, unitSpec, type ClassId, type EnemyId, type UnitId } from '@/game';
import { killEnemy, removeEnemy } from '@/game/sim/enemies';
import { Sim } from '@/game/sim/sim';
import { CELL_COUNT, COLS, PATH_LENGTH, cellCenterX, cellCenterY, pathPoint, wrapPath } from '@/game/geometry';
import { TOPIC_LIST } from '@/guide/topics';
import type { GuideProgress } from '@/guide';
import type { BattleScene } from '@/scenes/BattleScene';
import type { installBattleDebug } from './debug';

type Api = ReturnType<typeof installBattleDebug>;

/** A wave clock that never runs out: the held waves. */
const HELD = 1e9;
/** Real seconds between two refills of one cat's gauge when the skills repeat. */
const REFILL_GAP = 4;
/** How many enemies short of the overflow cap the lab stops bringing more. */
const CAP_ROOM = 5;
/** Real milliseconds each frame's slow-motion request lasts (renewed every frame; the clock eases back once it lapses). */
const SLOW_HOLD_MS = 150;
const SLOW = [1, 0.5, 0.25, 0.1] as const;
const TOUGH: ReadonlyArray<readonly [string, number]> = [['보통', 1], ['튼튼', 60], ['안 죽음', 1e6]];

const CSS = `
#lab{position:fixed;top:8px;right:8px;z-index:50;width:300px;max-height:calc(100vh - 16px);overflow:auto;font:13px/1.35 system-ui,sans-serif;
 color:#2b2118;background:#fff8ecf2;border:2px solid #c9a679;border-radius:10px;box-shadow:0 4px 16px #0004;padding:8px;box-sizing:border-box}
#lab.closed{width:auto;padding:4px}#lab.closed>:not(.bar),#lab.closed .bar span{display:none}
#lab .bar{display:flex;justify-content:space-between;align-items:center;font-weight:700}
#lab h4{margin:8px 0 4px;font-size:12px;color:#7a5a36}
#lab button,#lab select,#lab input{font:inherit;margin:1px;padding:3px 6px;border:1px solid #c9a679;border-radius:6px;background:#fff}
#lab button.on{background:#f3b84b;font-weight:700}
#lab .cats{display:grid;grid-template-columns:repeat(5,1fr);gap:2px}
#lab .cats button{padding:3px 1px;font-size:11px}
#lab .cats button.sp{border-color:#e07b2a;border-width:2px}
#lab .grid{display:grid;grid-template-columns:repeat(${COLS},1fr);gap:2px}
#lab .grid button{height:34px;padding:0;font-size:10px;line-height:1.1}
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
  let pick: UnitId | 'erase' = 'w_paw';
  /** The cell a cat was last stood on: the enemies come on the road beside it. */
  let near = 12;
  let waveHeld = true;
  let repeat = false;
  let slow: number = 1;
  let paused = false;
  const refilled = new Map<number, number>();

  /** A cat leaves through the real sell command, so what it left behind (the ninja's clones, a cut on its way) ends with it. */
  const clearCell = (c: number): void => {
    if (sim.units[c]) sim.sell(c);
  };
  /** Pauses the battle under the lab's own reason, which the HUD's pause menu and guidebook never touch. */
  const holdLab = (on: boolean): void => scene.ctx.setPaused('lab', on);
  /** Runs `seconds` of battle while the lab holds it, a frame at a time (divided by the game speed, so one press is the same at 1x and 3x). */
  const advance = (seconds: number): void => {
    if (!paused) return;
    const frame = 1 / 60;
    holdLab(false);
    for (let t = 0; t < seconds - 1e-9; t += frame) scene.update(frame / scene.ctx.speed);
    holdLab(true);
  };

  const holdWaves = (): void => {
    if (sim.phase !== 'wave') return;
    sim.stage = 'between';
    sim.stageTimer = waveHeld ? HELD : 1;
    // Nothing more comes this wave: the skills that wait for the rest of a wave (the tiger's run on a thin stretch) see an empty queue.
    sim.spawnIdx = sim.spawnIds.length;
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
  root.appendChild(el('h4', '고양이 고르기 (주황 테두리: 스킬 있음)'));
  const cats = el('div', '', 'cats');
  const catButtons = new Map<UnitId | 'erase', HTMLButtonElement>();
  const choose = (id: UnitId | 'erase'): void => {
    pick = id;
    for (const [k, b] of catButtons) b.classList.toggle('on', k === id);
    picked.textContent = id === 'erase' ? '칸을 누르면 그 칸의 고양이를 치웁니다' : catLine(id);
  };
  for (const classId of Object.keys(UNIT_GRID) as ClassId[]) {
    for (const id of UNIT_GRID[classId]) {
      const spec = unitSpec(id);
      const b = button(cats, unitName(id), () => choose(id), spec.spSkill ? `스킬: ${t(spec.spSkill.nameKey)}` : '');
      if (spec.spSkill) b.classList.add('sp');
      catButtons.set(id, b);
    }
  }
  root.appendChild(cats);
  const tools = el('div');
  catButtons.set('erase', button(tools, '지우개', () => choose('erase')));
  button(tools, '판 비우기', () => {
    for (let c = 0; c < CELL_COUNT; c++) clearCell(c);
  });
  root.appendChild(tools);
  const picked = el('div', '', 'note');
  picked.style.whiteSpace = 'pre-line';
  root.appendChild(picked);

  // ── the board ──
  root.appendChild(el('h4', '칸을 눌러 세우기 (숫자: 스킬 게이지 %)'));
  const grid = el('div', '', 'grid');
  const cells: HTMLButtonElement[] = [];
  for (let c = 0; c < CELL_COUNT; c++) {
    cells.push(
      button(grid, '', () => {
        clearCell(c);
        if (pick !== 'erase') {
          api.put(c, pick, repeat ? 1 : undefined);
          near = c;
        }
        draw();
      }),
    );
  }
  root.appendChild(grid);

  // ── skills ──
  root.appendChild(el('h4', '스킬'));
  const skills = el('div');
  button(skills, '지금 모두 쓰기', () => api.gaugeAll(1), '스킬 고양이 모두의 게이지를 채웁니다. 조건(사거리 안의 적 등)이 맞으면 바로 씁니다.');
  const repeatBtn = button(skills, '계속 쓰기', () => {
    repeat = !repeat;
    repeatBtn.classList.toggle('on', repeat);
    refilled.clear();
  }, `게이지가 비면 ${REFILL_GAP}초 뒤 다시 채웁니다.`);
  root.appendChild(skills);
  root.appendChild(el('div', '스킬마다 쓰는 조건이 있어요(사거리 안의 적, 적 수, 정예나 보스, 다른 고양이 등). 게이지가 100인데 안 나가면 적을 더 부르거나 길과 붙은 가장자리 칸에 세우세요.', 'note'));

  // ── enemies ──
  root.appendChild(el('h4', '적'));
  const foes = el('div');
  const kind = el('select');
  for (const id of ENEMY_IDS) {
    const o = el('option', `${t(`enemy.${id}.name`)} (${id})`);
    o.value = id;
    kind.appendChild(o);
  }
  const count = el('input');
  count.type = 'number';
  count.min = '1';
  count.max = '40';
  count.value = '8';
  count.style.width = '44px';
  const tough = el('select');
  for (const [label, hp] of TOUGH) {
    const o = el('option', label);
    o.value = String(hp);
    tough.appendChild(o);
  }
  tough.value = String(TOUGH[1]?.[1]);
  foes.append(kind, count, tough);
  button(foes, '부르기', () => {
    // The real overflow rule ends a run with too many enemies on the field: the lab stays a few short of it.
    const room = sim.enemyCap - CAP_ROOM - sim.enemies.length;
    const n = Math.min(40, room, Math.max(1, Math.round(Number(count.value)) || 1));
    if (n <= 0) {
      foeNote.textContent = `적이 너무 많아요(최대 ${sim.enemyCap - CAP_ROOM}마리). 먼저 치워 주세요.`;
      return;
    }
    foeNote.textContent = '';
    // A row 30 px apart, centred on the road beside the last cat stood (travel only grows from there, so the start is kept on the loop).
    api.spawn(kind.value as EnemyId, n, wrapPath(roadBeside(near) - (n - 1) * 15), Number(tough.value));
  }, '마지막으로 세운 고양이 바로 옆 길에 부릅니다.');
  button(foes, '얼리기', () => api.chill(99, 0, 30), '필드의 적을 30초 동안 얼립니다(보스는 얼지 않음).');
  button(foes, '모두 치우기', () => {
    // A wave's own elite or boss is killed, as the real end of its wave; the rest just leave.
    for (const e of sim.enemies.slice()) {
      if (e.target) killEnemy(sim, e, null);
      else removeEnemy(sim, e);
    }
  });
  root.appendChild(foes);
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
  root.appendChild(el('div', '빠르게는 화면의 배속 버튼(최대 3배)을 쓰면 됩니다.', 'note'));

  doc.body.appendChild(root);
  choose(pick);

  function catLine(id: UnitId): string {
    const sp = spTextsOfUnit(id);
    return sp ? `${unitName(id)}: ${sp.name} (${sp.cooldown})
${sp.desc}` : `${unitName(id)}: 스킬 없음 (공격만)`;
  }

  function draw(): void {
    for (let c = 0; c < CELL_COUNT; c++) {
      const u = sim!.units[c];
      const b = cells[c] as HTMLButtonElement;
      const text = u ? `${unitName(u.id)}${u.spec.spSkill ? `\n${Math.round(u.sp * 100)}` : ''}` : '';
      if (b.textContent !== text) b.textContent = text;
      b.style.whiteSpace = 'pre';
    }
  }

  // ── the loop: the waves stay held, the gauges refill, the slow motion runs, the panel redraws ──
  let raf = 0;
  const frame = (now: number): void => {
    if (waveHeld && sim.phase === 'wave' && sim.stage !== 'between') holdWaves();
    // The lab starts at once: no prep wait before the cats may act.
    if (sim.phase === 'prep') sim.prepTime = 0;
    if (repeat) {
      for (const u of sim.units) {
        if (!u || !u.spec.spSkill || u.sp >= 1) continue;
        const at = refilled.get(u.uid) ?? -Infinity;
        if (now / 1000 - at < REFILL_GAP) continue;
        refilled.set(u.uid, now / 1000);
        api.gauge(u.cell, 1);
      }
    }
    // The battle clock's own slow motion (the one a big hit asks for), renewed every frame while it is chosen.
    if (slow < 1) scene.ctx.slowmo(slow, SLOW_HOLD_MS);
    draw();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  mounted = {
    root,
    stop() {
      cancelAnimationFrame(raf);
      if (!scene.destroyed) holdLab(false);
      root.remove();
      mounted = null;
    },
  };
  // A battle that is left (home, a new battle) takes its panel with it.
  scene.once('destroyed', () => mounted?.root === root && mounted.stop());
}
