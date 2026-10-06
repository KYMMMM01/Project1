import { Container, Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { fmt } from '@/core/format';
import { featureHint } from '@/meta';
import { profile } from '@/meta';
import { bundleParts, describeBundle } from '@/meta/bundle';
import type { ShopOffer } from '@/meta/shop';
import { ads } from '@/platform';
import { Color, drawIcon, Rarity, uiLabel, vGradient, fitLabel } from '@/ui';
import { partArt } from './art';
import { actionButton, card, GAP, sectionHeader, SIDE, type Block, type BlockBuild, type BlockEnv } from './blockKit';

const COLS = 3;
const SLOT_H = 340;

function slotCard(root: Container, x: number, y: number, w: number, offer: ShopOffer, bought: boolean, env: BlockEnv): void {
  const c = card(root, x, y, w, SLOT_H, 'default');
  const rar = offer.rarity ? Rarity[offer.rarity] : null;
  const plate = new Graphics();
  const pw = w - 36;
  plate.roundRect(18, 18, pw, 150, 20).fill(vGradient(rar ? rar.dark : Color.panelLight, Color.panelDark)).stroke({ width: 4, color: rar ? rar.color : Color.outline, alignment: 1 });
  if (rar) plate.roundRect(24, 24, pw - 12, 50, 16).fill({ color: rar.light, alpha: 0.18 });
  c.addChild(plate);

  const parts = bundleParts(offer.bundle);
  const main = parts[0];
  if (main) {
    const art = partArt(main, 118);
    art.position.set(w / 2, 93);
    c.addChild(art);
    const n = uiLabel('x' + fmt(main.n), { size: 28, strokeWidth: 5, shadow: false });
    const pill = new Graphics();
    const pwid = Math.max(70, n.width + 28);
    pill.roundRect(-pwid / 2, -22, pwid, 44, 22).fill(vGradient(Color.panelLight, Color.panelDark)).stroke({ width: 4, color: Color.outline, alignment: 1 });
    const badge = new Container();
    badge.addChild(pill, n);
    badge.position.set(w - 18 - pwid / 2 - 8, 148);
    c.addChild(badge);
  }

  const name = uiLabel(describeBundle(offer.bundle)[0] ?? '', { size: 24, strokeWidth: 4, shadow: false, wrap: w - 28, lineHeight: 28 });
  fitLabel(name, w - 24, 24);
  name.position.set(w / 2, 202);
  c.addChild(name);

  const by = SLOT_H - 64;
  const bw = w - 28;
  if (bought) {
    const ok = drawIcon('check', 44, Color.success);
    ok.position.set(w / 2 - 66, by);
    const tx = uiLabel(t('shop.daily.bought'), { size: 28, color: Color.success, strokeWidth: 5, shadow: false, anchorX: 0 });
    tx.position.set(w / 2 - 38, by);
    fitLabel(tx, bw / 2 + 10, 28);
    c.addChild(ok, tx);
    c.alpha = 0.9;
    return;
  }
  if (offer.kind === 'free') {
    const b = actionButton({ label: t('shop.daily.free'), width: bw, style: 'success' }, () => env.actions.buySlot(offer.slot));
    b.position.set(w / 2, by);
    c.addChild(b);
    return;
  }
  const gold = offer.price.gold;
  const gems = offer.price.gems;
  const b = actionButton({ label: fmt(gold ?? gems ?? 0), icon: gold !== undefined ? 'coin' : 'gem', width: bw, fontSize: 32 }, () => env.actions.buySlot(offer.slot));
  b.position.set(w / 2, by);
  c.addChild(b);
}

export const dailyBlock: Block = {
  id: 'daily',
  visible: () => true,
  signature: () => {
    const v = profile.shopView();
    return [profile.featureUnlocked('shop'), v.date, v.bought.join(''), v.refreshesLeft, ads.canOffer('shop_refresh'), v.offers.map((o) => o.slot + ':' + JSON.stringify(o.bundle)).join(',')].join('|');
  },
  build(root, env): BlockBuild {
    const w = env.w - SIDE * 2;
    const unlocked = profile.featureUnlocked('shop');
    let y = sectionHeader(root, 0, 'shop', t('shop.sec.daily'), unlocked ? t('shop.daily.sub') : undefined);
    if (!unlocked) {
      const c = card(root, SIDE, y, w, 150);
      const lock = drawIcon('lock', 56);
      lock.position.set(70, 75);
      const tx = uiLabel(featureHint('shop'), { size: 28, strokeWidth: 4, shadow: false, anchorX: 0, anchorY: 0, wrap: w - 170, lineHeight: 36 });
      tx.position.set(120, 75 - tx.height / 2);
      c.addChild(lock, tx);
      return { height: y + 150 + GAP };
    }
    const view = profile.shopView();
    const refresh = actionButton(
      { label: t('shop.daily.refresh'), icon: 'ad', width: 250, height: 88, style: 'info', fontSize: 26, sublabel: t('shop.daily.refreshLeft', { n: view.refreshesLeft }) },
      () => env.actions.refreshDaily(),
    );
    refresh.setEnabled(view.refreshesLeft > 0 && ads.canOffer('shop_refresh'));
    refresh.onDisabledTap(() => env.actions.refreshDaily());
    refresh.position.set(env.w - SIDE - 125, 44);
    root.addChild(refresh);

    const gap = 14;
    const sw = (w - gap * (COLS - 1)) / COLS;
    view.offers.forEach((offer, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      slotCard(root, SIDE + col * (sw + gap), y + row * (SLOT_H + gap), sw, offer, view.bought[i] === true, env);
    });
    y += 2 * SLOT_H + gap + GAP;
    return { height: y };
  },
};
