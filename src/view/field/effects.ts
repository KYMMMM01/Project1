import { Color } from '@/ui';
import type { FxRect, ZoneHandle } from '@/fx';
import { CELL_COUNT, CELL_H, CELL_W, cellCenterX, cellCenterY } from '@/game/geometry';
import type { BattleEvents, UnitId, ZoneState } from '@/game/api';
import type { FieldEnv } from './env';

/** The patch of light is mustard paper: warm, flat, and quieter than a cat. */
const SUN_COLOR = Color.mustard;
const NO_HAZARD = 0;
const WET = 1;
const ZAP = 2;

/**
 * Looping ground effects that mirror the simulation board: sunbeam cells, active hazards, zone
 * areas and the laser dot. Each frame compares what the simulation has with what is playing and
 * starts or fades out the difference, so a skipped event can never leave a stale effect behind.
 * Hazard warnings arrive as events (they are not part of the state) and end by themselves.
 */
export class FieldEffects {
  private readonly rects: FxRect[] = [];
  private readonly sun: Array<ZoneHandle | null> = [];
  private readonly hazard: Array<ZoneHandle | null> = [];
  private readonly hazardKind = new Uint8Array(CELL_COUNT);
  private readonly wanted = new Uint8Array(CELL_COUNT);
  private readonly zoneUids: number[] = [];
  private readonly zoneHandles: ZoneHandle[] = [];
  private readonly zoneSeen: boolean[] = [];
  private laser: ZoneHandle | null = null;
  private readonly off: () => void;

  constructor(private readonly env: FieldEnv) {
    for (let c = 0; c < CELL_COUNT; c++) {
      this.rects.push({ x: cellCenterX(c) - CELL_W / 2 + 4, y: cellCenterY(c) - CELL_H / 2 + 4, w: CELL_W - 8, h: CELL_H - 8 });
      this.sun.push(null);
      this.hazard.push(null);
    }
    this.off = env.battle.events.on('hazardWarn', (e) => this.onWarn(e));
  }

  update(): void {
    this.syncSun();
    this.syncHazards();
    this.syncZones();
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
      if (hz) this.wanted[hz.cell] = hz.kind === 'wet' ? WET : ZAP;
    }
    for (let c = 0; c < CELL_COUNT; c++) {
      const want = this.wanted[c] as number;
      const have = this.hazardKind[c] as number;
      const h = this.hazard[c] ?? null;
      if (want === have && (want === NO_HAZARD || h?.alive)) continue;
      h?.stop();
      this.hazard[c] = null;
      this.hazardKind[c] = want;
      if (want === WET) this.hazard[c] = this.env.ground.wetPuddle(this.rects[c] as FxRect);
      else if (want === ZAP) this.hazard[c] = this.env.ground.zapCell(this.rects[c] as FxRect);
    }
  }

  private startZone(z: ZoneState): ZoneHandle {
    const { ground } = this.env;
    switch (zoneKind(z.unitId)) {
      case 'blizzard':
        return ground.blizzardZone(z.x, z.y, z.radius);
      case 'hole':
        return ground.blackHole(z.x, z.y, z.radius);
      case 'potion':
        return ground.potionCloud(z.x, z.y, z.radius);
    }
  }

  private syncZones(): void {
    const zones = this.env.battle.zones;
    this.zoneSeen.length = this.zoneUids.length;
    this.zoneSeen.fill(false);
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i] as ZoneState;
      let at = this.zoneUids.indexOf(z.uid);
      if (at < 0) {
        at = this.zoneUids.length;
        this.zoneUids.push(z.uid);
        this.zoneHandles.push(this.startZone(z));
        this.zoneSeen.push(true);
      }
      this.zoneSeen[at] = true;
    }
    for (let i = this.zoneUids.length - 1; i >= 0; i--) {
      if (this.zoneSeen[i]) continue;
      (this.zoneHandles[i] as ZoneHandle).stop();
      const last = this.zoneUids.length - 1;
      this.zoneUids[i] = this.zoneUids[last] as number;
      this.zoneHandles[i] = this.zoneHandles[last] as ZoneHandle;
      this.zoneSeen[i] = this.zoneSeen[last] as boolean;
      this.zoneUids.pop();
      this.zoneHandles.pop();
      this.zoneSeen.pop();
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
    for (const h of this.sun) h?.stop();
    for (const h of this.hazard) h?.stop();
    for (const h of this.zoneHandles) h.stop();
    this.laser?.stop();
    this.zoneUids.length = 0;
    this.zoneHandles.length = 0;
  }
}

type ZoneLook = 'blizzard' | 'hole' | 'potion';

/** Which looping area a zone-making unit gets: the ice queen's blizzard, the cosmic cat's black hole, the alchemist's cloud. */
function zoneKind(id: UnitId): ZoneLook {
  if (id === 'm_frost') return 'blizzard';
  if (id === 'm_cosmo') return 'hole';
  return 'potion';
}
