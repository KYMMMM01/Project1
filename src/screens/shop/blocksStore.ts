import { Container, Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { fmt } from '@/core/format';
import { mixColor } from '@/core/math';
import { profile, tn } from '@/meta';
import { describeBundle } from '@/meta/bundle';
import { GEM_PASS_DAILY, GEM_PASS_INSTANT, IAP_SPECS, type IapSpec } from '@/meta/data/catalog';
import { PIGGY_CAP } from '@/meta/data/economy';
import { iap } from '@/platform';
import { Color, drawIcon, fitLabel, ProgressBar, uiLabel } from '@/ui';
import { chestArt, currencyArt, piggyArt } from './art';
import { actionButton, GAP, mountPage, PAD, SIDE, subCard, type Block, type BlockBuild, type BlockEnv } from './blockKit';
import { bookmark, drawCoupon, stampMark } from './paperBits';
import { gemBonusPercent, listBundleProducts } from './shopLogic';

const canBuy = (id: string): boolean => profile.isPurchasable(id) && iap.isAvailable(id);

/** Everything on sale for real money is hidden together when the platform cannot sell it. */
const storeOpen = (): boolean => iap.isAvailable();

/** Coupon papers: ivory pulled toward a token colour. */
const couponPaper = (tone: number, k = 0.2): number => mixColor(Color.paperLight, tone, k);

/** A pile of gems that grows with the pack: one to four stickers in a fan. */
function gemArt(spec: IapSpec, size: number): Container {
  const n = spec.bundle.gems ?? 0;
  const c = new Container();
  const k = n >= 4000 ? 3 : n >= 1000 ? 2 : n >= 600 ? 1 : 0;
  for (let i = 0; i <= k; i++) {
    const g = currencyArt('gems', size * (0.66 + 0.05 * k));
    g.position.set((i - k / 2) * size * 0.15, (i % 2) * -size * 0.07);
    c.addChild(g);
  }
  return c;
}

/** Width of a coupon's stub (the picture side); the offer starts `COUPON_STUB + 24` from the left edge. */
const COUPON_STUB = 190;

/** A horizontal coupon: a stub with a picture, a perforation, and the offer on the body. */
function horizontalCoupon(inner: Container, y: number, w: number, h: number, tone: number): Container {
  const c = new Container();
  const g = new Graphics();
  drawCoupon(g, w, h, { axis: 'x', at: COUPON_STUB, r: 14 }, couponPaper(tone));
  c.addChild(g);
  c.position.set(PAD, y);
  inner.addChild(c);
  return c;
}

function packCoupon(inner: Container, y: number, w: number, spec: IapSpec, env: BlockEnv): number {
  const x0 = COUPON_STUB + 24;
  const contents = uiLabel(describeBundle(spec.bundle).join(' · '), { size: 26, anchorX: 0, anchorY: 0, wrap: w - x0 - 24, lineHeight: 34, align: 'left' });
  // The coupon grows with the contents (English wraps to a second line) so the price button never covers them.
  const h = Math.max(250, Math.ceil(88 + contents.height + 118));
  const c = horizontalCoupon(inner, y, w, h, Color.mustard);
  const art = chestArt(spec.bundle.chests?.gold ? 'gold' : 'silver', 160);
  art.position.set(95, h / 2 + 4);
  c.addChild(art);
  const name = uiLabel(t(`meta.iap.${spec.id}.name`), { size: 36, anchorX: 0 });
  fitLabel(name, w - x0 - 150, 36);
  name.position.set(x0, 50);
  contents.position.set(x0, 88);
  const b = actionButton({ label: iap.priceText(spec.id), width: w - x0 - 24, style: 'primary', fontSize: 34 }, () => env.actions.buyProduct(spec.id));
  b.position.set(x0 + (w - x0 - 24) / 2, h - 56);
  const ribbon = bookmark(t('shop.gems.once'), 'danger');
  ribbon.position.set(w - 78, -2);
  c.addChild(name, contents, b, ribbon);
  return h;
}

/** A vertical coupon: the gems on top, a perforation, then the name and the price. */
function gemCoupon(inner: Container, x: number, y: number, w: number, h: number, spec: IapSpec, bonus: number, env: BlockEnv): void {
  const c = new Container();
  const g = new Graphics();
  drawCoupon(g, w, h, { axis: 'y', at: 176, r: 14 }, couponPaper(Color.gem, 0.22));
  c.addChild(g);
  c.position.set(x, y);
  inner.addChild(c);
  const art = gemArt(spec, 124);
  art.position.set(w / 2 - 10, 96);
  const name = uiLabel(t(`meta.iap.${spec.id}.name`), { size: 32 });
  fitLabel(name, w - 28, 32);
  name.position.set(w / 2, 210);
  const b = actionButton({ label: iap.priceText(spec.id), width: w - 28, height: 88, style: 'primary', fontSize: 32 }, () => env.actions.buyProduct(spec.id));
  b.position.set(w / 2, h - 54);
  c.addChild(art, name, b);
  if (bonus > 0) {
    const ribbon = bookmark(`+${bonus}%`, 'mustard', 88);
    ribbon.position.set(w - 54, -2);
    c.addChild(ribbon);
  }
}

export const gemsBlock: Block = {
  id: 'gems',
  visible: () => storeOpen(),
  signature: () => IAP_SPECS.map((s) => (canBuy(s.id) ? '1' : '0')).join('') + iap.isAvailable(),
  build(root, env): BlockBuild {
    const pageW = env.w - SIDE * 2;
    const w = pageW - PAD * 2;
    const inner = new Container();
    const sub = uiLabel(t('shop.gems.sub'), { size: 26, color: Color.inkSoft, anchorX: 0, anchorY: 0, wrap: w, lineHeight: 32, align: 'left' });
    sub.position.set(PAD + 8, 0);
    inner.addChild(sub);
    let y = sub.height + 16;
    for (const spec of listBundleProducts(IAP_SPECS, canBuy).filter((s) => s.once)) y += packCoupon(inner, y, w, spec, env) + GAP + 6;
    const gems = IAP_SPECS.filter((s) => s.grant === 'bundle' && !s.once && canBuy(s.id));
    const gap = 14;
    const gw = (w - gap) / 2;
    const gh = 336;
    gems.forEach((spec, i) => gemCoupon(inner, PAD + (i % 2) * (gw + gap), y + Math.floor(i / 2) * (gh + gap + 6), gw, gh, spec, gemBonusPercent(spec, IAP_SPECS), env));
    y += Math.ceil(gems.length / 2) * (gh + gap + 6) - gap;
    return { height: mountPage(root, 0, pageW, inner, y, { title: t('shop.sec.gems'), ribbon: 'info', tape: 'sky' }) + GAP };
  },
};

function butlerCoupon(inner: Container, y: number, w: number, env: BlockEnv): number {
  const owned = profile.data.owned.butler;
  const x0 = COUPON_STUB + 24;
  const title = uiLabel(t('shop.butler.title'), { size: 40, anchorX: 0 });
  const perks = uiLabel(t('shop.butler.perks'), { size: 26, anchorX: 0, anchorY: 0, wrap: w - x0 - 24, lineHeight: 34, align: 'left' });
  const note = uiLabel(t('shop.butler.note'), { size: 24, color: Color.inkSoft, anchorX: 0, anchorY: 0, wrap: w - x0 - 24, lineHeight: 30, align: 'left' });
  perks.position.set(x0, 84);
  note.position.set(x0, 84 + perks.height + 8);
  title.position.set(x0, 48);
  const h = Math.max(232, Math.ceil(84 + perks.height + 8 + note.height + (owned ? 76 : 120)));
  const c = horizontalCoupon(inner, y, w, h, Color.mustard);
  const crown = drawIcon('crown', 136);
  crown.position.set(95, h / 2 + 2);
  c.addChild(crown, title, perks, note);
  if (owned) {
    const stamp = stampMark(t('shop.butler.owned'), { size: 30, color: Color.leafDark, maxWidth: w - x0 - 24, tilt: -0.06 });
    stamp.position.set(x0 + stamp.width / 2, h - 44);
    c.addChild(stamp);
  } else {
    const b = actionButton({ label: iap.priceText('butler_pass'), width: w - x0 - 24, style: 'primary', fontSize: 34 }, () => env.actions.buyProduct('butler_pass'));
    b.position.set(x0 + (w - x0 - 24) / 2, h - 56);
    c.addChild(b);
  }
  return h;
}

function gemPassCoupon(inner: Container, y: number, w: number, env: BlockEnv): number {
  const v = profile.gemPassView();
  const h = 256;
  const x0 = COUPON_STUB + 24;
  const c = horizontalCoupon(inner, y, w, h, Color.gem);
  const art = currencyArt('gems', 130);
  art.position.set(95, h / 2);
  const title = uiLabel(t('shop.gempass.title'), { size: 36, anchorX: 0 });
  fitLabel(title, w - x0 - 24, 36);
  title.position.set(x0, 48);
  const days = Math.max(0, Math.ceil((v.until - Date.now()) / 86_400_000));
  const sub = v.active ? tn('shop.gempass.left', days, { days }) : t('shop.gempass.desc', { now: GEM_PASS_INSTANT, daily: GEM_PASS_DAILY });
  const desc = uiLabel(sub, { size: 26, color: Color.inkSoft, anchorX: 0, anchorY: 0, wrap: w - x0 - 24, lineHeight: 32, align: 'left' });
  desc.position.set(x0, 84);
  c.addChild(art, title, desc);
  const bw = w - x0 - 24;
  if (v.active) {
    const b = actionButton({ label: v.canClaim ? t('shop.gempass.claim', { n: v.daily }) : t('shop.gempass.claimed'), width: bw, style: 'success', fontSize: 30, icon: v.canClaim ? 'gem' : undefined }, () => env.actions.claimGemPass());
    b.setEnabled(v.canClaim);
    b.position.set(x0 + bw / 2, h - 56);
    c.addChild(b);
  } else {
    const b = actionButton({ label: iap.priceText('gem_pass'), width: bw, style: 'primary', fontSize: 34 }, () => env.actions.buyProduct('gem_pass'));
    b.position.set(x0 + bw / 2, h - 56);
    c.addChild(b);
  }
  return h;
}

function piggyCard(inner: Container, y: number, w: number, env: BlockEnv): number {
  const p = profile.piggyView();
  const canBreak = storeOpen() && p.gems > 0;
  const buttons = (p.freeBreakReady ? 1 : 0) + (canBreak ? 1 : 0);
  const h = 238 + buttons * 108;
  const card = subCard(inner, PAD, y, w, h);
  const art = piggyArt(168);
  art.position.set(100, 110);
  card.addChild(art);
  const x0 = 214;
  const bw = w - x0 - 22;
  const desc = uiLabel(t('shop.piggy.desc'), { size: 26, color: Color.inkSoft, anchorX: 0, anchorY: 0, wrap: bw, lineHeight: 32, align: 'left' });
  desc.position.set(x0, 22);
  const bar = new ProgressBar({ width: bw, height: 52, color: 'cyan', label: t('shop.piggy.pool', { n: fmt(p.gems), cap: fmt(p.cap) }) });
  bar.position.set(x0 + bw / 2, 128);
  bar.setValue(p.gems / PIGGY_CAP, false);
  card.addChild(desc, bar);
  const note = p.gems === 0 ? t('shop.piggy.empty') : !p.freeBreakReady ? t('meta.piggy.free', { days: p.daysUntilFree, n: fmt(p.freeBreakGems) }) : '';
  if (note) {
    const line = uiLabel(note, { size: 24, color: Color.inkSoft, anchorX: 0, anchorY: 0, wrap: bw, lineHeight: 30, align: 'left' });
    line.position.set(x0, 164);
    card.addChild(line);
  }
  const wide = w - 44;
  let by = h - 56;
  if (p.freeBreakReady) {
    const free = actionButton({ label: t('shop.piggy.free', { n: fmt(p.freeBreakGems) }), icon: 'gem', width: wide, style: 'success', fontSize: 30 }, () => env.actions.breakPiggyFree());
    free.position.set(w / 2, by);
    card.addChild(free);
    by -= 110;
  }
  if (canBreak) {
    const brk = actionButton({ label: t('shop.piggy.break'), width: wide, style: 'primary', sublabel: iap.priceText('piggy_bank'), fontSize: 32 }, () => env.actions.buyProduct('piggy_bank'));
    brk.position.set(w / 2, by);
    card.addChild(brk);
  }
  return h;
}

export const passBlock: Block = {
  id: 'pass',
  visible: () => storeOpen() || profile.data.owned.butler || profile.gemPassView().active || profile.piggyView().freeBreakReady,
  signature: () => {
    const g = profile.gemPassView();
    const p = profile.piggyView();
    return [profile.data.owned.butler, g.active, g.canClaim, p.gems, p.freeBreakReady, p.daysUntilFree, storeOpen()].join('|');
  },
  build(root, env): BlockBuild {
    const pageW = env.w - SIDE * 2;
    const w = pageW - PAD * 2;
    const open = storeOpen();
    let height = 0;
    if (open || profile.data.owned.butler || profile.gemPassView().active) {
      const inner = new Container();
      let y = 4;
      if (open || profile.data.owned.butler) y += butlerCoupon(inner, y, w, env) + GAP;
      if (open || profile.gemPassView().active) y += gemPassCoupon(inner, y, w, env) + GAP;
      height += mountPage(root, height, pageW, inner, y - GAP, { title: t('shop.sec.pass'), ribbon: 'mustard', tape: 'yellow' }) + GAP;
    }
    const piggyAt = height;
    const inner = new Container();
    const h = piggyCard(inner, 4, w, env);
    height += mountPage(root, height, pageW, inner, h + 4, { title: t('shop.sec.piggy'), ribbon: 'danger', tape: 'pink' }) + GAP;
    return { height, anchors: { piggy: piggyAt } };
  },
};
