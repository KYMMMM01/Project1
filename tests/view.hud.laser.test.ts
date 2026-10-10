import { describe, expect, it } from 'vitest';
import { LASER_COOLDOWN, LASER_DURATION, LASER_VULNERABLE } from '@/game';
import { LASER_TOY, laserFacts, secondsText } from '@/view/hud/laserMath';
import { ARM_HYSTERESIS, followedEnemy, GUIDE_ENEMIES, LaserGuideFlow, PLACE_PATIENCE, ridingArm, SEE_FOR, guideDue, type GuideWorld } from '@/view/hud/laserGuideFlow';
import { CARD_PRESSES, LaserTeach } from '@/view/hud/laserTeach';

const base = { duration: LASER_DURATION, cooldownTotal: LASER_COOLDOWN };

describe('the numbers on the laser card', () => {
  it('read the laser as the battle has it, with the bonus from the rules', () => {
    const f = laserFacts(base, [], {}, undefined);
    expect(f.duration).toBe(LASER_DURATION);
    expect(f.duration).toBe(6.5);
    expect(f.cooldown).toBe(15);
    expect(f.bonusPercent).toBe(Math.round(LASER_VULNERABLE * 100));
    expect(f.bonusPercent).toBe(15);
    expect(f.toy.has).toBe(false);
    expect(f.toy.duration).toBe(2);
    expect(f.toy.cooldownCut).toBe(3);
    expect(f.training.level).toBe(0);
    expect(f.rule).toBe(0);
  });

  it('knows the toy, the training level and the daily rule', () => {
    const f = laserFacts({ duration: 7, cooldownTotal: 12 }, [LASER_TOY], { laser_cd: 4 }, ['long_laser']);
    expect(f.toy.has).toBe(true);
    expect(f.duration).toBe(7);
    expect(f.cooldown).toBe(12);
    expect(f.training.level).toBe(4);
    expect(f.training.cooldownCut).toBeCloseTo(1.2, 5);
    expect(f.training.perLevel).toBeCloseTo(0.3, 5);
    expect(f.rule).toBe(6);
  });

  it('clamps a training level that is out of range', () => {
    expect(laserFacts(base, [], { laser_cd: 99 }, undefined).training.level).toBe(10);
    expect(laserFacts(base, [], { laser_cd: -3 }, undefined).training.level).toBe(0);
  });

  it('prints seconds without a trailing zero', () => {
    expect(secondsText(5)).toBe('5');
    expect(secondsText(6.5)).toBe('6.5');
    expect(secondsText(14.1)).toBe('14.1');
    expect(secondsText(0.30000000000000004)).toBe('0.3');
    expect(secondsText(12.0)).toBe('12');
  });
});

describe('the guided first use', () => {
  const world = (o: Partial<GuideWorld> = {}): GuideWorld => ({ phase: 'wave', enemies: GUIDE_ENEMIES, ready: true, busy: false, ...o });

  it('starts only in a running wave with enemies on the field, a ready laser and nothing else going on', () => {
    expect(guideDue(world())).toBe(true);
    expect(guideDue(world({ phase: 'prep' }))).toBe(false);
    expect(guideDue(world({ enemies: GUIDE_ENEMIES - 1 }))).toBe(false);
    expect(guideDue(world({ ready: false }))).toBe(false);
    expect(guideDue(world({ busy: true }))).toBe(false);
  });

  it('goes press, place, see, done as the player reads the card and puts the dot down', () => {
    const f = new LaserGuideFlow();
    expect(f.step).toBe('wait');
    f.onDot();
    expect(f.step).toBe('wait');
    f.start();
    expect(f.step).toBe('press');
    f.onCardClosed();
    expect(f.step).toBe('place');
    f.onDot();
    expect(f.step).toBe('see');
    expect(f.tick(SEE_FOR - 0.1, false)).toBe(false);
    expect(f.tick(0.2, false)).toBe(true);
    expect(f.done).toBe(true);
  });

  it('is skipped by doing the thing: a dot placed at the first step moves straight on', () => {
    const f = new LaserGuideFlow();
    f.start();
    f.onDot();
    expect(f.step).toBe('see');
  });

  it('gives up on a player who never places the dot, and never waits while a popup holds the clock', () => {
    const f = new LaserGuideFlow();
    f.start();
    f.onCardClosed();
    expect(f.tick(PLACE_PATIENCE * 2, true)).toBe(false);
    expect(f.step).toBe('place');
    expect(f.tick(PLACE_PATIENCE + 0.1, false)).toBe(true);
    expect(f.step).toBe('done');
    // A finished guide ignores everything after it.
    f.onDot();
    f.onCardClosed();
    expect(f.step).toBe('done');
  });

  it('waits at the press step for as long as it takes (the card is what the player is asked to open)', () => {
    const f = new LaserGuideFlow();
    f.start();
    expect(f.tick(1000, false)).toBe(false);
    expect(f.step).toBe('press');
  });
});

describe('what the player has been taught', () => {
  it('opens the card for the first presses only', () => {
    const teach = new LaserTeach(false);
    expect(teach.ready).toBe(true);
    expect(teach.cardDue).toBe(true);
    for (let i = 0; i < CARD_PRESSES; i++) teach.noteOpened();
    expect(teach.cardDue).toBe(false);
    expect(teach.opened).toBe(CARD_PRESSES);
  });

  it('counts a sandbox run as guided unless the debug route asks for the guide', () => {
    expect(new LaserTeach(false).guided).toBe(true);
    const asked = new LaserTeach(false, true);
    expect(asked.guided).toBe(false);
    asked.noteGuided();
    expect(asked.guided).toBe(true);
  });
});

describe('the paw that rides the lane while the dot is asked for', () => {
  const foe = (uid: number, travelled: number): { uid: number; travelled: number } => ({ uid, travelled });

  it('rides the enemy furthest along the loop when it has none yet', () => {
    expect(followedEnemy([foe(1, 120), foe(2, 400), foe(3, 90)], null)?.uid).toBe(2);
    expect(followedEnemy([], null)).toBeNull();
  });

  it('stays with the enemy it rides while that one is on the field, though another has overtaken it (the paw used to cross the lane to the new leader)', () => {
    const field = [foe(1, 300), foe(2, 340)];
    expect(followedEnemy(field, 1)?.uid).toBe(1);
    expect(followedEnemy(field, null)?.uid).toBe(2);
  });

  it('takes the leader again once the enemy it rides is gone', () => {
    expect(followedEnemy([foe(2, 340), foe(3, 90)], 1)?.uid).toBe(2);
  });

  it('keeps the arm it has while the paw rides along the line between two arms, and turns only past the margin', () => {
    const W = 720;
    const H = 1280;
    const line = H * 0.45;
    // coming from above the line the paw stays "lower" until it is clearly below it...
    expect(ridingArm(300, line + 10, W, H, null)).toBe('upperRight');
    expect(ridingArm(300, line + 10, W, H, 'lowerRight')).toBe('lowerRight');
    expect(ridingArm(300, line + ARM_HYSTERESIS + 10, W, H, 'lowerRight')).toBe('upperRight');
    // ...and back, once it is clearly above
    expect(ridingArm(300, line - 10, W, H, 'upperRight')).toBe('upperRight');
    expect(ridingArm(300, line - ARM_HYSTERESIS - 10, W, H, 'upperRight')).toBe('lowerRight');
    // a paw that wobbles about the line never flips
    let arm = ridingArm(300, line - 8, W, H, null);
    const first = arm;
    for (let i = 0; i < 20; i++) arm = ridingArm(300, line + (i % 2 === 0 ? 20 : -20), W, H, arm);
    expect(arm).toBe(first);
    // sideways the same rule holds at the line between left and right
    const side = W * 0.6;
    expect(ridingArm(side + 10, 100, W, H, 'lowerRight')).toBe('lowerRight');
    expect(ridingArm(side + ARM_HYSTERESIS + 10, 100, W, H, 'lowerRight')).toBe('lowerLeft');
  });
});
