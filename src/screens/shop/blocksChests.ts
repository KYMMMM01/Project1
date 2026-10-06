import { Container } from 'pixi.js';
import { t } from '@/core/i18n';
import { fmt } from '@/core/format';
import { profile } from '@/meta';
import { CHEST_GEM_PRICE } from '@/meta/data/economy';
import { pityTarget } from '@/meta/chests';
import { ODDS } from '@/meta/odds';
import type { ChestKind } from '@/meta/types';
import { ads } from '@/platform';
import { Color, fitLabel, paperSeed, paperShape, ProgressBar, uiLabel } from '@/ui';
import { chestArt } from './art';
import { actionButton, currencyButton, GAP, mountPage, PAD, SIDE, subCard, type Block, type BlockBuild, type BlockEnv } from './blockKit';
import { countPill, PriceTag } from './paperBits';
import { chestAction } from './shopLogic';

const ART = 168;
const COL = 236;

/** A chest standing on its own little paper shelf, with the count of owned ones on a pill at its corner. */
function chestOnShelf(card: Container, kind: ChestKind, base: number, owned: number): void {
  const shelf = paperShape({ w: 200, h: 30, radius: 10, fill: Color.kraft, edge: Color.kraftDark, shadow: 5, grain: false, seed: paperSeed() });
  shelf.position.set(COL / 2, base + 15);
  const art = chestArt(kind, ART);
  art.position.set(COL / 2, base - ART / 2 + 30);
  card.addChild(shelf, art);
  if (owned > 0) {
    const pill = countPill('x' + owned);
    pill.position.set(COL / 2 + ART * 0.36, base - ART + 44);
    card.addChild(pill);
  }
}

function oddsButton(card: Container, w: number, kind: ChestKind, env: BlockEnv): void {
  const b = actionButton({ label: t('shop.chest.odds'), icon: 'info', width: 150, height: 88, style: 'neutral', fontSize: 26 }, () => env.actions.openOdds(kind));
  b.position.set(w - 18 - 75, 52);
  card.addChild(b);
}

function title(card: Container, text: string, rw: number): void {
  const tt = uiLabel(text, { size: 36, anchorX: 0 });
  tt.position.set(COL, 52);
  fitLabel(tt, rw - 170, 36);
  card.addChild(tt);
}

function buildFree(inner: Container, y: number, w: number, env: BlockEnv): number {
  const view = profile.freeChestView();
  const owned = profile.data.chests.wooden;
  const rows = (owned > 0 ? 1 : 0) + 1;
  const h = Math.max(262, 140 + rows * 108 + 10);
  const card = subCard(inner, PAD, y, w, h);
  chestOnShelf(card, 'wooden', h - 80, owned);
  const rw = w - COL - 20;
  title(card, t('shop.free.title'), rw);
  oddsButton(card, w, 'wooden', env);
  const status = uiLabel(view.ready ? t('shop.free.ready') : '', { size: 26, color: view.ready ? Color.leafDark : Color.inkSoft, anchorX: 0 });
  status.position.set(COL, 112);
  card.addChild(status);
  env.actions.trackFreeTimer(view.ready ? null : status);

  let ry = 148;
  if (owned > 0) {
    const b = actionButton({ label: t('shop.chest.openN', { n: owned }), width: rw, style: 'primary' }, () => env.actions.openChest('wooden'));
    b.position.set(COL + rw / 2, ry + 48);
    card.addChild(b);
    ry += 108;
  }
  if (view.ready) {
    const b = actionButton({ label: t('shop.free.take'), width: rw, style: 'success' }, () => env.actions.claimFreeChest());
    b.position.set(COL + rw / 2, ry + 48);
    card.addChild(b);
  } else {
    const half = (rw - 14) / 2;
    const adOk = view.skipsLeft > 0 && ads.canOffer('free_chest');
    const ad = actionButton(
      { label: t('shop.free.ad'), icon: 'ad', width: half, style: 'info', sublabel: t('shop.free.adLeft', { n: view.skipsLeft }), fontSize: 26 },
      () => env.actions.skipFreeChest('ad'),
    );
    ad.setEnabled(adOk);
    ad.onDisabledTap(() => env.actions.skipFreeChest('ad'));
    ad.position.set(COL + half / 2, ry + 48);
    const gem = currencyButton(t('shop.free.gems'), view.skipGems, 'gems', half, () => env.actions.skipFreeChest('gems'), 'neutral');
    gem.position.set(COL + half + 14 + half / 2, ry + 48);
    card.addChild(ad, gem);
  }
  return h;
}

function buildPaid(inner: Container, y: number, w: number, env: BlockEnv, kind: 'silver' | 'gold'): number {
  const owned = profile.data.chests[kind];
  const odds = profile.oddsOf(kind);
  const gold = kind === 'gold';
  const h = gold ? 372 : 296;
  const card = subCard(inner, PAD, y, w, h);
  chestOnShelf(card, kind, h - 84, owned);
  const rw = w - COL - 20;
  title(card, t('meta.chest.' + kind), rw);
  oddsButton(card, w, kind, env);

  const table = ODDS[kind];
  const first = table.guarantees[0];
  const info = [t('shop.chest.cards', { n: fmt(table.cards) })];
  if (first) info.push(t('shop.chest.guarantee', { n: first.count, rarity: t('rarity.' + first.atLeast) }));
  const line = uiLabel(info.join(' · '), { size: 26, color: Color.inkSoft, anchorX: 0, anchorY: 0, wrap: rw, lineHeight: 32, align: 'left' });
  line.position.set(COL, 108);
  card.addChild(line);

  if (gold && odds.pity) {
    const p = odds.pity;
    const bar = new ProgressBar({ width: rw, height: 40, color: p.next ? 'green' : 'gold', label: t('shop.chest.pity', { n: p.counter, every: p.every }) });
    bar.position.set(COL + rw / 2, 204);
    bar.setValue(p.counter / p.every, false);
    card.addChild(bar);
    const target = p.next ? t('shop.chest.pityNow', { n: table.pity?.bonusCards ?? 0 }) : t('shop.chest.pityTarget', { unit: p.targetName });
    const tt = uiLabel(target, { size: 26, color: p.next ? Color.leafDark : Color.inkSoft, anchorX: 0, anchorY: 0, wrap: rw, lineHeight: 32, align: 'left' });
    tt.position.set(COL, 234);
    card.addChild(tt);
  }

  const by = h - 58;
  if (chestAction(owned) === 'open') {
    const b = actionButton({ label: t('shop.chest.openN', { n: owned }), width: rw, style: 'primary' }, () => env.actions.openChest(kind));
    b.position.set(COL + rw / 2, by);
    card.addChild(b);
  } else {
    const tag = new PriceTag({ width: rw, style: 'primary', currency: 'gems', amount: CHEST_GEM_PRICE[kind], label: t('shop.chest.buy') });
    tag.onTap(() => env.actions.buyChest(kind));
    tag.position.set(COL + rw / 2, by);
    card.addChild(tag);
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
    const pageW = env.w - SIDE * 2;
    const w = pageW - PAD * 2;
    const inner = new Container();
    let y = 8;
    y += buildFree(inner, y, w, env) + GAP;
    y += buildPaid(inner, y, w, env, 'silver') + GAP;
    y += buildPaid(inner, y, w, env, 'gold');
    const height = mountPage(root, 0, pageW, inner, y, { title: t('shop.sec.chests'), ribbon: 'primary', tape: 'pink' });
    return { height: height + GAP };
  },
};
