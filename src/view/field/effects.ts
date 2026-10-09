import { CELL_ARRIVE_GAP, type AreaHandle, type FxRect, type ZoneHandle } from '@/fx';
import { ENEMY_IDS, enemyDef, enemySpec } from '@/game';
import { CELL_COUNT, CELL_H, CELL_W, cellCenterX, cellCenterY } from '@/game/geometry';
import type { BattleEvents, EnemyId, EnemyState, UnitId, ZoneState } from '@/game/api';
import type { ZoneMark } from './art';
import type { EnemyViews } from './enemies';
import type { FieldEnv } from './env';
import type { Projectiles } from './projectiles';
import { AuraPlan, NO_RING, RING_AND_REACH } from './auraPlan';
import { bodySize, bodyX } from './policy';
import { ringWidth } from './shieldRing';

const NO_HAZARD = 0;
const WET = 1;
const ZAP = 2;

/** Who stands in which area is looked up this often (seconds): the tag stays up for 0.6 s after the last look, so a tenth is more than the eye can tell. */
const TOUCH_EVERY = 0.1;

/** Enemies that carry a ring: the clock's haste and the pill's mending. `radius` is the reach the simulation uses, `size` the drawn body and `diameter` the thin ring that hugs it. */
/** A carrier's reach is only hinted while it is this young (seconds): one that inherits a ring when its neighbour dies does not announce itself again. */
const HINT_WITHIN = 1.5;

interface Carrier {
  mark: 'haste' | 'heal';
  kind: number;
  radius: number;
  size: number;
  diameter: number;
}
const RING_OF: Partial<Record<EnemyId, Carrier>> = {};
for (const id of ENEMY_IDS) {
  const aura = enemySpec(id).aura;
  if (!aura) continue;
  const size = bodySize(enemySpec(id).radius, false);
  RING_OF[id] = { mark: aura.kind, kind: aura.kind === 'haste' ? 0 : 1, radius: aura.radius, size, diameter: ringWidth(size) };
}

/** A set of live handles keyed by a number: the owner looks each one up every frame (which marks it seen) and `sweep` stops those nobody asked for. */
class Roster {
  private readonly keys: number[] = [];
  private readonly handles: AreaHandle[] = [];
  private readonly seen: boolean[] = [];

  /** Start of a frame's pass. */
  begin(): void {
    this.seen.fill(false);
  }

  has(key: number): boolean {
    return this.keys.indexOf(key) >= 0;
  }

  get(key: number): AreaHandle | null {
    const at = this.keys.indexOf(key);
    if (at < 0) return null;
    this.seen[at] = true;
    return this.handles[at] as AreaHandle;
  }

  add(key: number, handle: AreaHandle): void {
    this.keys.push(key);
    this.handles.push(handle);
    this.seen.push(true);
  }

  get size(): number {
    return this.keys.length;
  }

  /** End of the pass: whatever was not looked up leaves. */
  sweep(): void {
    for (let i = this.keys.length - 1; i >= 0; i--) {
      if (this.seen[i]) continue;
      (this.handles[i] as AreaHandle).stop();
      const last = this.keys.length - 1;
      this.keys[i] = this.keys[last] as number;
      this.handles[i] = this.handles[last] as AreaHandle;
      this.seen[i] = this.seen[last] as boolean;
      this.keys.pop();
      this.handles.pop();
      this.seen.pop();
    }
  }

  stopAll(): void {
    for (const h of this.handles) h.stop();
    this.keys.length = 0;
    this.handles.length = 0;
    this.seen.length = 0;
  }
}

/**
 * Looping ground effects that mirror the simulation board: the chapter's special cells, active hazards, zone
 * areas, the rings round haste and healing enemies, and the laser dot. Each frame compares what the simulation has with what is playing and
 * starts or fades out the difference, so a skipped event can never leave a stale effect behind.
 * Hazard warnings arrive as events (they are not part of the state) and end by themselves.
 */
export class FieldEffects {
  private readonly rects: FxRect[] = [];
  private readonly special: Array<ZoneHandle | null> = [];
  private readonly hazard: Array<AreaHandle | null> = [];
  private readonly hazardKind = new Uint8Array(CELL_COUNT);
  private readonly wanted = new Uint8Array(CELL_COUNT);
  /** Seconds left and total of the hazard on each cell (sim time), for the handle's warning. */
  private readonly hazardLeft = new Float32Array(CELL_COUNT);
  private readonly hazardTotal = new Float32Array(CELL_COUNT);
  private readonly zones = new Roster();
  private readonly rings = new Roster();
  private readonly plan = new AuraPlan();
  private readonly carriers: EnemyState[] = [];
  private laser: ZoneHandle | null = null;
  private readonly off: () => void;
  /** Seconds until the next look at who stands in an area. */
  private touchWait = 0;

  constructor(
    private readonly env: FieldEnv,
    private readonly enemies: EnemyViews,
    /** Where a zone's shard, orb or flask is still in the air: its area opens when it lands. */
    private readonly shots: Pick<Projectiles, 'castWait'>,
  ) {
    for (let c = 0; c < CELL_COUNT; c++) {
      this.rects.push({ x: cellCenterX(c) - CELL_W / 2 + 4, y: cellCenterY(c) - CELL_H / 2 + 4, w: CELL_W - 8, h: CELL_H - 8 });
      this.special.push(null);
      this.hazard.push(null);
    }
    this.off = env.battle.events.on('hazardWarn', (e) => this.onWarn(e));
  }

  update(dt: number): void {
    this.touchWait -= dt;
    const look = this.touchWait <= 0;
    if (look) this.touchWait = TOUCH_EVERY;
    this.syncSpecial();
    this.syncHazards();
    this.syncZones(look);
    this.syncRings(look);
    this.syncLaser();
  }

  private onWarn(e: BattleEvents['hazardWarn']): void {
    for (const cell of e.cells) {
      const rect = this.rects[cell];
      if (rect) this.env.ground.hazardWarn(rect, e.kind, { duration: e.delay });
    }
  }

  /**
   * The chapter's special cells: each new one drops in after the one before it, in the order the simulation lists them (the middle of the
   * plus first); the ones that stay between two acts are left alone and the ones that go fade out.
   */
  private syncSpecial(): void {
    const beams = this.env.battle.sunbeams;
    const kind = this.env.battle.specialCell;
    for (let c = 0; c < CELL_COUNT; c++) {
      const h = this.special[c] ?? null;
      if (h && !beams.includes(c)) {
        h.stop();
        this.special[c] = null;
      }
    }
    let fresh = 0;
    for (const c of beams) {
      if (!this.special[c]?.alive) this.special[c] = this.env.ground.specialCell(this.rects[c] as FxRect, kind, { delay: fresh++ * CELL_ARRIVE_GAP });
    }
  }

  private syncHazards(): void {
    const list = this.env.battle.hazards;
    this.wanted.fill(NO_HAZARD);
    for (let i = 0; i < list.length; i++) {
      const hz = list[i];
      if (!hz) continue;
      this.wanted[hz.cell] = hz.kind === 'wet' ? WET : ZAP;
      this.hazardLeft[hz.cell] = hz.timeLeft;
      this.hazardTotal[hz.cell] = hz.duration;
    }
    const speed = Math.max(1, this.env.ctx.speed);
    for (let c = 0; c < CELL_COUNT; c++) {
      const want = this.wanted[c] as number;
      const have = this.hazardKind[c] as number;
      const h = this.hazard[c] ?? null;
      if (want === have && (want === NO_HAZARD || h?.alive)) {
        h?.setLeft((this.hazardLeft[c] as number) / speed, (this.hazardTotal[c] as number) / speed);
        continue;
      }
      h?.stop();
      this.hazard[c] = null;
      this.hazardKind[c] = want;
      if (want === WET) this.hazard[c] = this.env.ground.wetPuddle(this.rects[c] as FxRect);
      else if (want === ZAP) this.hazard[c] = this.env.ground.zapCell(this.rects[c] as FxRect);
    }
  }

  private startZone(z: ZoneState): AreaHandle {
    const { ground } = this.env;
    switch (zoneLook(z.unitId)) {
      case 'frost':
        return ground.blizzardZone(z.x, z.y, z.radius);
      case 'void':
        return ground.blackHole(z.x, z.y, z.radius);
      case 'brew':
        return ground.potionCloud(z.x, z.y, z.radius);
    }
  }

  /** Each live zone gets its area; the area warns before the zone's last second (in real time, so at 3x speed too); enemies inside wear its tag. */
  private syncZones(look: boolean): void {
    const zones = this.env.battle.zones;
    const enemies = this.env.battle.enemies;
    const speed = Math.max(1, this.env.ctx.speed);
    this.zones.begin();
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i] as ZoneState;
      let h = this.zones.get(z.uid);
      if (!h) {
        // The cat's throw is still in the air: the area opens where it lands.
        if (this.shots.castWait(z.uid) > 0) continue;
        h = this.startZone(z);
        this.zones.add(z.uid, h);
      }
      h.setLeft(z.timeLeft / speed, z.duration / speed);
      if (!look) continue;
      const mark = zoneLook(z.unitId);
      for (let k = 0; k < enemies.length; k++) {
        const e = enemies[k] as EnemyState;
        const dx = e.x - z.x;
        const dy = e.y - z.y;
        const reach = z.radius + enemyDef(e.id).radius;
        if (dx * dx + dy * dy <= reach * reach) this.enemies.zoneTouch(e.uid, mark);
      }
    }
    this.zones.sweep();
  }

  /**
   * One thin ring hugging each clock and pill, following it (rings of one kind that would overlap are one: `AuraPlan`); the enemies in
   * reach wear the sticker of what is done to them, and nothing else marks them.
   */
  private syncRings(look: boolean): void {
    const enemies = this.env.battle.enemies;
    const { plan, carriers } = this;
    plan.reset();
    carriers.length = 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i] as EnemyState;
      const ring = RING_OF[e.id];
      if (!ring) continue;
      if (plan.add(ring.kind, bodyX(e.x, ring.size), e.y, ring.diameter, ring.radius, this.rings.has(e.uid)) >= 0) carriers.push(e);
    }
    plan.decide();
    this.rings.begin();
    for (let i = 0; i < carriers.length; i++) {
      const show = plan.show[i] as number;
      if (show === NO_RING) continue;
      const e = carriers[i] as EnemyState;
      const ring = RING_OF[e.id] as Carrier;
      let h = this.rings.get(e.uid);
      if (!h) {
        h = this.env.ground.enemyRing(ring.mark, plan.x[i] as number, e.y, ring.diameter / 2, show === RING_AND_REACH && e.age < HINT_WITHIN ? ring.radius : 0);
        this.rings.add(e.uid, h);
      }
      h.moveTo(plan.x[i] as number, e.y);
    }
    this.rings.sweep();
    if (!look) return;
    for (let i = 0; i < carriers.length; i++) {
      const e = carriers[i] as EnemyState;
      const ring = RING_OF[e.id] as Carrier;
      const reach = ring.radius + 4;
      for (let k = 0; k < enemies.length; k++) {
        const o = enemies[k] as EnemyState;
        if (o === e) continue;
        const dx = o.x - e.x;
        const dy = o.y - e.y;
        if (dx * dx + dy * dy <= reach * reach) this.enemies.zoneTouch(o.uid, ring.mark);
      }
    }
  }

  private syncLaser(): void {
    const l = this.env.battle.laser;
    if (l.active) {
      if (!this.laser?.alive) this.laser = this.env.ctx.fx.laserDot(l.x, l.y, { radius: l.radius });
      else this.laser.moveTo(l.x, l.y);
    } else if (this.laser) {
      this.laser.stop();
      this.laser = null;
    }
  }

  destroy(): void {
    this.off();
    for (const h of this.special) h?.stop();
    for (const h of this.hazard) h?.stop();
    this.zones.stopAll();
    this.rings.stopAll();
    this.laser?.stop();
  }
}

/** Which area a zone-making cat leaves, and so which tag its enemies wear: the ice queen's frost, the cosmic cat's void, the alchemist's brew. */
function zoneLook(id: UnitId): Extract<ZoneMark, 'frost' | 'void' | 'brew'> {
  if (id === 'm_frost') return 'frost';
  if (id === 'm_cosmo') return 'void';
  return 'brew';
}
