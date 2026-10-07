import { Color } from '@/ui';
import type { AreaHandle, FxRect, ZoneHandle } from '@/fx';
import { ENEMY_IDS, enemyDef, enemySpec } from '@/game';
import { CELL_COUNT, CELL_H, CELL_W, cellCenterX, cellCenterY } from '@/game/geometry';
import type { BattleEvents, EnemyId, EnemyState, UnitId, ZoneState } from '@/game/api';
import type { ZoneMark } from './art';
import type { EnemyViews } from './enemies';
import type { FieldEnv } from './env';

/** The patch of light is mustard paper: warm, flat, and quieter than a cat. */
const SUN_COLOR = Color.mustard;
const NO_HAZARD = 0;
const WET = 1;
const ZAP = 2;

/** Who stands in which area is looked up this often (seconds): the tag stays up for 0.6 s after the last look, so a tenth is more than the eye can tell. */
const TOUCH_EVERY = 0.1;

/** At most this many enemy rings are drawn at once: a wave of clocks would otherwise be a field of overlapping circles. */
const MAX_RINGS = 4;

/** Enemies that carry a ring: the clock's haste and the pill's mending, with the reach the simulation uses. */
const RING_OF: Partial<Record<EnemyId, { mark: 'haste' | 'heal'; radius: number }>> = {};
for (const id of ENEMY_IDS) {
  const aura = enemySpec(id).aura;
  if (aura) RING_OF[id] = { mark: aura.kind, radius: aura.radius };
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
 * Looping ground effects that mirror the simulation board: sunbeam cells, active hazards, zone
 * areas, the rings round haste and healing enemies, and the laser dot. Each frame compares what the simulation has with what is playing and
 * starts or fades out the difference, so a skipped event can never leave a stale effect behind.
 * Hazard warnings arrive as events (they are not part of the state) and end by themselves.
 */
export class FieldEffects {
  private readonly rects: FxRect[] = [];
  private readonly sun: Array<ZoneHandle | null> = [];
  private readonly hazard: Array<AreaHandle | null> = [];
  private readonly hazardKind = new Uint8Array(CELL_COUNT);
  private readonly wanted = new Uint8Array(CELL_COUNT);
  /** Seconds left and total of the hazard on each cell (sim time), for the handle's warning. */
  private readonly hazardLeft = new Float32Array(CELL_COUNT);
  private readonly hazardTotal = new Float32Array(CELL_COUNT);
  private readonly zones = new Roster();
  private readonly rings = new Roster();
  private laser: ZoneHandle | null = null;
  private readonly off: () => void;
  /** Seconds until the next look at who stands in an area. */
  private touchWait = 0;

  constructor(
    private readonly env: FieldEnv,
    private readonly enemies: EnemyViews,
  ) {
    for (let c = 0; c < CELL_COUNT; c++) {
      this.rects.push({ x: cellCenterX(c) - CELL_W / 2 + 4, y: cellCenterY(c) - CELL_H / 2 + 4, w: CELL_W - 8, h: CELL_H - 8 });
      this.sun.push(null);
      this.hazard.push(null);
    }
    this.off = env.battle.events.on('hazardWarn', (e) => this.onWarn(e));
  }

  update(dt: number): void {
    this.touchWait -= dt;
    const look = this.touchWait <= 0;
    if (look) this.touchWait = TOUCH_EVERY;
    this.syncSun();
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

  private syncSun(): void {
    const beams = this.env.battle.sunbeams;
    for (let c = 0; c < CELL_COUNT; c++) {
      const want = beams.includes(c);
      const h = this.sun[c] ?? null;
      if (want && !h?.alive) this.sun[c] = this.env.ground.sunbeamCell(this.rects[c] as FxRect, { color: SUN_COLOR });
      else if (!want && h) {
        h.stop();
        this.sun[c] = null;
      }
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

  /** A ring round each clock and pill (the first few), following it; enemies inside it wear the ring's tag. */
  private syncRings(look: boolean): void {
    const enemies = this.env.battle.enemies;
    this.rings.begin();
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i] as EnemyState;
      const ring = RING_OF[e.id];
      if (!ring) continue;
      let h = this.rings.get(e.uid);
      if (!h) {
        if (this.rings.size >= MAX_RINGS) continue;
        h = this.env.ground.enemyRing(ring.mark, e.x, e.y, ring.radius);
        this.rings.add(e.uid, h);
      }
      h.moveTo(e.x, e.y);
      if (!look) continue;
      const reach = ring.radius + 4;
      for (let k = 0; k < enemies.length; k++) {
        const o = enemies[k] as EnemyState;
        if (o === e) continue;
        const dx = o.x - e.x;
        const dy = o.y - e.y;
        if (dx * dx + dy * dy <= reach * reach) this.enemies.zoneTouch(o.uid, ring.mark);
      }
    }
    this.rings.sweep();
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
    for (const h of this.sun) h?.stop();
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
