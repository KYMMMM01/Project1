import { hasTex } from '@/core/assets';
import { DISC_KINDS, warmBudget, type DiscKind, type Fx } from '@/fx';
import type { BattleApi } from '@/game';
import type { EnemyViews } from './enemies';
import { spareFor, waveNeeds } from './warmPlan';

/**
 * Keeps what the wave that is coming will build on the field ready in its pools, one piece a frame and never on a slow frame: enough
 * enemy bodies (a dozen sprites each, a wave's first crowd would build them all on the frame it walks in) and a view of each ground
 * area (an aura's ring, a blizzard). The pictures, the baking of the areas and the shader are the scene's warm-up (`src/view/warmup.ts`).
 */
export class FieldWarmup {
  private key = '';
  private want = 0;
  private kinds: readonly DiscKind[] = DISC_KINDS;

  constructor(
    private readonly battle: BattleApi,
    private readonly enemies: EnemyViews,
    private readonly ground: Fx,
  ) {}

  update(dt: number): void {
    const b = this.battle;
    const key = `${b.wave}|${b.phase}`;
    if (key !== this.key) {
      this.key = key;
      const over = b.phase === 'won' || b.phase === 'lost';
      const needs = waveNeeds(over ? [] : b.previewWave(b.wave + 1), hasTex);
      this.want = over ? 0 : spareFor(needs.count);
      this.kinds = [...needs.areas, ...DISC_KINDS.filter((k) => !needs.areas.includes(k))];
    }
    if (warmBudget(dt) <= 0) return;
    if (this.want > 0) this.enemies.spare(this.want);
    for (const kind of this.kinds) if (this.ground.readyArea(kind)) break;
  }
}
