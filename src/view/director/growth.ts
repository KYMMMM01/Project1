/**
 * Summon, merge and growth: the rarity-escalating reveal, merge bursts with a rising chain pitch,
 * moulting, the guardian awakening cut-in, synergy and upgrade sparkles, sunbeam sparkle, and the
 * flourish of a new toy flying to the HUD.
 */
import { tex } from '@/core/assets';
import { t } from '@/core/i18n';
import { audio } from '@/audio';
import { awakeningCutIn, type EmitDef } from '@/fx';
import type { ClassId, SummonSource } from '@/game';
import { classDef, relicDef, unitClass, unitRarityIndex } from '@/game';
import { CELL_COUNT, cellCenterX, cellCenterY } from '@/game/geometry';
import type { IconName } from '@/ui/icons';
import { Color, RARITY_ORDER, Rarity } from '@/ui/theme';
import type { SfxId } from '@/audio/api';
import type { BannerService } from './banners';
import type { CurrencyService } from './currency';
import { SPARKLE_UP, STAR_POP, THEME_SPRAY } from './defs';
import type { MusicService } from './music';
import { CLASS_COLOR, themeOf } from './palette';
import { DUCK_BY_TIER, SummonRate, specialRing, summonPlan } from './policy';
import type { Bus, Stage } from './stage';
import { Hue } from '@/fx/palette';
import { MERGE_SECONDS, MOLT_SECONDS, REVEAL_DELAY, SLIDE_SECONDS } from '@/view/timing';
import { tossFor } from '@/view/toss';
import { motion } from '@/ui/motion';

const W = Hue.cream;
const GOLD = Color.mustard;

const SUMMON_SFX: readonly SfxId[] = ['summon_common', 'summon_rare', 'summon_epic', 'summon_legendary', 'summon_mythic'];
const SUMMON_VOLUME: readonly number[] = [0.55, 0.65, 0.8, 0.95, 1];

const CLASS_ICON: Record<ClassId, IconName> = {
  warrior: 'class_warrior',
  ranger: 'class_ranger',
  mage: 'class_mage',
  trickster: 'class_trickster',
};

export function mountGrowth(stage: Stage, on: Bus, banners: BannerService, music: MusicService, currency: CurrencyService): void {
  const ctx = stage.ctx;
  const fx = stage.fx;
  const ps = fx.ps;
  const rate = new SummonRate();
  const theme = themeOf(ctx.run.fxTheme);
  /** One spray recipe per theme, built once: the theme only swaps the shape, colours and gravity of the extra layer. */
  const themeDef: EmitDef = { ...THEME_SPRAY, tex: theme.tex, gravity: theme.gravity };
  let lastBig = -99;
  let awakenCount = 0;
  let sunlit: readonly number[] = [];

  /** Cosmetic summon-effect theme: extra pieces on top of the rarity colours, never instead of them. */
  const themeBurst = (x: number, y: number, tier: number): void => {
    if (theme.count === 0 || tier < 1) return;
    ps.burst(themeDef, x, y, { colors: theme.colors, count: (theme.count / 6) * (1 + tier * 0.45), scale: 1 + tier * 0.1 });
  };

  /** Reveal of the tier's recipe; legendary and better share one short version when they come close together. */
  const reveal = (x: number, y: number, tier: number, scale: number): void => {
    const plan = summonPlan(tier, false, stage.now - lastBig);
    if (tier >= 3) lastBig = stage.now;
    fx.summonReveal(x, y, tier, { quick: plan.quick || tier >= 4, scale });
    const duck = DUCK_BY_TIER[tier];
    if (duck) music.duck(duck.depth, duck.seconds);
  };

  on('summon', (e) => {
    const u = e.unit;
    const x = cellCenterX(u.cell);
    const y = cellCenterY(u.cell) - 10;
    const tier = unitRarityIndex(u.id);
    const rapid = rate.note(stage.now);
    const plan = summonPlan(tier, rapid, stage.now - lastBig);
    const play = (): void => {
      if (plan.thin) {
        // Rapid tapping: the colour and the pop stay, the extra layers go.
        fx.summonReveal(x, y, 0, { color: Rarity[RARITY_ORDER[tier] ?? 'common'].color, scale: 0.9 });
      } else {
        if (tier >= 3) lastBig = stage.now;
        fx.summonReveal(x, y, tier, { quick: plan.quick });
        const duck = DUCK_BY_TIER[tier];
        if (duck) music.duck(duck.depth, duck.seconds);
      }
      if (!plan.thin) themeBurst(x, y, tier);
      const sfx = plan.popOnly ? SUMMON_SFX[0] : SUMMON_SFX[tier];
      // Every summon sound opens with the pop of the sticker landing, so it waits for the reveal (the effect charges in silence).
      const lag = plan.thin ? 0 : (REVEAL_DELAY[plan.quick ? 2 : tier] ?? 0);
      const volume = SUMMON_VOLUME[plan.popOnly ? 0 : tier] ?? 0.6;
      if (sfx && lag > 0) stage.laterReal(lag, () => stage.play(stage.rules.summon, sfx, volume, 1, 0.03));
      else if (sfx) stage.play(stage.rules.summon, sfx, volume, 1, 0.03);
      sourceCue(e.source, x, y);
    };
    // The cat's sticker is tossed from the button first (the field flies it): the reveal starts on the frame it lands.
    const lead = tossFor(e.source, motion.reduced);
    if (lead > 0) stage.laterReal(lead, play);
    else play();
  });

  /** Free summons (relic, twin bells, offer picks) get a small sparkle so they read as a gift. */
  function sourceCue(source: SummonSource, x: number, y: number): void {
    if (source === 'button') return;
    ps.burst(SPARKLE_UP, x, y - 20, { colors: [W, GOLD], count: 0.8 });
  }

  on('merge', (e) => {
    const r = e.result;
    const tier = unitRarityIndex(r.id);
    const color = Rarity[RARITY_ORDER[tier] ?? 'common'].color;
    const x = cellCenterX(e.cell);
    const y = cellCenterY(e.cell) - 8;
    const step = stage.mergeLadder.next(stage.now);
    // The burst opens with a short suck that lines up with the materials travelling in (MERGE_SECONDS).
    fx.mergeBurst(x, y, color, 1 + tier * 0.08);
    stage.laterReal(MERGE_SECONDS, () => {
      stage.playStep(stage.rules.merge, tier >= 2 ? 'merge_big' : 'merge', step + tier, tier >= 2 ? 0.85 : 0.75);
    });
    if (tier >= 2) stage.laterReal(MERGE_SECONDS, () => reveal(x, y, tier, 1.15));
    themeBurst(x, y, tier);
    if (e.jumped) {
      // Snack stick: the unit skipped a rarity, so it gets a second ring, a rising flourish and a gold chime.
      stage.laterReal(0.2, () => {
        fx.levelUp(x, y, { color: GOLD, scale: 0.8 });
        ps.burst(STAR_POP, x, y, { colors: [W, GOLD], count: 2, scale: 1.3 });
        stage.direct('level_up', 0.55);
      });
    }
  });

  on('molt', (e) => {
    const x = cellCenterX(e.cell);
    const y = cellCenterY(e.cell) - 8;
    fx.moltPuff(x, y, { color: CLASS_COLOR[unitClass(e.result.id)] });
    // The sound peaks 0.22 s in (audio.md): started that much ahead of the sticker's pop.
    stage.laterReal(MOLT_SECONDS - 0.22, () => stage.direct('molt', 0.8));
    stage.laterReal(MOLT_SECONDS, () => stage.buzz('light'));
  });

  on('awaken', (e) => {
    awakenCount++;
    const id = e.result.id;
    const x = cellCenterX(e.cell);
    const y = cellCenterY(e.cell) - 10;
    const short = awakenCount > 1;
    if (!short) stage.slow(0.25, 400);
    stage.direct('awaken', 0.9);
    fx.awakening(tex(`unit_${id}`), t(`unit.${id}.name`), {
      short,
      tag: t('rarity.mythic'),
      color: CLASS_COLOR[unitClass(id)],
      onImpact: () => {
        fx.summonReveal(x, y, 4, { quick: true });
        themeBurst(x, y, 4);
        audio.stinger('mythic');
        music.duck(DUCK_BY_TIER[4].depth, DUCK_BY_TIER[4].seconds);
      },
    });
  });

  on('synergy', (e) => {
    if (e.tier <= e.previous) return;
    const color = CLASS_COLOR[e.classId];
    let n = 0;
    for (let c = 0; c < CELL_COUNT; c++) {
      const u = ctx.battle.units[c];
      if (!u || unitClass(u.id) !== e.classId) continue;
      const x = cellCenterX(c);
      const y = cellCenterY(c) - 6;
      stage.later(n * 0.04, () => {
        fx.shockwave(x, y, { color, radius: 70 + e.tier * 14 });
        ps.burst(SPARKLE_UP, x, y, { colors: [W, color], count: 1 + e.tier * 0.3 });
      });
      n++;
    }
    stage.playStep(stage.rules.ui, 'upgrade', e.tier, 0.75);
    stage.buzz('light');
    banners.push(
      'caption',
      'synergy' + e.classId,
      1,
      { title: t('director.synergy', { class: t(classDef(e.classId).nameKey), tier: e.tier }), color, icon: CLASS_ICON[e.classId] },
      0.9,
      0.15,
      0.2,
    );
  });

  /** The third step's abilities: a ring of the class's colour where the warriors roar and where a fallen enemy bursts (the stun and the damage show on the enemies). */
  on('special', (e) => {
    fx.shockwave(e.x, e.y, { color: CLASS_COLOR[e.classId], radius: specialRing(e.kind, e.radius) });
    if (e.kind === 'cry') stage.buzz('light');
  });

  on('upgrade', (e) => {
    stage.direct(e.kind === 'class' ? 'upgrade' : 'level_up', 0.7);
    stage.buzz('light');
    if (e.kind === 'summon') {
      fx.levelUp(360, 330, { scale: 0.9 });
      return;
    }
    if (e.classId === null) return;
    const color = CLASS_COLOR[e.classId];
    for (let c = 0; c < CELL_COUNT; c++) {
      const u = ctx.battle.units[c];
      if (u && unitClass(u.id) === e.classId) ps.burst(SPARKLE_UP, cellCenterX(c), cellCenterY(c) - 6, { colors: [W, color], count: 1.2 });
    }
  });

  /** The new sunbeam cells light up with sparkles and a chime, but only on the cells that were not already lit. */
  const lightSun = (cells: readonly number[]): void => {
    let fresh = 0;
    for (const c of cells) {
      if (sunlit.includes(c)) continue;
      const x = cellCenterX(c);
      const y = cellCenterY(c);
      stage.later(fresh * 0.05, () => ps.burst(SPARKLE_UP, x, y, { colors: [W, Hue.sun, GOLD], count: 1.6, scale: 1.3 }));
      fresh++;
    }
    sunlit = cells.slice();
    if (fresh > 0) stage.direct('sunbeam', 0.5);
  };
  /** The beams move when an act ends, under the boss-defeated banner and the toy screen: they show when the next wave starts. */
  let sunLater: readonly number[] | null = null;

  on('sunbeams', (e) => {
    if (stage.bossSeqActive) sunLater = e.cells.slice();
    else lightSun(e.cells);
  });

  on('waveStart', () => {
    if (!sunLater) return;
    const cells = sunLater;
    sunLater = null;
    lightSun(cells);
  });

  // The toy's icon flies from the choice card (the HUD owns that flight), so only the caption and the sound live here.
  on('relicGain', (e) => {
    stage.direct('relic_pick', 0.8);
    banners.push('caption', 'relic', 1, { title: t('director.relic', { name: t(relicDef(e.relic).nameKey) }), color: GOLD }, 0.9, 0.15, 0.2);
  });

  on('sell', (e) => {
    // A sticker sold on the strip is far from its cell: the dust and the pay leave from where it is.
    const view = ctx.unitView(e.unit.uid);
    const g = view ? view.getGlobalPosition() : null;
    const at = g ? ctx.layers.fxFront.toLocal(g) : null;
    const x = at ? at.x : cellCenterX(e.cell);
    const y = at ? at.y : cellCenterY(e.cell);
    fx.dustPuff(x, y, { scale: 0.9 });
    fx.coinBurst(x, y - 10, { count: 6, scale: 0.8 });
    if (g) {
      const scene = ctx.layers.overlay.toLocal(g);
      currency.claimSale(scene.x, scene.y);
    } else currency.claimSale(ctx.toSceneX(x), ctx.toSceneY(y));
    stage.direct('sell', 0.8);
    stage.buzz('light');
  });

  // The sticker hops for SLIDE_SECONDS and lands with a squash: the dust, the sound and the buzz belong to the landing.
  on('move', (e) => {
    stage.laterReal(SLIDE_SECONDS * 0.85, () => {
      fx.dustPuff(cellCenterX(e.to), cellCenterY(e.to) + 18, { scale: 0.7 });
      stage.play(stage.rules.ui, 'place', 0.5, 1, 0.04);
      stage.buzz('tap');
    });
  });

  on('swap', (e) => {
    // A trade is a double slide (the page-turn sound), so it is told apart from a plain move by ear.
    stage.laterReal(SLIDE_SECONDS * 0.85, () => {
      fx.dustPuff(cellCenterX(e.a.cell), cellCenterY(e.a.cell) + 18, { scale: 0.6 });
      fx.dustPuff(cellCenterX(e.b.cell), cellCenterY(e.b.cell) + 18, { scale: 0.6 });
      stage.play(stage.rules.ui, 'ui_tab', 0.8, 1, 0.03);
      stage.buzz('tap');
    });
  });

  stage.onDestroy(() => {
    if (awakeningCutIn.playing) awakeningCutIn.destroy();
  });
}
