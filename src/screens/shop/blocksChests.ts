import { Container, Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { fmt } from '@/core/format';
import { profile } from '@/meta';
import { CHEST_GEM_PRICE } from '@/meta/data/economy';
import { pityTarget } from '@/meta/chests';
import { ODDS } from '@/meta/odds';
import type { ChestKind } from '@/meta/types';
import { ads } from '@/platform';
import { Color, drawGlow, ProgressBar, uiLabel, vGradient } from '@/ui';
import { chestArt } from './art';
import { actionButton, card, currencyButton, GAP, sectionHeader, SIDE, type Block, type BlockBuild, type BlockEnv } from './blockKit';
import { chestAction } from './shopLogic';

/** Little round count badge on the corner of a chest picture. */
function countBadge(n: number): Container {
  const c = new Container();
  const g = new Graphics();
  g.circle(0, 0, 30).fill(vGradient(Color.primary, Color.primaryDark)).stroke({ width: 5, color: Color.outline, alignment: 1 });
  const text = uiLabel('x' + n, { size: 28, strokeWidth: 5, shadow: false });
  c.addChild(g, text);
  return c;
}

function chestPicture(root: Container, kind: ChestKind, x: number, y: number, size: number, owned: number): void {
  const glow = new Graphics();
  drawGlow(glow, x, y, size * 0.62, kind === 'gold' ? Color.gold : kind === 'silver' ? Color.textDim : Color.primary, 0.35);
  root.addChild(glow);
  const art = chestArt(kind, size);
  art.position.set(x, y);
  root.addChild(art);
  if (owned > 0) {
    const b = countBadge(owned);
    b.position.set(x + size * 0.38, y + size * 0.36);
    root.addChild(b);
  }
}

function buildFree(root: Container, y: number, env: BlockEnv): number {
  const w = env.w - SIDE * 2;
  const view = profile.freeChestView();
  const owned = profile.data.chests.wooden;
  const rows = (owned > 0 ? 1 : 0) + 1;
  const h = Math.max(250, 118 + rows * 110 + 14);
  const c = card(root, SIDE, y, w, h);
  chestPicture(c, 'wooden', 112, 118, 170, owned);
  const x0 = 236;
  const rw = w - x0 - 26;
  const title = uiLabel(t('shop.free.title'), { size: 36, strokeWidth: 6, anchorX: 0 });
  title.position.set(x0, 40);
  c.addChild(title);
  const status = uiLabel(view.ready ? t('shop.free.ready') : '', { size: 26, color: view.ready ? Color.success : Color.textDim, strokeWidth: 4, shadow: false, anchorX: 0 });
  status.position.set(x0, 84);
  c.addChild(status);
  env.actions.trackFreeTimer(view.ready ? null : status);

  let ry = 118;
  if (owned > 0) {
    const b = actionButton({ label: t('shop.chest.openN', { n: owned }), width: rw, style: 'primary' }, () => env.actions.openChest('wooden'));
    b.position.set(x0 + rw / 2, ry + 48);
    c.addChild(b);
    ry += 110;
  }
  if (view.ready) {
    const b = actionButton({ label: t('shop.free.take'), width: rw, style: 'success' }, () => env.actions.claimFreeChest());
    b.position.set(x0 + rw / 2, ry + 48);
    c.addChild(b);
  } else {
    const half = (rw - 14) / 2;
    const adOk = view.skipsLeft > 0 && ads.canOffer('free_chest');
    const ad = actionButton(
      { label: t('shop.free.ad'), icon: 'ad', width: half, style: 'info', sublabel: t('shop.free.adLeft', { n: view.skipsLeft }), fontSize: 26 },
      () => env.actions.skipFreeChest('ad'),
    );
    ad.setEnabled(adOk);
    ad.onDisabledTap(() => env.actions.skipFreeChest('ad'));
    ad.position.set(x0 + half / 2, ry + 48);
    const gem = currencyButton(t('shop.free.gems'), view.skipGems, 'gems', half, () => env.actions.skipFreeChest('gems'), 'neutral');
    gem.position.set(x0 + half + 14 + half / 2, ry + 48);
    c.addChild(ad, gem);
  }
  return h;
}

function buildPaid(root: Container, y: number, env: BlockEnv, kind: 'silver' | 'gold'): number {
  const w = env.w - SIDE * 2;
  const owned = profile.data.chests[kind];
  const odds = profile.oddsOf(kind);
  const gold = kind === 'gold';
  const h = gold ? 360 : 300;
  const c = card(root, SIDE, y, w, h);
  chestPicture(c, kind, 112, 112, 170, owned);
  const x0 = 236;
  const rw = w - x0 - 26;

  const title = uiLabel(t('meta.chest.' + kind), { size: 38, strokeWidth: 6, anchorX: 0 });
  title.position.set(x0, 44);
  c.addChild(title);
  const oddsBtn = actionButton({ label: t('shop.chest.odds'), icon: 'info', width: 150, height: 88, style: 'neutral', fontSize: 26 }, () => env.actions.openOdds(kind));
  oddsBtn.position.set(w - 26 - 75, 48);
  c.addChild(oddsBtn);

  const table = ODDS[kind];
  const first = table.guarantees[0];
  const info = [t('shop.chest.cards', { n: fmt(table.cards) })];
  if (first) info.push(t('shop.chest.guarantee', { n: first.count, rarity: t('rarity.' + first.atLeast) }));
  const line = uiLabel(info.join(' · '), { size: 26, color: Color.textDim, strokeWidth: 4, shadow: false, anchorX: 0, anchorY: 0, wrap: rw, lineHeight: 32 });
  line.position.set(x0, 100);
  c.addChild(line);

  if (gold && odds.pity) {
    const p = odds.pity;
    const bar = new ProgressBar({ width: rw, height: 40, color: p.next ? 'green' : 'gold', label: t('shop.chest.pity', { n: p.counter, every: p.every }) });
    bar.position.set(x0 + rw / 2, 188);
    bar.setValue(p.counter / p.every, false);
    c.addChild(bar);
    const target = p.next
      ? t('shop.chest.pityNow', { n: table.pity?.bonusCards ?? 0 })
      : t('shop.chest.pityTarget', { unit: p.targetName });
    const tt = uiLabel(target, { size: 26, color: p.next ? Color.success : Color.textDim, strokeWidth: 4, shadow: false, anchorX: 0, anchorY: 0, wrap: rw, lineHeight: 32 });
    tt.position.set(x0, 218);
    c.addChild(tt);
  }

  const price = CHEST_GEM_PRICE[kind];
  const by = h - 66;
  if (chestAction(owned) === 'open') {
    const b = actionButton({ label: t('shop.chest.openN', { n: owned }), width: rw, style: 'primary' }, () => env.actions.openChest(kind));
    b.position.set(x0 + rw / 2, by);
    c.addChild(b);
  } else {
    const b = currencyButton(t('shop.chest.buy'), price, 'gems', rw, () => env.actions.buyChest(kind));
    b.position.set(x0 + rw / 2, by);
    c.addChild(b);
  }
  return h;
}

export const chestsBlock: Block = {
  id: 'chests',
  visible: () => true,
  signature: () => {
    const d = profile.data;
    const f = profile.freeChestView();
    return [d.chests.wooden, d.chests.silver, d.chests.gold, d.goldOpened, pityTarget(d), f.ready, f.skipsLeft, ads.canOffer('free_chest')].join('|');
  },
  build(root, env): BlockBuild {
    let y = sectionHeader(root, 0, 'chest', t('shop.sec.chests'));
    y += buildFree(root, y, env) + GAP;
    y += buildPaid(root, y, env, 'silver') + GAP;
    y += buildPaid(root, y, env, 'gold') + GAP;
    return { height: y };
  },
};
