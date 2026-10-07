import { Container } from 'pixi.js';
import { t } from '@/core/i18n';
import { fmt, fmtDuration } from '@/core/format';
import { profile } from '@/meta';
import { CHEST_GEM_PRICE } from '@/meta/data/economy';
import { pityTarget } from '@/meta/chests';
import { ODDS } from '@/meta/odds';
import type { ChestKind } from '@/meta/types';
import { ads } from '@/platform';
import { Button, Color, fitLabel, paperSeed, paperShape, ProgressBar, uiLabel } from '@/ui';
import { chestArt } from './art';
import { actionButton, currencyButton, GAP, mountPage, PAD, SIDE, subCard, type Block, type BlockBuild, type BlockEnv } from './blockKit';
import { countPill, PriceTag } from './paperBits';
import { chestAction, pileSize } from './shopLogic';

const ART = 168;
const COL = 236;
/** The open button, the "open all" button under it (a step quieter and shorter) and the space between buttons in a column. */
const OPEN_H = 96;
const PILE_H = 88;
const ROW_GAP = 12;
/** Wide enough for the English word with its icon: the label may not be shortened or cut. */
const ODDS_W = 176;

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
  const b = actionButton({ label: t('shop.chest.odds'), icon: 'info', width: ODDS_W, height: 88, style: 'neutral', fontSize: 26 }, () => env.actions.openOdds(kind));
  // Its right edge is the buttons' below it (`w - 20`): one line down the card.
  b.position.set(w - 20 - ODDS_W / 2, 52);
  card.addChild(b);
}

function title(card: Container, text: string, rw: number): void {
  const tt = uiLabel(text, { size: 36, anchorX: 0 });
  tt.position.set(COL, 52);
  fitLabel(tt, rw - ODDS_W - 20, 36);
  card.addChild(tt);
}

/** The free-chest status line while the next one is not ready. */
export function freeWaitText(waitMs: number): string {
  return t('shop.free.wait', { time: fmtDuration(waitMs / 1000) });
}

/** The "open all" button: from two chests on, directly under the open button, in mustard paper so the coral open button stays the loudest. */
function pileButton(card: Container, kind: ChestKind, owned: number, rw: number, env: BlockEnv): Button {
  const b = actionButton({ label: t('shop.chest.openAll', { n: pileSize(owned) }), width: rw, height: PILE_H, style: 'mustard', fontSize: 28 }, () => env.actions.openAllChests(kind));
  card.addChild(b);
  return b;
}

function buildFree(inner: Container, y: number, w: number, env: BlockEnv): number {
  const view = profile.freeChestView();
  const owned = profile.data.chests.wooden;
  const pile = pileSize(owned) > 0;
  // The open button, the pile button under it, then what the waiting chest offers: while waiting there are two skip buttons (an ad, gems), one under the other so each label has the whole width.
  const heights = [...(owned > 0 ? [OPEN_H] : []), ...(pile ? [PILE_H] : []), ...(view.ready ? [OPEN_H] : [OPEN_H, OPEN_H])];
  const h = Math.max(262, 148 + heights.reduce((a, b) => a + b, 0) + (heights.length - 1) * ROW_GAP + 14);
  const card = subCard(inner, PAD, y, w, h);
  chestOnShelf(card, 'wooden', h - 80, owned);
  const rw = w - COL - 20;
  title(card, t('shop.free.title'), rw);
  oddsButton(card, w, 'wooden', env);
  const status = uiLabel(view.ready ? t('shop.free.ready') : freeWaitText(view.waitMs), { size: 26, color: view.ready ? Color.leafDark : Color.inkSoft, anchorX: 0 });
  status.position.set(COL, 112);
  card.addChild(status);
  env.actions.trackFreeTimer(view.ready ? null : status);

  let ry = 148;
  if (owned > 0) {
    const b = actionButton({ label: t('shop.chest.openN', { n: owned }), width: rw, style: 'primary' }, () => env.actions.openChest('wooden'));
    b.position.set(COL + rw / 2, ry + OPEN_H / 2);
    card.addChild(b);
    ry += OPEN_H + ROW_GAP;
  }
  if (pile) {
    pileButton(card, 'wooden', owned, rw, env).position.set(COL + rw / 2, ry + PILE_H / 2);
    ry += PILE_H + ROW_GAP;
  }
  if (view.ready) {
    const b = actionButton({ label: t('shop.free.take'), width: rw, style: 'success' }, () => env.actions.claimFreeChest());
    b.position.set(COL + rw / 2, ry + OPEN_H / 2);
    card.addChild(b);
  } else {
    const adOk = view.skipsLeft > 0 && ads.canOffer('free_chest');
    const ad = actionButton(
      { label: t('shop.free.ad'), icon: 'ad', width: rw, style: 'info', sublabel: t('shop.free.adLeft', { n: view.skipsLeft }), fontSize: 28 },
      () => env.actions.skipFreeChest('ad'),
    );
    ad.setEnabled(adOk);
    ad.onDisabledTap(() => env.actions.skipFreeChest('ad'));
    ad.position.set(COL + rw / 2, ry + OPEN_H / 2);
    const gem = currencyButton(t('shop.free.gems'), view.skipGems, 'gems', rw, () => env.actions.skipFreeChest('gems'), 'neutral');
    gem.position.set(COL + rw / 2, ry + OPEN_H / 2 + OPEN_H + ROW_GAP);
    card.addChild(ad, gem);
  }
  return h;
}

function buildPaid(inner: Container, y: number, w: number, env: BlockEnv, kind: 'silver' | 'gold'): number {
  const owned = profile.data.chests[kind];
  const table = ODDS[kind];
  const gold = kind === 'gold';
  const rw = w - COL - 20;
  // The line under the bonus bar names the cat the bonus goes to, and on the bonus chest also says it is due, so it may take two lines.
  const pity = gold ? profile.oddsOf(kind).pity : null;
  const target = pity ? t('shop.chest.pityTarget', { unit: pity.targetName }) : '';
  const note = pity
    ? uiLabel(pity.next ? `${t('shop.chest.pityNow', { n: table.pity?.bonusCards ?? 0 })}\n${target}` : target, {
      size: 26, color: pity.next ? Color.leafDark : Color.inkSoft, anchorX: 0, anchorY: 0, wrap: rw, lineHeight: 32, align: 'left',
    })
    : null;
  const pile = pileSize(owned) > 0;
  const h = (gold ? Math.max(372, 346 + Math.ceil(note?.height ?? 0)) : 296) + (pile ? PILE_H + ROW_GAP : 0);
  const card = subCard(inner, PAD, y, w, h);
  chestOnShelf(card, kind, h - 84, owned);
  title(card, t('meta.chest.' + kind), rw);
  oddsButton(card, w, kind, env);

  const first = table.guarantees[0];
  const info = [t('shop.chest.cards', { n: fmt(table.cards) })];
  if (first) info.push(t('shop.chest.guarantee', { n: first.count, rarity: t('rarity.' + first.atLeast) }));
  const line = uiLabel(info.join(' · '), { size: 26, color: Color.inkSoft, anchorX: 0, anchorY: 0, wrap: rw, lineHeight: 32, align: 'left' });
  line.position.set(COL, 108);
  card.addChild(line);

  if (pity && note) {
    const bar = new ProgressBar({ width: rw, height: 40, color: pity.next ? 'green' : 'gold', label: t('shop.chest.pity', { n: pity.counter, every: pity.every }) });
    bar.position.set(COL + rw / 2, 204);
    bar.setValue(pity.counter / pity.every, false);
    note.position.set(COL, 234);
    card.addChild(bar, note);
  }

  const by = h - 58 - (pile ? PILE_H + ROW_GAP : 0);
  if (chestAction(owned) === 'open') {
    const b = actionButton({ label: t('shop.chest.openN', { n: owned }), width: rw, style: 'primary' }, () => env.actions.openChest(kind));
    b.position.set(COL + rw / 2, by);
    card.addChild(b);
    if (pile) pileButton(card, kind, owned, rw, env).position.set(COL + rw / 2, h - 10 - PILE_H / 2);
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
    // The cards were added to `inner` in the order they were built: the free chest, the silver chest, the gold chest.
    const [free, silver] = inner.children as [Container, Container];
    return { height: height + GAP, points: { free, chests: silver } };
  },
};
