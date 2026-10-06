import { Container, Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { fmt } from '@/core/format';
import { mixColor } from '@/core/math';
import { featureHint, profile } from '@/meta';
import { bundleParts, describeBundle } from '@/meta/bundle';
import type { ShopOffer } from '@/meta/shop';
import { ads } from '@/platform';
import { Color, drawIcon, drawPaperFace, fitLabel, Rarity, uiLabel } from '@/ui';
import { partArt } from './art';
import { actionButton, GAP, mountPage, PAD, SIDE, subCard, type Block, type BlockBuild, type BlockEnv } from './blockKit';
import { countPill, PriceTag, stampMark } from './paperBits';

const COLS = 3;
const SLOT_H = 332;

/** One of the six daily cards: the item on a photo mat, its name, and a price tag; a bought card wears a "sold" stamp. */
function slotCard(inner: Container, x: number, y: number, w: number, offer: ShopOffer, bought: boolean, env: BlockEnv): void {
  const c = subCard(inner, x, y, w, SLOT_H);
  const rar = offer.rarity ? Rarity[offer.rarity] : null;
  const mat = new Graphics();
  const pw = w - 24;
  drawPaperFace(mat, 12, 12, { w: pw, h: 156, radius: 18, fill: rar ? rar.color : Color.paperDim, edge: rar ? rar.dark : Color.kraftDark, grain: false, wobble: 0.7 });
  drawPaperFace(mat, 20, 20, { w: pw - 16, h: 140, radius: 12, fill: rar ? mixColor(rar.light, Color.paper, 0.62) : Color.paper, edge: rar ? rar.dark : Color.kraftDark, edgeAlpha: 0.35, grain: false, wobble: 0.6 });
  c.addChild(mat);

  const parts = bundleParts(offer.bundle);
  const main = parts[0];
  if (main) {
    const art = partArt(main, 112);
    art.position.set(w / 2, 88);
    c.addChild(art);
    const pill = countPill('x' + fmt(main.n));
    pill.position.set(w - 12 - pill.width / 2 - 6, 156);
    c.addChild(pill);
  }

  const name = uiLabel(describeBundle(offer.bundle)[0] ?? '', { size: 24, wrap: w - 24, lineHeight: 28 });
  fitLabel(name, w - 20, 24);
  name.position.set(w / 2, 202);
  c.addChild(name);

  const by = SLOT_H - 52;
  const bw = w - 20;
  if (bought) {
    c.alpha = 0.9;
    const stamp = stampMark(t('shop.daily.bought'), { size: 28, maxWidth: w - 16, tilt: -0.18 });
    stamp.position.set(w / 2, by - 6);
    const done = drawIcon('check', 40, Color.leafDark);
    done.position.set(w / 2, 92);
    c.addChild(done, stamp);
    return;
  }
  const tag =
    offer.kind === 'free'
      ? new PriceTag({ width: bw, style: 'success', label: t('shop.daily.free') })
      : new PriceTag({ width: bw, style: 'primary', currency: offer.price.gold !== undefined ? 'gold' : 'gems', amount: offer.price.gold ?? offer.price.gems ?? 0, fontSize: 30 });
  tag.onTap(() => env.actions.buySlot(offer.slot));
  tag.position.set(w / 2, by);
  c.addChild(tag);
}

export const dailyBlock: Block = {
  id: 'daily',
  visible: () => true,
  signature: () => {
    const v = profile.shopView();
    return [profile.featureUnlocked('shop'), v.date, v.bought.join(''), v.refreshesLeft, ads.canOffer('shop_refresh'), v.offers.map((o) => o.slot + ':' + JSON.stringify(o.bundle)).join(',')].join('|');
  },
  build(root, env): BlockBuild {
    const pageW = env.w - SIDE * 2;
    const w = pageW - PAD * 2;
    const inner = new Container();
    const opts = { title: t('shop.sec.daily'), ribbon: 'mustard', tape: 'yellow' } as const;
    if (!profile.featureUnlocked('shop')) {
      const lock = drawIcon('lock', 56);
      lock.position.set(PAD + 44, 56);
      const tx = uiLabel(featureHint('shop'), { size: 28, anchorX: 0, anchorY: 0, wrap: w - 110, lineHeight: 36, align: 'left' });
      tx.position.set(PAD + 100, 56 - tx.height / 2);
      inner.addChild(lock, tx);
      return { height: mountPage(root, 0, pageW, inner, 112, opts) + GAP };
    }
    const view = profile.shopView();
    const sub = uiLabel(t('shop.daily.sub'), { size: 26, color: Color.inkSoft, anchorX: 0 });
    sub.position.set(PAD + 8, 52);
    const refresh = actionButton(
      { label: t('shop.daily.refresh'), icon: 'ad', width: 270, height: 88, style: 'info', fontSize: 26, sublabel: t('shop.daily.refreshLeft', { n: view.refreshesLeft }) },
      () => env.actions.refreshDaily(),
    );
    refresh.setEnabled(view.refreshesLeft > 0 && ads.canOffer('shop_refresh'));
    refresh.onDisabledTap(() => env.actions.refreshDaily());
    refresh.position.set(pageW - PAD - 135, 52);
    inner.addChild(sub, refresh);

    const gap = 12;
    const sw = (w - gap * (COLS - 1)) / COLS;
    const top = 116;
    view.offers.forEach((offer, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      slotCard(inner, PAD + col * (sw + gap), top + row * (SLOT_H + gap), sw, offer, view.bought[i] === true, env);
    });
    return { height: mountPage(root, 0, pageW, inner, top + 2 * SLOT_H + gap, opts) + GAP };
  },
};
