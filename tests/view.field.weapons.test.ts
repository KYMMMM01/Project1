import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Texture } from 'pixi.js';

vi.mock('@/fx/textures', () => ({
  ensureFxTextures: () => undefined,
  fxTex: () => ({ texture: Texture.WHITE, w: 64, h: 64, ax: 0.5, ay: 0.5 }),
  fxTexture: () => Texture.WHITE,
  fxVignette: () => Texture.WHITE,
}));

import { Emitter } from '@/core/events';
import { setFxSettings } from '@/fx/settings';
import { ENEMY_IDS, UNIT_IDS, type BattleEvents, type EnemyId, type UnitId } from '@/game/api';
import { WeaponMarks, blowSize, lineLength, slashWidth } from '@/view/field/weaponMarks';
import { isSoft, materialOf, reactionOf } from '@/view/field/reactions';
import { weaponStyle, WEAPON_IDS } from '@/view/weapons';
import type { FieldEnv } from '@/view/field/env';

describe('the weapon table', () => {
  it('covers every cat, with a mark for its blow and a positive weight', () => {
    expect(WEAPON_IDS.slice().sort()).toEqual(UNIT_IDS.slice().sort());
    for (const id of UNIT_IDS) {
      const s = weaponStyle(id);
      expect(s.weight).toBeGreaterThan(0);
      expect(s.impact).toBeTruthy();
      expect(s.lob).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps the hit-stop for a handful of heavy hitters, never for most of the cats', () => {
    const heavy = UNIT_IDS.filter((id) => weaponStyle(id).heavy);
    expect(heavy.sort()).toEqual(['r_gunner', 'w_tiger', 'w_viking']);
    // The light ones are the small weapons.
    for (const id of ['w_paw', 'r_sling', 't_bell', 't_lucky'] as UnitId[]) expect(weaponStyle(id).heavy).toBe(false);
    expect(weaponStyle('w_tiger').weight).toBeGreaterThan(weaponStyle('w_paw').weight);
  });

  it('gives each kind of weapon the mark that fits it', () => {
    expect(weaponStyle('w_sword').swing).toBe('arc');
    expect(weaponStyle('w_samurai').swing).toBe('line');
    expect(weaponStyle('w_tiger').swing).toBe('sweep');
    expect(weaponStyle('w_viking').swing).toBe('chop');
    expect(weaponStyle('r_archer').impact).toBe('arrow');
    expect(weaponStyle('m_snow').impact).toBe('splat');
    expect(weaponStyle('m_fire').impact).toBe('scorch');
    expect(weaponStyle('t_alch').impact).toBe('shatter');
    expect(weaponStyle('t_bard').impact).toBe('notes');
    expect(weaponStyle('t_lucky').impact).toBe('coin');
    expect(weaponStyle('t_bell').impact).toBe('ring');
    expect(weaponStyle('r_gunner').muzzle).toBe('puff');
    // Thrown things fly in an arc; shots that fire straight do not.
    for (const id of ['m_snow', 'm_fire', 't_chef', 't_lucky'] as UnitId[]) expect(weaponStyle(id).lob).toBeGreaterThan(0);
    for (const id of ['r_archer', 'r_gunner', 'r_ninja'] as UnitId[]) expect(weaponStyle(id).lob).toBe(0);
  });
});

describe('how an enemy takes a blow', () => {
  it('knows the material of every enemy, the same one its sound is chosen by', () => {
    for (const id of ENEMY_IDS) expect(reactionOf(materialOf(id))).toBeTruthy();
    expect(materialOf('cucumber')).toBe('juicy');
    expect(materialOf('clock')).toBe('tin');
    expect(materialOf('roomba')).toBe('motor');
    expect(materialOf('balloon')).toBe('rubber');
    expect(materialOf('boss_cloud')).toBe('cloud');
  });

  it('squashes and wobbles soft things, knocks and rattles hard ones', () => {
    const soft = reactionOf(materialOf('cucumber'));
    expect(isSoft(materialOf('cucumber'))).toBe(true);
    expect(soft.sy).toBeLessThan(0.85);
    expect(soft.wobble).toBeGreaterThan(4);
    expect(soft.rattle).toBe(0);
    for (const id of ['clock', 'roomba', 'cone', 'boss_blender'] as EnemyId[]) {
      const hard = reactionOf(materialOf(id));
      expect(isSoft(materialOf(id))).toBe(false);
      expect(hard.rattle).toBeGreaterThan(1);
      expect(hard.sy).toBeGreaterThan(0.95);
    }
    // A motor (a vacuum, a roomba) takes the hardest knock; a balloon the biggest bounce.
    expect(reactionOf('motor').knock).toBeGreaterThan(reactionOf('juicy').knock);
    expect(reactionOf('rubber').ms).toBeGreaterThan(reactionOf('motor').ms);
    // Paper flutters.
    expect(reactionOf('paper').wobble).toBeGreaterThan(reactionOf('juicy').wobble);
  });
});

// ───────────────────────────── the marks ─────────────────────────────

type Events = BattleEvents;

function makeEnv(): { env: FieldEnv; layer: Container; ev: Emitter<Events> } {
  const ev = new Emitter<Events>();
  const art = { projectile: { arrow: Texture.WHITE, note: Texture.WHITE, coin: Texture.WHITE, flask: Texture.WHITE } };
  const env = { battle: { events: ev }, art, ctx: { enemyView: () => null }, time: 0 } as unknown as FieldEnv;
  return { env, layer: new Container(), ev };
}

function count(c: Container): number {
  let n = 1;
  for (const child of c.children) n += count(child as Container);
  return n;
}

const enemy = (id: EnemyId, x = 300, y = 100): Events['hit']['enemy'] =>
  ({ uid: 1, id, x, y, angle: 0, hp: 50, maxHp: 100, shield: 0, maxShield: 0, travelled: 0, slow: 0, stunned: false, frozen: false, burning: false, poisoned: false, bleeding: false, armorBroken: false, vulnerable: false, hasted: false, focused: false, enraged: false, age: 0 }) as Events['hit']['enemy'];

function hit(unitId: UnitId | null, o: Partial<Events['hit']> = {}): Events['hit'] {
  return { enemy: enemy('cucumber'), amount: 10, crit: false, type: 'physical', unitId, dot: null, absorbed: 0, killed: false, ...o };
}

function attack(id: UnitId, cell = 7): Events['attack'] {
  return { unit: { id, cell } as Events['attack']['unit'], targetUid: 1, tx: 300, ty: 100, projectile: null };
}

beforeEach(() => {
  setFxSettings({ reducedMotion: false });
});

function run(marks: WeaponMarks, seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) marks.update(1 / 60);
}

describe('weapon marks', () => {
  it('draws a mark where a cat\'s blow lands, and it is gone within a second', () => {
    const { env, layer, ev } = makeEnv();
    const marks = new WeaponMarks(env, layer);
    ev.emit('attack', attack('w_paw'));
    ev.emit('hit', hit('w_paw'));
    expect(marks.count).toBe(1);
    run(marks, 0.5);
    expect(marks.count).toBe(0);
    marks.destroy();
  });

  it('draws nothing for a damage-over-time tick or a hit with no cat behind it', () => {
    const { env, layer, ev } = makeEnv();
    const marks = new WeaponMarks(env, layer);
    ev.emit('hit', hit('w_paw', { dot: 'burn' }));
    ev.emit('hit', hit(null));
    expect(marks.count).toBe(0);
    marks.destroy();
  });

  it('draws a splash once with its shot, not once for every enemy it hits', () => {
    const { env, layer, ev } = makeEnv();
    const marks = new WeaponMarks(env, layer);
    for (let i = 0; i < 4; i++) ev.emit('hit', hit('m_snow'));
    expect(marks.count).toBe(0);
    ev.emit('projectileEnd', { projectile: { unitId: 'm_snow', angle: 0 } as Events['projectileEnd']['projectile'], x: 300, y: 100, hit: true });
    expect(marks.count).toBe(1);
    ev.emit('projectileEnd', { projectile: { unitId: 'm_fire', angle: 0 } as Events['projectileEnd']['projectile'], x: 300, y: 100, hit: false });
    expect(marks.count).toBe(1);
    marks.destroy();
  });

  it('leaves no mark of its own when a zone opens: the thrown flask, shard or orb lands in the shot layer', () => {
    const { env, layer, ev } = makeEnv();
    const marks = new WeaponMarks(env, layer);
    ev.emit('zoneStart', { zone: { uid: 1, unitId: 't_alch', x: 300, y: 100, radius: 80, timeLeft: 4, duration: 4 } });
    ev.emit('zoneStart', { zone: { uid: 2, unitId: 'm_frost', x: 300, y: 100, radius: 90, timeLeft: 3, duration: 3 } });
    expect(marks.count).toBe(0);
    marks.destroy();
  });

  it('swings: an arc for the sword, a thin line for the katana, a wide sweep for the polearm, a chop for the axe', () => {
    const { env, layer, ev } = makeEnv();
    const marks = new WeaponMarks(env, layer);
    for (const id of ['w_sword', 'w_samurai', 'w_tiger'] as UnitId[]) {
      ev.emit('attack', attack(id));
      ev.emit('strike', { unitId: id, relic: null, x: 300, y: 100, radius: 90, points: [] });
    }
    expect(marks.count).toBe(3);
    run(marks, 0.5);
    ev.emit('attack', attack('w_viking'));
    expect(marks.count).toBe(1);
    // The cork gun's smoke leaves the muzzle.
    ev.emit('attack', attack('r_gunner'));
    expect(marks.count).toBe(2);
    marks.destroy();
  });

  it('a swing is brief, under 0.18 s: the arc of a sword, the line of a katana and the sweep of a polearm are gone before the enemies are hidden for long', () => {
    for (const id of ['w_sword', 'w_samurai', 'w_tiger'] as UnitId[]) {
      const { env, layer, ev } = makeEnv();
      const marks = new WeaponMarks(env, layer);
      ev.emit('attack', attack(id));
      ev.emit('strike', { unitId: id, relic: null, x: 300, y: 100, radius: 110, points: [] });
      expect(marks.count, id).toBe(1);
      run(marks, 0.17);
      expect(marks.count, id).toBe(0);
      marks.destroy();
    }
  });

  it('the swing of a weapon is as wide as the weapon reaches, never more than a lane and a little, and the burst of a blow about the size of the enemy', () => {
    // The sword cleaves 70 px, the polearm stomps 110 px: the crescent follows, and stops at about the width of the lane (82 px).
    expect(slashWidth(70)).toBeCloseTo(66.5, 5);
    expect(slashWidth(110)).toBeLessThanOrEqual(92);
    expect(slashWidth(110)).toBeGreaterThan(slashWidth(70));
    expect(slashWidth(500)).toBeLessThanOrEqual(92);
    expect(slashWidth(5)).toBeGreaterThanOrEqual(48);
    // The katana's line is as long as the stretch it cuts, and a long reach does not make it a wall.
    expect(lineLength(110)).toBe(110);
    expect(lineLength(400)).toBeLessThanOrEqual(120);
    expect(lineLength(10)).toBeGreaterThanOrEqual(70);
    // A heavy weapon, a crit and a boss only add a little to a burst: never more than 30 % over the picture's own size.
    for (const weight of [0.6, 1, 1.4, 1.7]) {
      for (const crit of [false, true]) for (const big of [false, true]) expect(blowSize(weight, crit, big)).toBeLessThanOrEqual(1.3);
    }
    expect(blowSize(1, false, false)).toBe(1);
    expect(blowSize(0.7, true, true)).toBeGreaterThan(0.7);
  });

  it('is pooled: thousands of blows build no more than the cap, and nothing is created while it runs', () => {
    const { env, layer, ev } = makeEnv();
    const marks = new WeaponMarks(env, layer);
    // A crowded moment: forty blows in one frame.
    for (let i = 0; i < 40; i++) ev.emit('hit', hit('w_viking'));
    expect(marks.count).toBeLessThanOrEqual(8);
    marks.update(1 / 60);
    for (let i = 0; i < 40; i++) ev.emit('hit', hit('w_viking'));
    const built = count(layer);
    for (let round = 0; round < 60; round++) {
      for (let i = 0; i < 12; i++) ev.emit('hit', hit(UNIT_IDS[(round + i) % UNIT_IDS.length] as UnitId));
      for (let f = 0; f < 6; f++) marks.update(1 / 60);
      expect(marks.count).toBeLessThanOrEqual(22);
    }
    expect(count(layer)).toBeLessThanOrEqual(22 * 6 + 1);
    expect(count(layer)).toBeGreaterThanOrEqual(built);
    marks.destroy();
  });

  it('keeps the weighty blows readable when it is busy: light marks give way, heavy ones do not', () => {
    const { env, layer, ev } = makeEnv();
    const marks = new WeaponMarks(env, layer);
    // Fill past the busy line with long-lived notes (spread over frames, the per-frame limit applies).
    for (let f = 0; f < 4; f++) {
      for (let i = 0; i < 5; i++) ev.emit('hit', hit('t_bard'));
      marks.update(1 / 60);
    }
    const busy = marks.count;
    expect(busy).toBeGreaterThanOrEqual(14);
    ev.emit('hit', hit('w_paw'));
    expect(marks.count).toBe(busy);
    ev.emit('hit', hit('w_tiger'));
    expect(marks.count).toBe(busy + 1);
    marks.destroy();
  });

  it('runs under reduced motion', () => {
    setFxSettings({ reducedMotion: true });
    const { env, layer, ev } = makeEnv();
    const marks = new WeaponMarks(env, layer);
    for (const id of UNIT_IDS) {
      ev.emit('attack', attack(id));
      ev.emit('hit', hit(id));
      run(marks, 0.1);
    }
    run(marks, 1.2);
    expect(marks.count).toBe(0);
    marks.destroy();
  });
});
