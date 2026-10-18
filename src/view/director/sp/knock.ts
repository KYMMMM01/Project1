/**
 * Knock It Off!, the frost queen's scene (docs/design_skills_v2.md 3.8): the queen stares straight at us, pushes a glass off the edge with one
 * paw, it breaks where the chilled enemies are thickest and a shard flies into every chilled enemy within reach: a slowed one cracks, a frozen one
 * shatters out of its ice, and the chill is gone from them.
 *
 * THE SIMULATION IS EARLY. It does the whole of a cast in the tick of the `spCast`: it announces the cast FIRST (while the scene hears it the shard
 * enemies are still on the field and still chilled: the scene reads them in that window, a test pins the order), then the damage is dealt, the `hit`s are
 * sent and the chill is spent (an enemy that survived has `slow` 0 and `frozen` false) before the picture has got anywhere. So the picture keeps up the
 * pretence for the half second the glass needs:
 *   - every shard's enemy keeps wearing its ice (a block for a frozen one, a frost coat and the snowflake sticker for a slowed one) from the cast
 *     tick until its shard lands (`Ice`; the enemy's own tint and sticker are gone at once, so this is what the player sees);
 *   - its damage number waits for the shard (`numberHold.ts`: the combat director asks before it shows any number, the scene releases them);
 *   - an enemy the shard kills was killed by the simulation in that same tick, and its ordinary death staging (the director's puff, the fish
 *     flying to the counter, the field's shrinking body) cannot be held back: so the frame after the cast its ice takes the enemy's own picture
 *     (tinted pale) as a frozen STATUE, which stands until the shard shatters it. The reward and the puff come early; the number and the break
 *     come with the shard. (In the common case, ordinary enemies against a queen's 3 to 5 D, this is what the player sees.)
 *
 * Moment by moment (1x; one clock `T` for the throw, the battle's clock with a floor in real seconds, `span.ts`):
 *   0.00  a pair of deadpan half-lidded eyes in a bubble over the queen's head (she stares at us) and the glass appears on the edge of her tile,
 *         on the side of the impact;
 *   0.10  one paw reaches out from the tile ... 0.18 TOCK: it pushes, the glass tips (a small tap), the paw withdraws;
 *   0.20  the glass tumbles through the air to the impact in a high arc (0.24 to 0.42 s by the distance), its shadow growing on the ground there;
 *   +F    it breaks: a cold burst, a crack star on the floor, a ring that runs out to the reach of the shards, a nudge; the glass's pieces fly:
 *   +0.03 per enemy, nearest first, a painted ice shard flies from the impact to each shard's enemy (0.14 to 0.26 s), homing on where it is;
 *         each shard LANDS: the ice breaks (a frozen enemy: a big flat star, crystals and a ring; a slowed one: a small star and a few chips),
 *         the sticker goes, and the number the enemy was holding is shown.
 *
 * Pictures are painted in code (`knockArt.ts`) or the game's own (`shot_ice`, the flat star, the atlas's crystals). The pieces are pooled (3
 * throws, 22 shards with their ice, 3 crack stars); the sparks and chips are the particle pool's (priority 1), the quality tier thins them
 * and caps the shards (8, 14, 22); reduced motion: the glass appears where it breaks, the shards do not fly, nothing shakes or tumbles.
 * A defeat or a victory cuts everything off, shows the numbers it was holding and leaves nothing on the field.
 */
import { Container, Sprite } from 'pixi.js';
import { tex } from '@/core/assets';
import { TAU, lighten, mixColor } from '@/core/math';
import { Ease } from '@/core/tween';
import { Trauma, fxTex, type EmitDef } from '@/fx';
import { Hue } from '@/fx/palette';
import { paint } from '@/fx/paint';
import type { EnemyState, SpKnockShard } from '@/game';
import { FIELD_W } from '@/game/geometry';
import { bodyX, barWidth } from '../../field/policy';
import { enemyTextureKey } from '../../field/enemyView';
import { fieldArt } from '../../field/art';
import { BLOCK_SIZE, knockArt, type KnockArt } from '../../knockArt';
import { Gate, enemyInfo } from '../stage';
import { numberHoldsOf, type NumberHolds } from './numberHold';
import { Piece, Pieces, SpritePiece } from './runPieces';
import { NIGHT_LABEL, type SpCastOf, type SpEnv, type SpScene, type SpSceneFactory } from './types';

/** The throw's moments, in seconds of its own clock `T` (battle seconds at 1x). */
const STARE_END = 0.26;
const PAW_OUT = 0.1;
const PAW_TAP = 0.18;
const PAW_BACK = 0.3;
const LAUNCH = 0.2;
/** The glass's flight: by the distance, between these (seconds), and how high its arc goes (px, by the distance). */
const FLIGHT_MIN = 0.24;
const FLIGHT_MAX = 0.42;
const FLIGHT_SPEED = 1000;
/** The throw's real floor in seconds (the whole of it): at 3x it is not shorter than this. */
const THROW_FLOOR = 0.42;
/** A shard's flight by the distance (seconds), the gap between two shards' starts, and the longest the last one waits. */
const SHARD_MIN = 0.14;
const SHARD_MAX = 0.26;
const SHARD_SPEED = 1100;
const SHARD_GAP = 0.03;
const SHARD_WAIT_MAX = 0.18;
/** A shard's real floor is this share of its own battle life, so that at 3x it is at most twice as fast as at 1x. */
const SHARD_FLOOR = 0.5;
/** The crack star on the floor: battle seconds and real floor. */
const CRACK_LIFE: readonly [number, number] = [0.8, 0.5];
/** Shards (each with its ice) by quality tier (low, mid, high), and throws and cracks alive at once. */
const SHARDS_MAX = [8, 14, 22] as const;
const SHARD_POOL = 22;
const THROWS = 3;
const CRACKS = 3;
/** How big the glass is drawn and how far from the queen's middle it sits (on the side of the impact). */
const GLASS_SIZE = 1.25;
const EDGE = { x: 40, y: 22 } as const;

const CHILL_CRYSTAL: EmitDef = {
  tex: 'crystal', prio: 1, count: 5, life: [0.5, 0.8], speed: [140, 340], gravity: 760, drag: 1.1, size: [18, 30], sizeEnd: [10, 18], spin: [-6, 6],
  rot: [0, TAU], colors: [Hue.cream, Hue.iceLight, Hue.ice], alpha: 0.95, fadeIn: 0, fadeOut: 0.4,
};
const CHILL_SHARD: EmitDef = {
  tex: 'shard', prio: 1, count: 7, life: [0.4, 0.7], speed: [160, 420], gravity: 820, drag: 0.8, size: [10, 18], sizeEnd: [5, 9], spin: [-10, 10],
  rot: [0, TAU], colors: [Hue.cream, Hue.iceLight, Hue.ice], fadeIn: 0, fadeOut: 0.4,
};
const CRACK_CHIPS: EmitDef = {
  tex: 'shard', prio: 1, count: 3, life: [0.3, 0.5], speed: [70, 170], gravity: 520, drag: 1, size: [9, 14], sizeEnd: [4, 7], spin: [-8, 8], rot: [0, TAU],
  colors: [Hue.cream, Hue.iceLight], fadeIn: 0, fadeOut: 0.4,
};
const LAND_RING: EmitDef = {
  tex: 'ring', prio: 1, count: 1, life: 0.26, size: 14, sizeEnd: 74, sizeEase: Ease.cubicOut, colors: [Hue.cream, Hue.ice], alpha: 0.85, fadeIn: 0, fadeOut: 0.7,
};
const GLASS_GLINT: EmitDef = {
  tex: 'sparkle', prio: 1, count: 6, life: [0.35, 0.6], speed: [60, 200], drag: 2.4, size: [14, 24], sizeEnd: [4, 8], spin: [-3, 3], rot: [0, TAU],
  colors: [Hue.cream, Hue.iceLight], fadeIn: 0.1, fadeOut: 0.5,
};
/** The ring that runs out from the impact to the reach of the shards (faint: it says why a far enemy was hit too). */
const REACH_RING: EmitDef = {
  tex: 'auraReach', prio: 1, count: 1, life: 0.4, size: 40, sizeEnd: 200, sizeEase: Ease.cubicOut, rot: [0, TAU], colors: [Hue.ice], alpha: 0.85, fadeIn: 0, fadeOut: 0.7,
};
/** The dotted ring's circle is 240 of its 256 px: a burst scaled by this reaches `radius` px from the impact. */
const reachScale = (radius: number): number => (radius * 2 * 256) / 240 / 200;

interface Spot {
  x: number;
  y: number;
}

/** The ice an enemy wears from the cast to its shard: a block or a frost coat, and the sticker of its chill. */
class Ice extends Piece {
  readonly root = new Container();
  /** The enemy itself, frozen in its ice: shown only when the enemy has died in the cast's own tick (its ordinary death is already over). */
  readonly statue = new Sprite();
  readonly crust: Sprite;
  readonly sticker: Sprite;
  enemy: EnemyState | null = null;
  frozen = false;
  statued = false;
  /** Drawn place and size (QA and tests). */
  x = 0;
  y = 0;
  size = 56;
  constructor(parent: Container, art: KnockArt, under: (n: Container) => void) {
    super();
    this.crust = new Sprite(art.block);
    this.crust.anchor.set(0.5);
    this.sticker = new Sprite(fieldArt().status.freeze);
    this.sticker.anchor.set(0.5);
    this.statue.anchor.set(0.5);
    this.statue.visible = false;
    this.root.addChild(this.statue, this.crust, this.sticker);
    this.root.eventMode = 'none';
    this.root.visible = false;
    parent.addChild(this.root);
    under(this.root);
  }
  hide(): void {
    this.on = false;
    this.root.visible = false;
    this.statue.visible = false;
    this.statued = false;
    this.enemy = null;
  }
  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/** A shard on its way: a painted ice crystal from the impact to an enemy, and the ice it will break. */
class Shard extends SpritePiece {
  uid = 0;
  frozen = false;
  enemy: EnemyState | null = null;
  ice: Ice | null = null;
  fromX = 0;
  fromY = 0;
  /** Battle seconds before it starts to fly, and how long it flies. */
  delay = 0;
  flight = 0.2;
  landed = false;
  /** Where it is drawn (QA and tests). */
  x = 0;
  y = 0;
  seq = 0;
}

/** The crack star the glass leaves on the floor. */
class Crack extends SpritePiece {}

/** One glass: its throw. */
class Throw extends Piece {
  readonly glass: Sprite;
  readonly paw: Sprite;
  readonly stare: Sprite;
  readonly shadow: Sprite;
  /** The queen's tile, the glass's start on its edge, and the impact. */
  qx = 0;
  qy = 0;
  gx = 0;
  gy = 0;
  ix = 0;
  iy = 0;
  /** Which way the glass tips and the angle from the queen to the impact. */
  dir = 1;
  ang = 0;
  /** Length of the throw (battle seconds on `T`): LAUNCH + the flight. */
  len = 0.5;
  flight = 0.3;
  arc = 80;
  radius = 260;
  plan: Array<{ shard: SpKnockShard; en: EnemyState | null; ice: Ice | null }> = [];
  broken = false;
  /** The throw clock `T` this frame (QA and tests). */
  t = 0;

  constructor(parent: Container, art: KnockArt, under: (n: Container) => void) {
    super();
    this.glass = new Sprite(art.glass);
    this.paw = new Sprite(art.paw);
    this.stare = new Sprite(art.stare);
    this.shadow = new Sprite(fxTex('disc').texture);
    this.glass.anchor.set(0.5);
    this.paw.anchor.set(0.7, 0.5);
    this.stare.anchor.set(0.5, 1);
    this.shadow.anchor.set(0.5);
    this.shadow.tint = Hue.shadow;
    for (const s of [this.shadow, this.glass, this.paw, this.stare]) {
      s.eventMode = 'none';
      s.visible = false;
      parent.addChild(s);
      under(s);
    }
  }

  hide(): void {
    this.on = false;
    for (const s of [this.shadow, this.glass, this.paw, this.stare]) s.visible = false;
    for (const p of this.plan) p.ice = null;
    this.plan.length = 0;
  }

  destroy(): void {
    for (const s of [this.shadow, this.glass, this.paw, this.stare]) s.destroy();
  }
}

class KnockScene implements SpScene<'knock'> {
  private readonly front: Container;
  private readonly back: Container;
  private readonly holds: NumberHolds;
  private art: KnockArt | null = null;
  private readonly throws: Pieces<Throw>;
  private readonly shards: Pieces<Shard>;
  private readonly ices: Pieces<Ice>;
  private readonly cracks: Pieces<Crack>;
  private seq = 0;
  private readonly spot: Spot = { x: 0, y: 0 };

  constructor(private readonly env: SpEnv) {
    this.front = env.ctx.layers.fxFront;
    this.back = env.ctx.layers.fxBack;
    this.holds = numberHoldsOf(env.battle);
    this.throws = new Pieces<Throw>(() => new Throw(this.front, this.artOf(), (n) => this.under(n)), THROWS);
    this.shards = new Pieces<Shard>(() => {
      const s = new Shard(this.front, paint('shot_ice'));
      this.under(s.sprite);
      return s;
    }, SHARD_POOL);
    this.ices = new Pieces<Ice>(() => new Ice(this.front, this.artOf(), (n) => this.under(n)), SHARD_POOL);
    this.cracks = new Pieces<Crack>(() => {
      const c = new Crack(this.back, this.artOf().crack);
      return c;
    }, CRACKS);
  }

  private artOf(): KnockArt {
    this.art ??= knockArt();
    return this.art;
  }

  /** Put a picture of this scene just above the star archer's night (when it is there) and under the particles, numbers and everything else of the front layer. */
  private under(node: Container | Sprite): void {
    const night = this.front.getChildByLabel(NIGHT_LABEL);
    this.front.addChildAt(node, night ? this.front.getChildIndex(night) + 1 : 0);
  }

  // ── the cast ──

  cast(e: SpCastOf<'knock'>): void {
    const { stage, battle } = this.env;
    const d = e.data;
    const calm = stage.reduced;
    const max = SHARDS_MAX[stage.detail];
    // Every glass in the air has ice and held numbers waiting for it: when all the throws are busy the oldest breaks now instead of being dropped.
    if (this.throws.live >= THROWS) {
      let oldest: Throw | null = null;
      for (const o of this.throws.list) if (o.on && (!oldest || o.age.real > oldest.age.real)) oldest = o;
      if (oldest) {
        if (!oldest.broken) this.breakGlass(oldest);
        oldest.hide();
      }
    }
    const t = this.throws.take();
    t.broken = false;
    t.qx = e.x;
    t.qy = e.y;
    t.ix = d.impactX;
    t.iy = d.impactY;
    t.radius = d.radius;
    t.ang = Math.atan2(t.iy - t.qy, t.ix - t.qx);
    t.dir = Math.cos(t.ang) >= 0 ? 1 : -1;
    // The glass sits on the edge of the tile on the side of the impact.
    t.gx = t.qx + Math.cos(t.ang) * EDGE.x;
    t.gy = t.qy - 8 + Math.sin(t.ang) * EDGE.y;
    const dist = Math.hypot(t.ix - t.gx, t.iy - t.gy);
    t.flight = calm ? 0.1 : Math.min(FLIGHT_MAX, Math.max(FLIGHT_MIN, dist / FLIGHT_SPEED));
    t.arc = Math.min(110, Math.max(50, dist * 0.25));
    t.len = (calm ? STARE_END : LAUNCH) + t.flight;
    t.start(t.len, THROW_FLOOR);

    // The ice and the held numbers: from this tick (the enemies' own chill is already gone) until each shard lands.
    t.plan.length = 0;
    // At the tier's limit the frozen ones keep their ice first (they shatter, the dramatic half), then the rest in the cast's order.
    const keep = new Set<number>();
    if (d.shards.length <= max) for (let i = 0; i < d.shards.length; i++) keep.add(i);
    else {
      const order = d.shards.map((_, i) => i).sort((a, b) => Number((d.shards[b] as SpKnockShard).frozen) - Number((d.shards[a] as SpKnockShard).frozen) || a - b);
      for (let i = 0; i < max; i++) keep.add(order[i] as number);
    }
    for (let i = 0; i < d.shards.length; i++) {
      const shard = d.shards[i] as SpKnockShard;
      const en = keep.has(i) ? this.find(shard.uid) : null;
      const ice = en ? this.wear(en, shard.frozen) : null;
      if (en && ice) this.holds.hold(en.uid, battle.time);
      t.plan.push({ shard, en, ice });
    }

    this.dress(t);
    this.pose(t, 0);
    stage.play(stage.rules.zone, 'place', 0.45, 1.7, 0.05);
  }

  /** Put ice on `en`: the picture of the chill it had. */
  private wear(en: EnemyState, frozen: boolean): Ice | null {
    // No ice is ever taken over (its enemy is holding a number for it): at the tier's limit the rest of the shards simply have none.
    if (this.ices.live >= SHARDS_MAX[this.env.stage.detail]) return null;
    const ice = this.ices.take();
    ice.start(10, 10);
    ice.enemy = en;
    ice.frozen = frozen;
    ice.statue.visible = false;
    ice.statued = false;
    const art = this.artOf();
    const info = enemyInfo(en.id);
    ice.size = info.size;
    ice.crust.texture = frozen ? art.block : art.frost;
    // A block is narrower than it is tall (a packed row of them must not run into a tube); the frost coat is round.
    const w = info.size * (frozen ? 0.96 : 1.1);
    const hgt = info.size * (frozen ? 1.2 : 1.1);
    ice.crust.scale.set(w / BLOCK_SIZE, hgt / BLOCK_SIZE);
    ice.crust.alpha = frozen ? 0.8 : 0.95;
    ice.sticker.texture = frozen ? fieldArt().status.freeze : fieldArt().status.slow;
    ice.sticker.position.set(barWidth(info.size) / 2 + 8, -info.size * 0.56 - 12);
    ice.root.visible = true;
    this.follow(ice);
    return ice;
  }

  /** The ice rides its enemy: the enemy's drawn place (a dead enemy's last place), the way its own picture is drawn. */
  private follow(ice: Ice): void {
    const en = ice.enemy;
    if (!en) return;
    ice.x = bodyX(en.x, ice.size);
    ice.y = en.y;
    ice.root.position.set(ice.x, ice.y);
    // The simulation kills in the cast's own tick, a half second before the shard: the enemy's own picture is on its way out (and the
    // director has shown its death), so the ice keeps the enemy as a frozen statue until the shard shatters it.
    if (!ice.statued && en.hp <= 0) this.statue(ice, en);
  }

  private statue(ice: Ice, en: EnemyState): void {
    ice.statued = true;
    const texture = tex(enemyTextureKey(en.id));
    const st = ice.statue;
    st.texture = texture;
    const k = ice.size / Math.max(texture.width, texture.height, 1);
    st.scale.set(k * (Math.cos(en.angle) < 0 ? -1 : 1), k);
    st.tint = mixColor(0xffffff, Hue.ice, 0.5);
    st.visible = true;
  }

  /** Give the throw's pictures their textures and hide what is not yet there. */
  private dress(t: Throw): void {
    const art = this.artOf();
    t.glass.texture = art.glass;
    t.glass.scale.set(GLASS_SIZE);
    t.glass.rotation = 0;
    t.glass.alpha = 1;
    t.glass.position.set(t.gx, t.gy);
    t.paw.rotation = t.ang;
    t.paw.scale.set(1.1);
    t.stare.position.set(Math.max(34, Math.min(FIELD_W - 34, t.qx - 34 * t.dir)), t.qy - 54);
    t.stare.scale.set(0);
    t.shadow.visible = false;
    t.glass.visible = false;
    t.paw.visible = false;
    t.stare.visible = false;
  }

  // ── the frame ──

  update(dt: number, battleDt: number): void {
    const { stage, battle } = this.env;
    this.holds.sweep(battle.time);
    const calm = stage.reduced;
    for (const t of this.throws.list) {
      if (!t.on) continue;
      t.age.tick(battleDt, dt);
      const k = t.k();
      t.t = k * t.len;
      if (t.t >= t.len - 1e-9 || k >= 1) {
        if (!t.broken) this.breakGlass(t);
        t.hide();
        continue;
      }
      this.pose(t, t.t);
    }
    for (const s of this.shards.list) {
      if (!s.on) continue;
      s.age.tick(battleDt, dt);
      const k = s.k();
      const t = k * s.life;
      if (t < s.delay) {
        s.sprite.visible = false;
        if (s.ice) this.follow(s.ice);
        continue;
      }
      const f = (t - s.delay) / s.flight;
      if (f >= 1 || k >= 1) {
        this.land(s);
        continue;
      }
      this.fly(s, f, calm);
    }
    for (const ice of this.ices.list) if (ice.on) this.follow(ice);
    this.cracks.update(battleDt, dt, this.paintCrack);
  }

  private readonly paintCrack = (c: Crack, k: number): void => {
    c.sprite.alpha = 0.9 * (1 - Ease.cubicIn(k));
  };

  /** The glass's pictures at throw time `T`. */
  private pose(t: Throw, T: number): void {
    const calm = this.env.stage.reduced;
    // The stare: a bubble that pops over the queen's head, holds and goes.
    const stare = T < STARE_END;
    t.stare.visible = stare;
    if (stare) {
      const pop = calm ? 1 : Ease.backOut(Math.min(1, T / 0.07));
      const out = Math.max(0, (T - (STARE_END - 0.07)) / 0.07);
      t.stare.scale.set(1.0 * pop * (1 - 0.3 * out));
      t.stare.alpha = 1 - out;
    }
    if (calm) {
      // Reduced motion: no paw, no flight; the glass is simply there where it breaks.
      t.glass.visible = T >= STARE_END;
      t.glass.position.set(t.ix, t.iy - 6);
      t.glass.alpha = Math.min(1, (T - STARE_END) / 0.05);
      return;
    }
    if (T < LAUNCH) {
      // On the edge: it pops in, the paw comes out, TOCK, it tips.
      const pop = Ease.backOut(Math.min(1, T / 0.1));
      t.glass.visible = true;
      t.glass.scale.set(GLASS_SIZE * Math.max(0.01, pop));
      t.glass.position.set(t.gx, t.gy);
      const tip = Ease.cubicOut(Math.max(0, Math.min(1, (T - PAW_TAP) / 0.04)));
      t.glass.rotation = t.dir * 0.5 * tip + (T > PAW_OUT && T < PAW_TAP ? 0.05 * Math.sin(T * 120) : 0);
      t.glass.anchor.set(0.5, 0.9);
      t.paw.visible = T >= PAW_OUT && T < PAW_BACK;
      if (t.paw.visible) {
        const reach = T < PAW_TAP ? Ease.cubicIn((T - PAW_OUT) / (PAW_TAP - PAW_OUT)) : 1 - Ease.cubicOut((T - PAW_TAP) / (PAW_BACK - PAW_TAP));
        const back = 38 - 22 * Math.max(0, Math.min(1, reach));
        t.paw.position.set(t.gx - Math.cos(t.ang) * back, t.gy - Math.sin(t.ang) * back * 0.6 + 4);
        t.paw.rotation = t.ang * 0.7;
        t.paw.scale.set(1.1, 1.1 * (t.dir === 1 ? 1 : -1));
      }
      t.shadow.visible = false;
      return;
    }
    // In the air: a high arc to the impact, tumbling, bigger at the top (nearer the camera), its shadow growing where it will land.
    const u = Math.min(1, (T - LAUNCH) / t.flight);
    t.paw.visible = T < PAW_BACK;
    if (t.paw.visible) {
      const reach = 1 - Ease.cubicOut(Math.max(0, Math.min(1, (T - PAW_TAP) / (PAW_BACK - PAW_TAP))));
      const back = 38 - 22 * reach;
      t.paw.position.set(t.gx - Math.cos(t.ang) * back, t.gy - Math.sin(t.ang) * back * 0.6 + 4);
    }
    t.glass.visible = true;
    t.glass.anchor.set(0.5);
    const x = t.gx + (t.ix - t.gx) * u;
    const y = t.gy + (t.iy - 6 - t.gy) * u - t.arc * 4 * u * (1 - u);
    t.glass.position.set(x, y);
    t.glass.rotation = t.dir * (0.5 + 8.2 * Ease.sineIn(u) + 2 * u);
    t.glass.scale.set(GLASS_SIZE * (1 + 0.35 * Math.sin(Math.PI * u)));
    t.shadow.visible = true;
    t.shadow.position.set(t.ix, t.iy + 10);
    t.shadow.width = 26 + 38 * u;
    t.shadow.height = (26 + 38 * u) * 0.4;
    t.shadow.alpha = 0.08 + 0.24 * u;
  }

  /** The glass breaks at the impact: a cold burst, the crack, the ring to the reach, a nudge, and the shards go. */
  private breakGlass(t: Throw): void {
    const { stage } = this.env;
    const calm = stage.reduced;
    const detail = stage.detail;
    t.broken = true;
    const fx = stage.fx;
    fx.iceShatter(t.ix, t.iy, { scale: 0.85 });
    fx.ps.burst(GLASS_GLINT, t.ix, t.iy - 4, { count: detail === 0 ? 0.5 : 1 });
    fx.fleck(paint('burst_star'), t.ix, t.iy, { life: 0.24, size: 56, sizeEnd: 120, rot: t.ang, color: lighten(Hue.ice, 0.5), fadeAt: 0.35 });
    if (detail > 0 && !calm) fx.ps.burst(REACH_RING, t.ix, t.iy, { scale: reachScale(t.radius) });
    this.crack(t);
    if (!calm) stage.shake(Trauma.t1, Gate.spShake, 0.3);
    stage.play(stage.rules.big, 'shield_break', 0.7, 0.9, 0.04);

    // The shards: nearest first, a beat apart, each to its enemy (a plan entry with no enemy found, or beyond the tier's limit, has none).
    const order = t.plan.map((p, i) => ({ p, i, d: p.en ? Math.hypot(p.en.x - t.ix, p.en.y - t.iy) : 0 })).sort((a, b) => a.d - b.d || a.i - b.i);
    let rank = 0;
    for (const { p } of order) {
      if (!p.en || !p.ice) continue;
      const s = this.shards.take();
      const dist = Math.hypot(p.en.x - t.ix, p.en.y - t.iy);
      s.start(1, 1);
      s.uid = p.en.uid;
      s.frozen = p.shard.frozen;
      s.enemy = p.en;
      s.ice = p.ice;
      s.landed = false;
      s.seq = ++this.seq;
      s.fromX = t.ix;
      s.fromY = t.iy;
      s.delay = calm ? 0 : Math.min(SHARD_WAIT_MAX, rank * SHARD_GAP);
      s.flight = calm ? 0.06 : Math.min(SHARD_MAX, Math.max(SHARD_MIN, dist / SHARD_SPEED));
      s.life = s.delay + s.flight;
      s.floor = Math.max(0.1, s.life * SHARD_FLOOR);
      s.x = t.ix;
      s.y = t.iy;
      const big = s.frozen ? 40 : 30;
      s.sprite.texture = paint('shot_ice');
      s.sprite.scale.set(big / Math.max(1, s.sprite.texture.width));
      s.sprite.tint = 0xffffff;
      s.sprite.alpha = 1;
      s.sprite.position.set(t.ix, t.iy);
      s.sprite.visible = false;
      p.ice = null;
      rank++;
    }
  }

  private crack(t: Throw): void {
    const c = this.cracks.take();
    c.start(CRACK_LIFE[0], CRACK_LIFE[1]);
    const s = c.sprite;
    s.texture = this.artOf().crack;
    s.position.set(t.ix, t.iy + 6);
    s.rotation = t.ang;
    s.scale.set(0.9);
    s.alpha = 0.9;
    s.visible = true;
    // The cracks lie on the floor under the enemies.
    if (s.parent !== this.back) this.back.addChild(s);
  }

  /** A shard in the air: from the impact toward the enemy where it is NOW, a small arc, stretched along its way. */
  private fly(s: Shard, f: number, calm: boolean): void {
    const en = s.enemy;
    const to = this.spot;
    if (en) {
      to.x = bodyX(en.x, enemyInfo(en.id).size);
      to.y = en.y;
    } else {
      to.x = s.x;
      to.y = s.y;
    }
    const e = calm ? f : Ease.quadIn(f) * 0.6 + f * 0.4;
    const x = s.fromX + (to.x - s.fromX) * e;
    const y = s.fromY + (to.y - s.fromY) * e - (calm ? 0 : 14 * Math.sin(Math.PI * f));
    const ang = Math.atan2(to.y - s.fromY, to.x - s.fromX);
    s.x = x;
    s.y = y;
    const sp = s.sprite;
    sp.position.set(x, y);
    sp.rotation = ang + (calm ? 0 : f * 2.4);
    sp.visible = true;
    if (s.ice) this.follow(s.ice);
  }

  /** A shard lands: its ice breaks, its enemy's numbers are shown. */
  private land(s: Shard): void {
    const { stage } = this.env;
    if (s.landed) return;
    s.landed = true;
    const detail = stage.detail;
    const fx = stage.fx;
    const en = s.enemy;
    const info = en ? enemyInfo(en.id) : null;
    const size = info ? info.size : 56;
    const x = en ? bodyX(en.x, size) : s.x;
    const y = en ? en.y : s.y;
    const count = detail === 0 ? 0.5 : 1;
    if (s.frozen) {
      fx.fleck(paint('burst_star'), x, y, { life: 0.22, size: size * 0.9, sizeEnd: size * 1.7, rot: s.seq, color: lighten(Hue.ice, 0.6), fadeAt: 0.35 });
      fx.ps.burst(CHILL_CRYSTAL, x, y, { scale: Math.max(0.7, size / 56), count });
      fx.ps.burst(CHILL_SHARD, x, y, { scale: Math.max(0.7, size / 56), count });
      if (detail > 0) fx.ps.burst(LAND_RING, x, y, { scale: Math.max(0.8, size / 56) });
      stage.play(stage.rules.heavyHit, 'shield_break', 0.34, 1.35, 0.05);
    } else {
      fx.fleck(paint('burst_star'), x, y, { life: 0.18, size: size * 0.5, sizeEnd: size * 1.0, rot: s.seq, color: lighten(Hue.ice, 0.6), fadeAt: 0.35 });
      fx.ps.burst(CRACK_CHIPS, x, y, { scale: Math.max(0.7, size / 56), count });
      stage.play(stage.rules.strike, 'imp_m_frost', 0.42, 1.3, 0.05);
    }
    if (s.ice) s.ice.hide();
    s.hide();
    // The numbers it held are shown now.
    this.holds.release(s.uid);
  }

  // ── lookups, clean-up ──

  private find(uid: number): EnemyState | null {
    for (const en of this.env.battle.enemies) if (en.uid === uid) return en;
    return null;
  }

  clear(): void {
    this.throws.clear();
    for (const s of this.shards.list) {
      s.ice = null;
      s.hide();
    }
    this.ices.clear();
    this.cracks.clear();
    // The numbers the scene was holding are shown (a victory or a defeat does not eat a hit).
    this.holds.flush();
  }

  destroy(): void {
    this.clear();
    this.throws.destroy();
    this.shards.destroy();
    this.ices.destroy();
    this.cracks.destroy();
  }

  /** The pieces alive right now (QA and tests). */
  live(): {
    throws: number;
    shards: number;
    ices: number;
    cracks: number;
    held: number;
    waiting: number;
    list: Array<{ uid: number; frozen: boolean; x: number; y: number; statue: boolean }>;
  } {
    return {
      throws: this.throws.live,
      shards: this.shards.list.filter((s) => s.on && s.sprite.visible).length,
      ices: this.ices.live,
      cracks: this.cracks.live,
      held: this.holds.size,
      waiting: this.holds.waiting,
      list: this.ices.list.filter((i) => i.on).map((i) => ({ uid: i.enemy ? i.enemy.uid : 0, frozen: i.frozen, x: i.x, y: i.y, statue: i.statued })),
    };
  }
}

export const makeKnock: SpSceneFactory<'knock'> = (env) => new KnockScene(env);
