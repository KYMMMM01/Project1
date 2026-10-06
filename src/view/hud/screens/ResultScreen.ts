/**
 * The result screen: victory or defeat, the run's numbers, the luck line, then the rewards paid by
 * the meta layer (gold and XP counting up, chest and card reveals, level-ups, a newly cleared stake)
 * and at most two inline offers. Sandbox runs show the statistics only.
 */
import { Container, Graphics, type BitmapText } from 'pixi.js';
import { audio } from '@/audio';
import { fmt, fmtDuration } from '@/core/format';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import type { UnitId } from '@/game';
import { accountProgress, errorKey, profile, type RunReward } from '@/meta';
import { ads } from '@/platform';
import {
  Button,
  Color,
  countUpDuration,
  countUpValue,
  drawIcon,
  fitLabel,
  LoadingSpinner,
  motion,
  numberText,
  popIn,
  Rarity,
  rarityName,
  ScreenScaffold,
  toast,
  TweenBag,
  uiLabel,
  vGradient,
  type IconName,
  shade,
} from '@/ui';
import type { HudEnv } from '../env';
import { fitSprite, unitPortrait } from '../kit';
import { luckLine, offerRoute, rewardTiles, soCloseWaves, type RewardTile } from '../policy';

export interface ResultHandlers {
  retry(): void;
  exit(): void;
}

const W = 672;
const TILE = 150;
const TILE_GAP = 24;

const TILE_ICON: Record<RewardTile['kind'], IconName> = {
  gold: 'coin',
  xp: 'star',
  gems: 'gem',
  tickets: 'ticket',
  chest: 'chest',
  card: 'cards',
  wild: 'cards',
  cosmetic: 'wardrobe',
};

const TILE_ART: Partial<Record<RewardTile['kind'], string>> = { gold: 'icon_gold', xp: 'icon_xp', gems: 'icon_gem', wild: 'icon_card' };
const CHEST_ART: Record<string, string> = { wooden: 'icon_chest_wood', silver: 'icon_chest_silver', gold: 'icon_chest_gold' };

/** Handle to tear the screen down (the scaffold lives on the global popup layer, not in the battle scene). */
export interface ResultHandle {
  destroy(): void;
}

export function openResult(env: HudEnv, victory: boolean, abandoned: boolean, handlers: ResultHandlers): ResultHandle {
  const stats = env.battle.getStats();
  const scaffold = new ScreenScaffold({ title: t('hud.res.title'), scroll: true, actionBarHeight: 170 });
  game.popupLayer.addChild(scaffold);
  const bag = new TweenBag();
  const c = scaffold.content;
  const release = env.holdPause();
  let alive = true;
  let y = 0;

  // ── banner ──
  const banner = new Container();
  banner.position.set(W / 2, 120);
  const rays = new Graphics();
  if (victory) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const b = a + 0.16;
      rays.poly([0, 0, Math.cos(a) * 330, Math.sin(a) * 330, Math.cos(b) * 330, Math.sin(b) * 330]).fill({ color: shade(Color.gold, 0.4), alpha: 0.2 });
    }
  }
  const title = uiLabel(t(victory ? 'hud.res.win' : 'hud.res.lose'), { size: victory ? 92 : 80, color: victory ? Color.gold : Color.textDim, strokeWidth: 12 });
  const near = soCloseWaves(stats.wavesCleared, stats.totalWaves, victory);
  const sub = uiLabel(near > 0 ? t('hud.res.close', { n: near }) : t(victory ? 'hud.res.winSub' : 'hud.res.loseSub'), {
    size: 30, wrap: W - 40, lineHeight: 40, strokeWidth: 5, shadow: false,
  });
  sub.position.set(0, 86);
  banner.addChild(rays, title, sub);
  c.addChild(banner);
  y = 250;

  // ── numbers ──
  const cells: Array<{ icon: IconName; label: string; value: string; color?: number }> = [
    { icon: 'trophy', label: t('hud.res.waves'), value: stats.totalWaves > 0 ? `${stats.wavesCleared}/${stats.totalWaves}` : String(stats.wavesCleared) },
    { icon: 'skull', label: t('hud.res.kills'), value: fmt(stats.kills) },
    { icon: 'arrow_up', label: t('hud.res.merges'), value: fmt(stats.merges) },
    { icon: 'crown', label: t('hud.res.best'), value: rarityName(stats.bestRarity), color: Rarity[stats.bestRarity].light },
    { icon: 'clock', label: t('hud.res.time'), value: fmtDuration(stats.duration) },
    { icon: 'paw', label: t('hud.res.summons'), value: fmt(stats.summons) },
  ];
  const statH = 3 * 92 + 150;
  const plate = new Graphics();
  plate.roundRect(0, 6, W, statH, 32).fill({ color: Color.black, alpha: 0.3 });
  plate.roundRect(0, 0, W, statH, 32).fill(vGradient(Color.panelLight, Color.panel)).stroke({ width: 5, color: Color.outline, alignment: 1 });
  plate.position.set(0, y);
  c.addChild(plate);
  cells.forEach((cell, i) => {
    const cx = 24 + (i % 2) * (W / 2);
    const cy = y + 20 + Math.floor(i / 2) * 92;
    const icon = drawIcon(cell.icon, 52);
    icon.position.set(cx + 28, cy + 40);
    const label = uiLabel(cell.label, { size: 24, color: Color.textDim, anchorX: 0, align: 'left', strokeWidth: 4, shadow: false });
    label.position.set(cx + 70, cy + 22);
    const value = uiLabel(cell.value, { size: 36, color: cell.color ?? Color.white, anchorX: 0, align: 'left', strokeWidth: 5 });
    value.position.set(cx + 70, cy + 58);
    fitLabel(value, W / 2 - 110, 36, 0.7);
    c.addChild(icon, label, value);
  });
  const luck = luckLine(stats.summonLuck);
  const luckT = uiLabel(t(`hud.res.luck.${luck.kind}`, { n: luck.n }), {
    size: 28, wrap: W - 60, lineHeight: 36, color: luck.kind === 'top' ? Color.gold : Color.white, strokeWidth: 4, shadow: false,
  });
  luckT.position.set(W / 2, y + 3 * 92 + 50);
  const seedT = uiLabel(t('hud.res.seed', { seed: stats.seed }), { size: 24, color: Color.textDim, strokeWidth: 4, shadow: false });
  seedT.position.set(W / 2, y + 3 * 92 + 112);
  c.addChild(luckT, seedT);
  y += statH + 28;

  // ── rewards ──
  const rewardLayer = new Container();
  rewardLayer.position.set(0, y);
  c.addChild(rewardLayer);
  const spinner = new LoadingSpinner({ size: 64 });
  spinner.position.set(W / 2, 60);
  const showStatsOnly = env.sandbox;
  if (!showStatsOnly) rewardLayer.addChild(spinner);

  let goldT: BitmapText | null = null;
  let xpT: BitmapText | null = null;
  let goldTile: Container | null = null;
  const counters = new Map<BitmapText, number>();

  const countTo = (label: BitmapText, to: number): void => {
    const from = counters.get(label) ?? 0;
    counters.set(label, to);
    const dur = countUpDuration(to - from);
    bag.run({
      duration: motion.reduced ? 0 : Math.max(0.3, dur),
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        label.text = `+${fmt(countUpValue(from, to, k))}`;
      },
      onComplete: () => {
        label.text = `+${fmt(to)}`;
      },
    });
  };

  const buildTile = (tile: RewardTile, x: number, ty: number): Container => {
    const box = new Container();
    box.position.set(x + TILE / 2, ty + TILE / 2);
    const g = new Graphics();
    g.roundRect(-TILE / 2, -TILE / 2 + 6, TILE, TILE, 28).fill({ color: Color.black, alpha: 0.3 });
    g.roundRect(-TILE / 2, -TILE / 2, TILE, TILE, 28).fill(vGradient(shade(Color.panelLight, 0.1), Color.panelLight)).stroke({ width: 5, color: Color.outline, alignment: 1 });
    box.addChild(g);
    let art: Container | null = null;
    if (tile.kind === 'card') art = unitPortrait(tile.id as UnitId, 84);
    else if (tile.kind === 'chest') art = fitSprite(CHEST_ART[tile.id] ?? 'icon_chest_wood', 92);
    else if (TILE_ART[tile.kind]) art = fitSprite(TILE_ART[tile.kind] as string, 84);
    art ??= drawIcon(TILE_ICON[tile.kind], 76);
    art.position.set(0, -22);
    const count = uiLabel(`×${fmt(tile.count)}`, { size: 32, strokeWidth: 5 });
    count.position.set(0, 38);
    const nameKey = tile.kind === 'chest' ? `hud.res.chest.${tile.id}` : tile.kind === 'card' ? `unit.${tile.id}.name` : tile.kind === 'wild' ? `rarity.${tile.id}` : `hud.res.r.${tile.kind}`;
    const name = uiLabel(t(nameKey), { size: 22, color: Color.textDim, strokeWidth: 4, shadow: false });
    name.position.set(0, 66);
    fitLabel(name, TILE - 12, 22, 0.8);
    box.addChild(art, count, name);
    return box;
  };

  const showRewards = (reward: RunReward, levelBefore: number, levelAfter: number): void => {
    spinner.destroy();
    let ry = 0;
    const head = uiLabel(t('hud.res.rewards'), { size: 38, anchorX: 0, align: 'left', strokeWidth: 6 });
    head.position.set(8, 24);
    rewardLayer.addChild(head);
    ry += 64;

    // Gold and XP counters.
    goldT = numberText(52, Color.gold, '+0');
    xpT = numberText(52, shade(Color.gem, 0.3), '+0');
    const rowGold = new Container();
    const rowXp = new Container();
    const goldIcon = fitSprite('icon_gold', 64) ?? drawIcon('coin', 60);
    const xpIcon = fitSprite('icon_xp', 64) ?? drawIcon('star', 60);
    goldIcon.position.set(60, 40);
    xpIcon.position.set(W / 2 + 60, 40);
    goldT.position.set(60 + 40 + 80, 40);
    xpT.position.set(W / 2 + 60 + 40 + 80, 40);
    rowGold.addChild(goldIcon, goldT);
    rowXp.addChild(xpIcon, xpT);
    const rowWrap = new Container();
    rowWrap.position.set(0, ry);
    rowWrap.addChild(rowGold, rowXp);
    rewardLayer.addChild(rowWrap);
    goldTile = rowGold;
    countTo(goldT, reward.gold);
    countTo(xpT, reward.xp);
    audio.play('coin_many');
    ry += 96;

    if (levelAfter > levelBefore) {
      const lv = uiLabel(t('hud.res.level', { a: levelBefore, b: levelAfter }), { size: 36, color: Color.gold, strokeWidth: 6 });
      lv.position.set(W / 2, ry + 26);
      rewardLayer.addChild(lv);
      bag.call(0.5, () => {
        if (!alive) return;
        audio.play('level_up');
        haptic('success');
        popIn(bag, lv, { from: 0.4, duration: 0.3, overshoot: 3 });
      });
      lv.alpha = 0;
      ry += 64;
    }
    if (reward.firstClear) {
      const fc = uiLabel(t('hud.res.firstClear', { chapter: reward.chapter, stake: reward.stake }), {
        size: 32, color: Color.energy, wrap: W - 40, strokeWidth: 5,
      });
      fc.position.set(W / 2, ry + 26);
      rewardLayer.addChild(fc);
      bag.call(0.8, () => alive && popIn(bag, fc, { from: 0.5, duration: 0.3, overshoot: 3 }));
      fc.alpha = 0;
      ry += 64;
    }
    if (reward.newBest) {
      const nb = uiLabel(t('hud.res.newBest'), { size: 32, color: Color.gold, strokeWidth: 5 });
      nb.position.set(W / 2, ry + 26);
      rewardLayer.addChild(nb);
      ry += 64;
    }

    const tiles = rewardTiles(0, 0, reward.bundle);
    const perRow = 4;
    tiles.forEach((tile, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const box = buildTile(tile, col * (TILE + TILE_GAP), ry + row * (TILE + TILE_GAP));
      rewardLayer.addChild(box);
      box.alpha = 0;
      bag.call(0.6 + i * 0.14, () => {
        if (!alive || box.destroyed) return;
        popIn(bag, box, { from: 0.2, duration: 0.3, overshoot: 3 });
        audio.playStep('card_flip', Math.min(i, 6), { volume: 0.6 });
        haptic('light');
      });
    });
    ry += Math.ceil(tiles.length / perRow) * (TILE + TILE_GAP);

    ry = buildOffers(reward, ry + 8, tiles.length * 0.14 + 0.9);
    scaffold.refresh();
  };

  // ── offers ──
  const buildOffers = (reward: RunReward, oy: number, delay: number): number => {
    if (env.sandbox || env.tutorial || env.ctx.run.runsPlayed < 1) return oy;
    const offers = new Container();
    offers.position.set(0, oy);
    let h = 0;
    const doubleRoute = reward.doubled ? 'none' : offerRoute(ads.status('result_double').reason, false);
    const butler = profile.data.owned.butler;
    if (doubleRoute !== 'none') {
      const viaAd = doubleRoute === 'ad';
      const btn = new Button({
        label: t('hud.res.double'),
        sublabel: viaAd ? (butler ? t('hud.res.butler') : t('hud.ad')) : '20',
        sublabelIcon: viaAd ? undefined : 'gem',
        icon: viaAd ? (butler ? 'crown' : 'ad') : 'gem',
        style: viaAd ? 'success' : 'purple',
        width: W,
        height: 112,
        fontSize: 42,
      });
      btn.position.set(W / 2, h + 56);
      btn.onTap(() => {
        void (async () => {
          btn.setBusy(true);
          const r = await profile.doubleResult(viaAd ? 'ad' : 'gems');
          if (!alive) return;
          btn.setBusy(false);
          if (!r.ok) {
            toast(t(errorKey(r.error)), 'warning');
            return;
          }
          btn.setLabel(t('hud.res.doubled'));
          btn.setSublabel(undefined);
          btn.setStyle('neutral');
          btn.setEnabled(false);
          audio.play('reward_claim');
          if (goldT) countTo(goldT, r.value.gold * 2);
          if (xpT) countTo(xpT, r.value.xp * 2);
          if (goldTile && !motion.reduced) popIn(bag, goldTile, { from: 0.9, duration: 0.25 });
        })();
      });
      offers.addChild(btn);
      h += 136;
    }
    if (offerRoute(ads.status('snack_box').reason, false) === 'ad' && profile.snackChestsLeft() > 0) {
      const btn = new Button({
        label: t('hud.res.snack'), sublabel: t('hud.res.snackLeft', { n: profile.snackChestsLeft() }), icon: 'ad', style: 'info', width: W, height: 104, fontSize: 38,
      });
      btn.position.set(W / 2, h + 52);
      btn.onTap(() => {
        void (async () => {
          btn.setBusy(true);
          const r = await profile.claimSnackChest();
          if (!alive) return;
          btn.setBusy(false);
          if (!r.ok) {
            toast(t(errorKey(r.error)), 'warning');
            return;
          }
          btn.setLabel(t('hud.res.snackDone'));
          btn.setSublabel(undefined);
          btn.setStyle('neutral');
          btn.setEnabled(false);
          audio.play('chest_open');
        })();
      });
      offers.addChild(btn);
      h += 128;
    }
    if (h === 0) {
      offers.destroy();
      return oy;
    }
    rewardLayer.addChild(offers);
    offers.alpha = 0;
    bag.call(delay, () => alive && popIn(bag, offers, { from: 0.9, duration: 0.3 }));
    return oy + h;
  };

  // ── buttons ──
  const bar = scaffold.actionBar;
  const home = new Button({ label: t('hud.res.home'), icon: 'home', style: 'neutral', width: 230, height: 108, fontSize: 36 });
  home.position.set(-205, 0);
  home.onTap(() => handlers.exit());
  const retry = new Button({ label: t('hud.res.retry'), icon: 'play', style: 'primary', width: 400, height: 124, fontSize: 52 });
  retry.position.set(115, 0);
  retry.onTap(() => handlers.retry());
  bar.addChild(home, retry);
  bag.call(1.2, () => alive && retry.startPulse({ times: -1 }));

  // ── victory confetti ──
  if (victory && !motion.reduced) confetti(scaffold, bag);

  void scaffold.show(true);
  if (victory) {
    audio.stinger('victory');
    haptic('success');
  } else audio.stinger('defeat');
  if (!motion.reduced) {
    popIn(bag, title, { from: 0.2, duration: 0.4, overshoot: 2.5 });
    // 20 degrees a second: a full turn every 18 s.
    if (victory) bag.run({ duration: 18, ease: Ease.linear, repeat: -1, onUpdate: (k) => (rays.rotation = k * Math.PI * 2) });
  }

  // ── settle the run with the meta layer ──
  if (!showStatsOnly) {
    const before = accountProgress(profile.data.accountXp).level;
    void profile.finishRun(stats, { abandoned }).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        spinner.destroy();
        toast(t(errorKey(r.error)), 'warning');
        return;
      }
      showRewards(r.value, before, accountProgress(profile.data.accountXp).level);
    });
  }

  return {
    destroy: () => {
      if (!alive) return;
      alive = false;
      release();
      bag.killAll();
      scaffold.destroy({ children: true });
    },
  };
}

/** One burst of paper confetti over the banner: 90 pieces on one tween, no per-frame allocation. */
function confetti(scaffold: ScreenScaffold, bag: TweenBag): void {
  const N = 90;
  const layer = new Container();
  layer.eventMode = 'none';
  const pieces: Graphics[] = [];
  const vx = new Float32Array(N);
  const vy = new Float32Array(N);
  const spin = new Float32Array(N);
  const colors = [Color.gold, shade(Color.danger, 0.3), Color.info, Color.energy, shade(Color.purple, 0.4)];
  for (let i = 0; i < N; i++) {
    const g = new Graphics();
    g.rect(-7, -4, 14, 8).fill(colors[i % colors.length] as number);
    g.position.set(360 + (Math.random() - 0.5) * 120, 230);
    vx[i] = (Math.random() - 0.5) * 900;
    vy[i] = -300 - Math.random() * 700;
    spin[i] = (Math.random() - 0.5) * 18;
    layer.addChild(g);
    pieces.push(g);
  }
  scaffold.addChild(layer);
  const DURATION = 2.4;
  bag.run({
    duration: DURATION,
    ease: Ease.linear,
    onUpdate: (k) => {
      const tt = k * DURATION;
      for (let i = 0; i < N; i++) {
        const g = pieces[i] as Graphics;
        g.x = 360 + (vx[i] as number) * tt * 0.7;
        g.y = 230 + (vy[i] as number) * tt + 900 * tt * tt;
        g.rotation = (spin[i] as number) * tt;
        g.alpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      }
    },
    onComplete: () => layer.destroy({ children: true }),
  });
}
