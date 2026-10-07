/**
 * The result screen, a scrapbook page: the title on a big paper label, the best cat as a taped photo,
 * the run's numbers as a tidy list on paper, then the rewards paid by the meta layer (gold and XP
 * counting up, stickers popping in, level-ups, a newly cleared stake) and at most two paper coupons
 * (double the rewards, a snack box). Sandbox runs show the statistics only.
 */
import { Container, Graphics, type BitmapText } from 'pixi.js';
import { audio } from '@/audio';
import { fmt, fmtDuration } from '@/core/format';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import { t } from '@/core/i18n';
import { Ease, uiTweens } from '@/core/tween';
import { unitDef, unitRarity, type UnitId } from '@/game';
import { accountProgress, errorKey, profile, type RunReward } from '@/meta';
import { ads } from '@/platform';
import {
  backOut,
  Button,
  Color,
  countUpDuration,
  countUpValue,
  drawDashedLine,
  drawDashedRect,
  drawIcon,
  drawPaper,
  fitLabel,
  LoadingSpinner,
  motion,
  numberText,
  PaperLabel,
  paperSeed,
  paperShape,
  popIn,
  rarityName,
  ScreenScaffold,
  toast,
  TweenBag,
  uiLabel,
  type IconName,
} from '@/ui';
import { Coupon } from '../Coupon';
import type { HudEnv } from '../env';
import { CLASS_TAPE, fitSprite, unitPhoto, unitPortrait } from '../kit';
import { bestCat } from '../planMath';
import { luckLine, offerRoute, rewardTiles, soCloseWaves, unspentFish, type RewardTile } from '../policy';
import { currentSettings } from '../settings';

export interface ResultHandlers {
  retry(): void;
  exit(): void;
}

const W = 672;
const TILE = 150;
const TILE_GAP = 24;
const ROW_H = 54;
const SHEET_H = 480;
const COUPON_H = 120;

/** Seconds after the page opens before the home track starts under it: the director's stinger has rung out by then. */
const MUSIC_DELAY = 1.4;
/** The home track sits at this share of the player's music volume under the result page, and comes up to full when it is left. */
const MUSIC_QUIET = 0.45;

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
  const seed = paperSeed();
  let alive = true;
  let y = 0;

  // ── title ──
  const title = new PaperLabel({
    text: t(victory ? 'hud.res.win' : 'hud.res.lose'),
    size: victory ? 88 : 76,
    paper: victory ? 'mustard' : 'kraft',
    padX: 70,
    padY: 20,
    maxWidth: W - 20,
    tape: 'sky',
    seed,
  });
  title.position.set(W / 2, 82);
  const near = soCloseWaves(stats.wavesCleared, stats.totalWaves, victory);
  const battle = env.battle;
  const left = unspentFish(victory, abandoned, battle.fish, battle.summonCost(), battle.units.filter((u) => !u).length);
  // A run lost with fish in the purse says why before it says anything cheerful.
  const sub = new PaperLabel({
    text: left > 0 ? t('hud.res.loseFish', { n: fmt(left) }) : near > 0 ? t('hud.res.close', { n: near }) : t(victory ? 'hud.res.winSub' : 'hud.res.loseSub'),
    size: 28,
    paper: Color.paper,
    padX: 26,
    padY: 8,
    maxWidth: W - 20,
    seed: seed + 1,
  });
  sub.position.set(W / 2, 180);
  c.addChild(title, sub);
  y = 236;

  // ── the page: best cat on the left, numbers on the right ──
  const sheet = new Container();
  sheet.position.set(0, y);
  const page = paperShape({ w: W, h: SHEET_H, radius: 30, fill: Color.paper, seed: seed + 2 });
  page.position.set(W / 2, SHEET_H / 2);
  const cut = new Graphics();
  drawDashedRect(cut, 14, 14, W - 28, SHEET_H - 28, { radius: 22 });
  sheet.addChild(page, cut);

  let photoParts: Container[] = [];
  const cat = bestCat(stats, env.battle.units, unitRarity);
  if (cat) {
    const def = unitDef(cat);
    const photo = unitPhoto({ size: 196, rarity: def.rarity, unit: cat, tape: CLASS_TAPE[def.classId], seed });
    photo.position.set(136, 148);
    photo.rotation = -0.03;
    const name = uiLabel(t(def.nameKey), { size: 30 });
    fitLabel(name, 220, 30, 0.7);
    name.position.set(136, 282);
    const rank = uiLabel(rarityName(def.rarity), { size: 24, color: Color.inkSoft });
    rank.position.set(136, 316);
    sheet.addChild(photo, name, rank);
    photoParts = [photo, name, rank];
  }

  const cells: Array<{ icon: IconName; label: string; value: string }> = [
    { icon: 'trophy', label: t('hud.res.waves'), value: stats.totalWaves > 0 ? `${stats.wavesCleared}/${stats.totalWaves}` : String(stats.wavesCleared) },
    { icon: 'skull', label: t('hud.res.kills'), value: fmt(stats.kills) },
    { icon: 'arrow_up', label: t('hud.res.merges'), value: fmt(stats.merges) },
    { icon: 'crown', label: t('hud.res.best'), value: rarityName(stats.bestRarity) },
    { icon: 'clock', label: t('hud.res.time'), value: fmtDuration(stats.duration) },
    { icon: 'paw', label: t('hud.res.summons'), value: fmt(stats.summons) },
  ];
  const listX = cat ? 276 : 40;
  const listR = W - 40;
  const listY = 32;
  const lines = new Graphics();
  const rows: Container[] = [];
  cells.forEach((cell, i) => {
    const row = new Container();
    rows.push(row);
    const cy = listY + i * ROW_H + ROW_H / 2;
    const icon = drawIcon(cell.icon, 38);
    icon.position.set(listX + 19, cy);
    const label = uiLabel(cell.label, { size: 24, color: Color.inkSoft, anchorX: 0, align: 'left' });
    label.position.set(listX + 50, cy);
    const value = uiLabel(cell.value, { size: 34, anchorX: 1, align: 'right' });
    fitLabel(value, listR - listX - 150, 34, 0.7);
    value.position.set(listR, cy);
    row.addChild(icon, label, value);
    sheet.addChild(row);
    if (i > 0) drawDashedLine(lines, listX, listY + i * ROW_H, listR, listY + i * ROW_H, { color: Color.kraftDark, width: 2, dash: 8, gap: 8, alpha: 0.7 });
  });
  sheet.addChild(lines);
  const luck = luckLine(stats.summonLuck);
  const luckT = uiLabel(t(`hud.res.luck.${luck.kind}`, { n: luck.n }), { size: 26, wrap: W - 80, lineHeight: 34 });
  // The luck line may wrap to two lines in English: it is centred in the gap between the list and the seed line.
  luckT.position.set(W / 2, listY + cells.length * ROW_H + 42);
  const seedT = uiLabel(t('hud.res.seed', { seed: stats.seed }), { size: 24, color: Color.inkSoft });
  seedT.position.set(W / 2, SHEET_H - 34);
  sheet.addChild(luckT, seedT);
  c.addChild(sheet);
  y += SHEET_H + 32;

  // ── the page is laid down piece by piece: the sheet, the photo slapped on, then the numbers one by one ──
  /** A piece of the page waits unseen, then rises a little and settles, like paper laid on paper. */
  const lay = (obj: Container, delay: number, dx: number, dy: number): void => {
    if (motion.reduced) return;
    const x1 = obj.x;
    const y1 = obj.y;
    obj.alpha = 0;
    bag.run({
      duration: 0.3,
      delay,
      ease: backOut(1.6),
      onUpdate: (k) => {
        if (obj.destroyed) return;
        obj.x = x1 + dx * (1 - k);
        obj.y = y1 + dy * (1 - k);
        obj.alpha = Math.min(1, k * 3);
      },
      onComplete: () => {
        if (obj.destroyed) return;
        obj.x = x1;
        obj.y = y1;
        obj.alpha = 1;
      },
    });
  };
  const sheetY = sheet.y;
  const PAGE_AT = 0.3;
  const PHOTO_AT = PAGE_AT + 0.3;
  const ROWS_AT = PHOTO_AT + 0.2;
  const ROW_STEP = 0.08;
  if (!motion.reduced) {
    page.alpha = 0;
    cut.alpha = 0;
    bag.run({
      duration: 0.36,
      delay: PAGE_AT,
      ease: backOut(1.4),
      onUpdate: (k) => {
        if (page.destroyed) return;
        sheet.y = sheetY + 44 * (1 - k);
        page.alpha = Math.min(1, k * 3);
        cut.alpha = page.alpha;
      },
      onComplete: () => {
        sheet.y = sheetY;
        page.alpha = 1;
        cut.alpha = 1;
      },
    });
    const photo = photoParts[0];
    if (photo) {
      // The photo is slapped on: it lands from above, a little too big, squashes onto the page and settles once.
      photo.alpha = 0;
      const rot = photo.rotation;
      bag.run({
        duration: 0.34,
        delay: PHOTO_AT,
        ease: Ease.linear,
        onUpdate: (k) => {
          if (photo.destroyed) return;
          const e = backOut(2.2)(Ease.quadOut(k));
          photo.scale.set(1.5 - 0.5 * e);
          photo.rotation = rot - 0.16 * (1 - e);
          photo.alpha = Math.min(1, k * 6);
        },
        onComplete: () => {
          photo.scale.set(1);
          photo.rotation = rot;
          photo.alpha = 1;
        },
      });
      // The sound is the slap: the photo reaches the page about a third of the way through its drop.
      bag.call(PHOTO_AT + 0.11, () => alive && audio.play('place', { volume: 0.6 }));
      for (const p of photoParts.slice(1)) lay(p, PHOTO_AT + 0.15, 0, 10);
    }
    rows.forEach((row, i) => lay(row, ROWS_AT + i * ROW_STEP, 22, 0));
    lay(luckT, ROWS_AT + rows.length * ROW_STEP, 0, 8);
    lay(seedT, ROWS_AT + rows.length * ROW_STEP + 0.1, 0, 0);
  }

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

  /** A teal paper strip with the currency's sticker over its left end and the count in ink. */
  const counter = (art: string, fallback: IconName, cx: number, cy: number): { box: Container; text: BitmapText } => {
    const box = new Container();
    box.position.set(cx, cy);
    const w = 308;
    const g = new Graphics();
    drawPaper(g, -w / 2, -38, { w, h: 76, radius: 14, fill: Color.teal, edge: Color.tealDark, torn: 'right', seed: paperSeed(), grain: false });
    const icon = fitSprite(art, 78) ?? drawIcon(fallback, 66);
    icon.position.set(-w / 2 + 16, -2);
    const text = numberText(52, Color.inkDeep, '+0');
    text.position.set(26, 1);
    box.addChild(g, text, icon);
    return { box, text };
  };

  /** A reward as a sticker: a die-cut piece of cream paper with its art, count and name, lying a little crooked. */
  const buildTile = (tile: RewardTile, x: number, ty: number, tilt: number): Container => {
    const box = new Container();
    box.position.set(x + TILE / 2, ty + TILE / 2);
    box.rotation = tilt;
    const g = new Graphics();
    drawPaper(g, -TILE / 2, -TILE / 2, { w: TILE, h: TILE, radius: 28, fill: Color.paperLight, edge: Color.kraftDark, seed: paperSeed(), grain: false });
    box.addChild(g);
    let art: Container | null = null;
    if (tile.kind === 'card') art = unitPortrait(tile.id as UnitId, 84);
    else if (tile.kind === 'chest') art = fitSprite(CHEST_ART[tile.id] ?? 'icon_chest_wood', 92);
    else if (TILE_ART[tile.kind]) art = fitSprite(TILE_ART[tile.kind] as string, 84);
    art ??= drawIcon(TILE_ICON[tile.kind], 76);
    art.position.set(0, -26);
    const count = uiLabel(`×${fmt(tile.count)}`, { size: 32 });
    count.position.set(0, 32);
    const nameKey = tile.kind === 'chest' ? `hud.res.chest.${tile.id}` : tile.kind === 'card' ? `unit.${tile.id}.name` : tile.kind === 'wild' ? `rarity.${tile.id}` : `hud.res.r.${tile.kind}`;
    const name = uiLabel(t(nameKey), { size: 24, color: Color.inkSoft });
    name.position.set(0, 60);
    fitLabel(name, TILE - 12, 24, 0.8);
    box.addChild(art, count, name);
    return box;
  };

  const showRewards = (reward: RunReward, levelBefore: number, levelAfter: number): void => {
    spinner.destroy();
    let ry = 0;
    const head = new PaperLabel({ text: t('hud.res.rewards'), size: 34, paper: 'kraft', padX: 34, padY: 8, seed: seed + 3 });
    head.position.set(head.uiBox.w / 2 + 6, 26);
    rewardLayer.addChild(head);
    ry += 76;

    const gold = counter('icon_gold', 'coin', W * 0.25, ry + 40);
    const xp = counter('icon_xp', 'star', W * 0.75, ry + 40);
    goldT = gold.text;
    xpT = xp.text;
    goldTile = gold.box;
    rewardLayer.addChild(gold.box, xp.box);
    countTo(goldT, reward.gold);
    countTo(xpT, reward.xp);
    audio.play('coin_many');
    ry += 100;

    /** A line on its own label, hidden until its moment. */
    const callout = (text: string, paper: 'mustard' | 'success' | 'primary', delay: number | null): void => {
      const label = new PaperLabel({ text, size: 32, paper, padX: 30, padY: 8, maxWidth: W - 20, seed: seed + ry });
      label.position.set(W / 2, ry + 26);
      rewardLayer.addChild(label);
      ry += 66;
      if (delay === null) return;
      label.alpha = 0;
      bag.call(delay, () => {
        if (!alive || label.destroyed) return;
        if (paper === 'mustard') {
          audio.play('level_up');
          haptic('success');
        }
        popIn(bag, label, { from: 0.4, duration: 0.3, overshoot: 3 });
      });
    };
    if (levelAfter > levelBefore) callout(t('hud.res.level', { a: levelBefore, b: levelAfter }), 'mustard', 0.5);
    if (reward.firstClear) callout(t('hud.res.firstClear', { chapter: reward.chapter, stake: reward.stake }), 'success', 0.8);
    if (reward.newBest) callout(t('hud.res.newBest'), 'primary', null);

    const tiles = rewardTiles(0, 0, reward.bundle);
    const perRow = 4;
    tiles.forEach((tile, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const box = buildTile(tile, col * (TILE + TILE_GAP), ry + row * (TILE + TILE_GAP), (i % 3 - 1) * 0.04);
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
      const coupon: Coupon = new Coupon({
        w: W,
        h: COUPON_H,
        paper: viaAd ? 'mustard' : 'info',
        icon: viaAd ? (butler ? 'crown' : 'ad') : 'gem',
        label: t('hud.res.double'),
        sub: viaAd ? (butler ? t('hud.res.butler') : t('hud.ad')) : '20',
        onTap: () => {
          void (async () => {
            coupon.setBusy(true);
            const r = await profile.doubleResult(viaAd ? 'ad' : 'gems');
            if (!alive) return;
            coupon.setBusy(false);
            if (!r.ok) {
              toast(t(errorKey(r.error)), 'warning');
              return;
            }
            coupon.setSpent(t('hud.res.doubled'));
            audio.play('reward_claim');
            if (goldT) countTo(goldT, r.value.gold * 2);
            if (xpT) countTo(xpT, r.value.xp * 2);
            if (goldTile && !motion.reduced) popIn(bag, goldTile, { from: 0.9, duration: 0.25 });
          })();
        },
      });
      coupon.position.set(W / 2, h + COUPON_H / 2);
      offers.addChild(coupon);
      h += COUPON_H + 22;
    }
    if (offerRoute(ads.status('snack_box').reason, false) === 'ad' && profile.snackChestsLeft() > 0) {
      const coupon: Coupon = new Coupon({
        w: W,
        h: COUPON_H,
        paper: 'info',
        icon: 'chest',
        label: t('hud.res.snack'),
        sub: t('hud.res.snackLeft', { n: profile.snackChestsLeft() }),
        onTap: () => {
          void (async () => {
            coupon.setBusy(true);
            const r = await profile.claimSnackChest();
            if (!alive) return;
            coupon.setBusy(false);
            if (!r.ok) {
              toast(t(errorKey(r.error)), 'warning');
              return;
            }
            coupon.setSpent(t('hud.res.snackDone'));
            audio.play('chest_open');
          })();
        },
      });
      coupon.position.set(W / 2, h + COUPON_H / 2);
      offers.addChild(coupon);
      h += COUPON_H + 22;
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
  const retry = new Button({ label: t('hud.res.retry'), icon: 'play', style: 'primary', width: 400, height: 124, fontSize: 52, tape: 'sky' });
  retry.position.set(115, 0);
  retry.onTap(() => handlers.retry());
  bar.addChild(home, retry);
  bag.call(1.2, () => alive && retry.startPulse({ times: -1 }));

  // ── victory confetti ──
  if (victory && !motion.reduced) confetti(scaffold, bag);

  void scaffold.show(true);
  if (victory) haptic('success');
  // The stinger is the director's (it rang when the run ended, a second one here would repeat it). The page only brings
  // the home track in quietly once that has died away, and hands it back at full volume when it is left.
  const musicBase = currentSettings().music;
  let musicOn = false;
  bag.call(MUSIC_DELAY, () => {
    if (!alive) return;
    musicOn = true;
    audio.setMusicVolume(musicBase * MUSIC_QUIET);
    audio.music('home', 3);
  });
  if (!motion.reduced) popIn(bag, title, { from: 0.2, duration: 0.4, overshoot: 2.5 });

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
      if (musicOn) {
        // The home scene asks for the same track, which then simply goes on; its volume comes up instead of jumping.
        const from = musicBase * MUSIC_QUIET;
        uiTweens.run({
          duration: 1.2,
          ease: Ease.quadOut,
          onUpdate: (k) => audio.setMusicVolume(from + (musicBase - from) * k),
          onComplete: () => audio.setMusicVolume(musicBase),
        });
      }
      scaffold.destroy({ children: true });
    },
  };
}

/** One burst of paper confetti over the title: 90 pieces on one tween, no per-frame allocation. */
function confetti(scaffold: ScreenScaffold, bag: TweenBag): void {
  const N = 90;
  const layer = new Container();
  layer.eventMode = 'none';
  const pieces: Graphics[] = [];
  const vx = new Float32Array(N);
  const vy = new Float32Array(N);
  const spin = new Float32Array(N);
  const colors = [Color.mustard, Color.coral, Color.teal, Color.leaf, Color.berry];
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
