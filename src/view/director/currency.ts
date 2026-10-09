/**
 * Fish and purr income as flying icons: coins leave the kill and land on the HUD chip, one tick per
 * arrival climbing the scale. At most 12 fish icons (8 hearts) are in the air at once; the value is
 * split across the icons so a big reward lands as a run of ticks rather than one.
 */
import { flyTo, fxTexture, type FlyHandle, type FlyToOpts } from '@/fx';
import { hasTex, tex } from '@/core/assets';
import type { BattleEvents } from '@/game';
import { FlightLedger, PitchLadder, iconsFor, shareOf } from './policy';
import type { Stage } from './stage';
import { Hue } from '@/fx/palette';
import { Color } from '@/ui/theme';
import { flies, landings } from '@/view/landings';

/** A kill worth at least this much fish (elites, bosses) waits one tick for its death staging to claim it. */
const BIG_KILL = 15;
/** Seconds a big kill may wait for its enemyDie before it flies anyway. */
const CLAIM_WAIT = 0.12;

interface Pending {
  x: number;
  y: number;
  fish: number;
  purr: number;
  at: number;
}

type Kind = 'fish' | 'purr';

/** What a sale paid, held for the one frame it takes the 'sell' event to say where the sticker was sold. */
interface Sale {
  x: number;
  y: number;
  fish: number;
  purr: number;
  at: number;
}

export class CurrencyService {
  private readonly ledgers: Record<Kind, FlightLedger> = { fish: new FlightLedger(12), purr: new FlightLedger(8) };
  private readonly ladders: Record<Kind, PitchLadder> = { fish: new PitchLadder(0.6, 5), purr: new PitchLadder(0.6, 5) };
  private readonly flights: FlyHandle[] = [];
  private pending: Pending | null = null;
  private sale: Sale | null = null;

  constructor(private readonly stage: Stage) {}

  /** Icons in the air right now (fish and hearts). */
  get inFlight(): number {
    return this.ledgers.fish.inFlight + this.ledgers.purr.inFlight;
  }

  onFish(e: BattleEvents['fish']): void {
    if (e.delta <= 0 || !flies(e.reason)) return;
    const ctx = this.stage.ctx;
    const x = e.x !== undefined ? ctx.toSceneX(e.x) : ctx.layout.w / 2;
    const y = e.y !== undefined ? ctx.toSceneY(e.y) : ctx.layout.fieldY + 300;
    if (e.reason === 'sell') {
      this.holdSale(x, y).fish += e.delta;
      return;
    }
    if (e.reason === 'kill' && e.delta >= BIG_KILL) {
      this.pending = { x, y, fish: e.delta, purr: this.pending?.purr ?? 0, at: this.stage.now };
      return;
    }
    this.launch('fish', x, y, e.delta, e.reason, 0);
  }

  onPurr(e: BattleEvents['purr']): void {
    if (e.delta <= 0) return;
    const ctx = this.stage.ctx;
    const x = e.x !== undefined ? ctx.toSceneX(e.x) : ctx.layout.w / 2;
    const y = e.y !== undefined ? ctx.toSceneY(e.y) : ctx.layout.fieldY + 300;
    if (e.reason === 'sell') {
      this.holdSale(x, y).purr += e.delta;
      return;
    }
    if (e.reason === 'boss') {
      // Paid just before the boss's enemyDie: it flies with the rest of the loot.
      const p = this.pending;
      this.pending = { x, y, fish: p?.fish ?? 0, purr: e.delta, at: this.stage.now };
      return;
    }
    this.launch('purr', x, y, e.delta, e.reason, 0);
  }

  /**
   * The death staging of the enemy that paid a big kill takes over its loot and releases it `delay`
   * seconds later, in real time, like the blasts of the finale it follows.
   */
  claimBig(delay: number): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    if (p.fish > 0) this.launch('fish', p.x, p.y, p.fish, 'boss', delay);
    if (p.purr > 0) this.launch('purr', p.x, p.y, p.purr, 'boss', delay);
  }

  /**
   * A sale pays before it announces itself. The sticker may have been dragged off its cell and sold on the strip,
   * so the pay leaves from where the sticker was sold, which only the 'sell' event knows.
   */
  claimSale(x: number, y: number): void {
    const s = this.sale;
    if (!s) return;
    this.sale = null;
    if (s.fish > 0) this.launch('fish', x, y, s.fish, 'sell', 0);
    if (s.purr > 0) this.launch('purr', x, y, s.purr, 'sell', 0);
  }

  private holdSale(x: number, y: number): Sale {
    this.sale ??= { x, y, fish: 0, purr: 0, at: this.stage.now };
    return this.sale;
  }

  update(): void {
    const p = this.pending;
    if (p && this.stage.now - p.at > CLAIM_WAIT) this.claimBig(0);
    const s = this.sale;
    if (s && this.stage.now - s.at > CLAIM_WAIT) this.claimSale(s.x, s.y);
  }

  private launch(kind: Kind, x: number, y: number, total: number, reason: string, delay: number): void {
    const go = (): void => {
      const ledger = this.ledgers[kind];
      const n = ledger.grant(iconsFor(reason, total));
      if (n === 0) {
        // Nothing could be sent (the air is full): the counter must not wait for icons that will never land.
        landings.emit('landed', { kind, amount: total });
        return;
      }
      const ctx = this.stage.ctx;
      const small = reason === 'kill' || reason === 'unit' || reason === 'sell';
      const opts: FlyToOpts = {
        from: { x, y },
        to: ctx.anchor(kind),
        count: n,
        parent: ctx.layers.overlay,
        tweens: ctx.ui,
        onArrive: (i) => {
          ledger.land();
          const share = shareOf(total, n, i);
          landings.emit('landed', { kind, amount: share });
          this.arrive(kind, share, total);
        },
      };
      if (kind === 'fish') {
        if (hasTex('icon_fish')) opts.texture = tex('icon_fish');
        else {
          opts.texture = fxTexture('coin');
          opts.tint = Color.mustard;
        }
        opts.size = small ? 34 : 44;
      } else {
        opts.texture = fxTexture('heart');
        opts.tint = Hue.heart;
        opts.size = 34;
      }
      if (small) {
        opts.burstRadius = [22, 54];
        opts.hang = [0.04, 0.12];
        opts.flight = [0.4, 0.55];
        opts.bulge = [40, 90];
      }
      const h = flyTo(opts);
      this.remember(h);
      if (kind === 'purr') this.stage.play(this.stage.rules.ui, 'purr', 0.5, 1, 0.03);
    };
    if (delay <= 0) go();
    else this.stage.laterReal(delay, go);
  }

  /** One icon landed: a tick that climbs the pentatonic scale while icons keep arriving. */
  private arrive(kind: Kind, share: number, total: number): void {
    const step = this.ladders[kind].next(this.stage.now);
    const loud = total >= 12 ? 0.6 : 0.45;
    if (kind === 'fish') this.stage.playStep(this.stage.rules.coinTick, 'coin', step, loud * (share > 1 ? 1.15 : 1));
    else this.stage.playStep(this.stage.rules.coinTick, 'gem', step, loud);
  }

  private remember(h: FlyHandle): void {
    if (this.flights.length >= 24) {
      let w = 0;
      for (const f of this.flights) if (f.active) this.flights[w++] = f;
      this.flights.length = w;
    }
    this.flights.push(h);
  }

  destroy(): void {
    for (const f of this.flights) f.cancel();
    this.flights.length = 0;
    this.ledgers.fish.reset();
    this.ledgers.purr.reset();
    this.pending = null;
  }
}
