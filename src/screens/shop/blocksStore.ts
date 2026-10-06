import { Container, Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { fmt } from '@/core/format';
import { profile } from '@/meta';
import { describeBundle } from '@/meta/bundle';
import { GEM_PASS_DAILY, GEM_PASS_INSTANT, IAP_SPECS, type IapSpec } from '@/meta/data/catalog';
import { PIGGY_CAP } from '@/meta/data/economy';
import { iap } from '@/platform';
import { Color, drawGlow, drawIcon, ProgressBar, Tag, uiLabel, fitLabel } from '@/ui';
import { chestArt, currencyArt } from './art';
import { actionButton, card, GAP, sectionHeader, SIDE, type Block, type BlockBuild, type BlockEnv } from './blockKit';
import { listBundleProducts } from './shopLogic';

const canBuy = (id: string): boolean => profile.isPurchasable(id) && iap.isAvailable(id);

/** Everything on sale for real money is hidden together when the platform cannot sell it. */
const storeOpen = (): boolean => iap.isAvailable();

function gemArt(spec: IapSpec, size: number): Container {
  const n = spec.bundle.gems ?? 0;
  const c = new Container();
  const k = n >= 4000 ? 3 : n >= 1000 ? 2 : n >= 600 ? 1 : 0;
  const glow = new Graphics();
  drawGlow(glow, 0, 0, size * 0.7, Color.gem, 0.35);
  c.addChild(glow);
  for (let i = 0; i <= k; i++) {
    const g = currencyArt('gems', size * (0.7 + 0.1 * k));
    g.position.set((i - k / 2) * size * 0.2, (i % 2) * -size * 0.08);
    c.addChild(g);
  }
  return c;
}

function packCard(root: Container, y: number, w: number, spec: IapSpec, env: BlockEnv): number {
  const h = 230;
  const c = card(root, SIDE, y, w, h);
  const kind = spec.bundle.chests?.gold ? 'gold' : 'silver';
  const glow = new Graphics();
  drawGlow(glow, 110, 115, 110, kind === 'gold' ? Color.gold : Color.gem, 0.35);
  c.addChild(glow);
  const art = chestArt(kind, 170);
  art.position.set(110, 115);
  c.addChild(art);
  const x0 = 224;
  const name = uiLabel(t(`meta.iap.${spec.id}.name`), { size: 36, strokeWidth: 6, anchorX: 0 });
  fitLabel(name, w - x0 - 130, 36);
  name.position.set(x0, 42);
  c.addChild(name);
  const tag = new Tag({ text: t('shop.gems.once'), style: 'danger', shape: 'pill', fontSize: 22, tilt: 0.06 });
  tag.position.set(w - 24 - tag.uiBox.w / 2, 38);
  c.addChild(tag);
  const contents = uiLabel(describeBundle(spec.bundle).join(' · '), { size: 26, strokeWidth: 4, shadow: false, anchorX: 0, anchorY: 0, wrap: w - x0 - 24, lineHeight: 34 });
  contents.position.set(x0, 78);
  c.addChild(contents);
  const b = actionButton({ label: iap.priceText(spec.id), width: w - x0 - 24, style: 'primary', fontSize: 34 }, () => env.actions.buyProduct(spec.id));
  b.position.set(x0 + (w - x0 - 24) / 2, h - 60);
  c.addChild(b);
  return h;
}

function gemCard(root: Container, x: number, y: number, w: number, h: number, spec: IapSpec, env: BlockEnv): void {
  const c = card(root, x, y, w, h);
  const art = gemArt(spec, 130);
  art.position.set(w / 2, 100);
  c.addChild(art);
  const name = uiLabel(t(`meta.iap.${spec.id}.name`), { size: 32, strokeWidth: 5, shadow: false });
  fitLabel(name, w - 28, 32);
  name.position.set(w / 2, 196);
  c.addChild(name);
  if (spec.id === 'gems_680') {
    const tag = new Tag({ text: t('shop.gems.best'), style: 'danger', shape: 'flag', fontSize: 22, tilt: 0.1 });
    tag.position.set(w - tag.uiBox.w / 2 - 4, 30);
    c.addChild(tag);
  }
  const b = actionButton({ label: iap.priceText(spec.id), width: w - 28, style: 'success', fontSize: 32 }, () => env.actions.buyProduct(spec.id));
  b.position.set(w / 2, h - 58);
  c.addChild(b);
}

export const gemsBlock: Block = {
  id: 'gems',
  visible: () => storeOpen(),
  signature: () => IAP_SPECS.map((s) => (canBuy(s.id) ? '1' : '0')).join('') + iap.isAvailable(),
  build(root, env): BlockBuild {
    const w = env.w - SIDE * 2;
    let y = sectionHeader(root, 0, 'gem', t('shop.sec.gems'), t('shop.gems.sub'));
    const packs = listBundleProducts(IAP_SPECS, canBuy).filter((s) => s.once);
    for (const spec of packs) y += packCard(root, y, w, spec, env) + GAP;
    const gems = IAP_SPECS.filter((s) => s.grant === 'bundle' && !s.once && canBuy(s.id));
    const gap = 14;
    const gw = (w - gap) / 2;
    const gh = 300;
    gems.forEach((spec, i) => gemCard(root, SIDE + (i % 2) * (gw + gap), y + Math.floor(i / 2) * (gh + gap), gw, gh, spec, env));
    y += Math.ceil(gems.length / 2) * (gh + gap) + GAP - gap;
    return { height: y };
  },
};

function butlerCard(root: Container, y: number, w: number, env: BlockEnv): number {
  const owned = profile.data.owned.butler;
  const h = owned ? 220 : 330;
  const c = card(root, SIDE, y, w, h, 'gold');
  const glow = new Graphics();
  drawGlow(glow, 100, 100, 100, Color.gold, 0.45);
  c.addChild(glow);
  const crown = drawIcon('crown', 150);
  crown.position.set(100, 100);
  c.addChild(crown);
  const x0 = 200;
  const title = uiLabel(t('shop.butler.title'), { size: 40, strokeWidth: 7, anchorX: 0 });
  title.position.set(x0, 46);
  c.addChild(title);
  const perks = uiLabel(t('shop.butler.perks'), { size: 26, strokeWidth: 4, shadow: false, anchorX: 0, anchorY: 0, wrap: w - x0 - 24, lineHeight: 34 });
  perks.position.set(x0, 86);
  c.addChild(perks);
  const note = uiLabel(t('shop.butler.note'), { size: 24, color: Color.textDim, strokeWidth: 4, shadow: false, anchorX: 0, anchorY: 0, wrap: w - x0 - 24, lineHeight: 30 });
  note.position.set(x0, 86 + perks.height + 10);
  c.addChild(note);
  if (owned) {
    const ok = drawIcon('check', 44, Color.success);
    ok.position.set(x0 + 22, h - 46);
    const tx = uiLabel(t('shop.butler.owned'), { size: 30, color: Color.success, strokeWidth: 5, shadow: false, anchorX: 0 });
    tx.position.set(x0 + 56, h - 46);
    c.addChild(ok, tx);
  } else {
    const b = actionButton({ label: iap.priceText('butler_pass'), width: w - x0 - 24, style: 'primary', fontSize: 34 }, () => env.actions.buyProduct('butler_pass'));
    b.position.set(x0 + (w - x0 - 24) / 2, h - 60);
    c.addChild(b);
  }
  return h;
}

function gemPassCard(root: Container, y: number, w: number, env: BlockEnv): number {
  const v = profile.gemPassView();
  const h = 250;
  const c = card(root, SIDE, y, w, h);
  const art = currencyArt('gems', 140);
  art.position.set(100, 110);
  c.addChild(art);
  const x0 = 200;
  const title = uiLabel(t('shop.gempass.title'), { size: 36, strokeWidth: 6, anchorX: 0 });
  fitLabel(title, w - x0 - 24, 36);
  title.position.set(x0, 44);
  c.addChild(title);
  const days = Math.max(0, Math.ceil((v.until - Date.now()) / 86_400_000));
  const sub = v.active ? t('shop.gempass.left', { days }) : t('shop.gempass.desc', { now: GEM_PASS_INSTANT, daily: GEM_PASS_DAILY });
  const desc = uiLabel(sub, { size: 26, color: Color.textDim, strokeWidth: 4, shadow: false, anchorX: 0, anchorY: 0, wrap: w - x0 - 24, lineHeight: 32 });
  desc.position.set(x0, 82);
  c.addChild(desc);
  const bw = w - x0 - 24;
  if (v.active) {
    const b = actionButton({ label: v.canClaim ? t('shop.gempass.claim', { n: v.daily }) : t('shop.gempass.claimed'), width: bw, style: 'success', fontSize: 30, icon: v.canClaim ? 'gem' : undefined }, () => env.actions.claimGemPass());
    b.setEnabled(v.canClaim);
    b.position.set(x0 + bw / 2, h - 58);
    c.addChild(b);
  } else {
    const b = actionButton({ label: iap.priceText('gem_pass'), width: bw, style: 'primary', fontSize: 34 }, () => env.actions.buyProduct('gem_pass'));
    b.position.set(x0 + bw / 2, h - 58);
    c.addChild(b);
  }
  return h;
}

function piggyCard(root: Container, y: number, w: number, env: BlockEnv): number {
  const p = profile.piggyView();
  const open = storeOpen();
  const h = 360;
  const c = card(root, SIDE, y, w, h);
  const glow = new Graphics();
  drawGlow(glow, 100, 96, 90, Color.gem, 0.3);
  c.addChild(glow);
  const art = currencyArt('gems', 140);
  art.position.set(100, 96);
  c.addChild(art);
  const x0 = 200;
  const desc = uiLabel(t('shop.piggy.desc'), { size: 26, color: Color.textDim, strokeWidth: 4, shadow: false, anchorX: 0, anchorY: 0, wrap: w - x0 - 24, lineHeight: 32 });
  desc.position.set(x0, 26);
  c.addChild(desc);
  const bar = new ProgressBar({ width: w - x0 - 24, height: 52, color: 'cyan', label: t('shop.piggy.pool', { n: fmt(p.gems), cap: fmt(p.cap) }) });
  bar.position.set(x0 + (w - x0 - 24) / 2, 124);
  bar.setValue(p.gems / PIGGY_CAP, false);
  c.addChild(bar);
  if (p.gems === 0) {
    const empty = uiLabel(t('shop.piggy.empty'), { size: 24, color: Color.textDim, strokeWidth: 4, shadow: false, anchorX: 0, anchorY: 0, wrap: w - x0 - 24, lineHeight: 30 });
    empty.position.set(x0, 160);
    c.addChild(empty);
  } else if (!p.freeBreakReady) {
    const wait = uiLabel(t('meta.piggy.free', { days: p.daysUntilFree, n: fmt(p.freeBreakGems) }), { size: 24, color: Color.textDim, strokeWidth: 4, shadow: false, anchorX: 0, anchorY: 0, wrap: w - x0 - 24, lineHeight: 30 });
    wait.position.set(x0, 160);
    c.addChild(wait);
  }
  const bw = w - 56;
  let by = h - 56;
  if (p.freeBreakReady) {
    const free = actionButton({ label: t('shop.piggy.free', { n: fmt(p.freeBreakGems) }), icon: 'gem', width: bw, style: 'success', fontSize: 30 }, () => env.actions.breakPiggyFree());
    free.position.set(w / 2, by);
    c.addChild(free);
    by -= 110;
  }
  if (open && p.gems > 0) {
    const brk = actionButton({ label: t('shop.piggy.break'), width: bw, style: 'primary', sublabel: iap.priceText('piggy_bank'), fontSize: 32 }, () => env.actions.buyProduct('piggy_bank'));
    brk.position.set(w / 2, by);
    c.addChild(brk);
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
    const w = env.w - SIDE * 2;
    const open = storeOpen();
    let y = sectionHeader(root, 0, 'crown', t('shop.sec.pass'));
    if (open || profile.data.owned.butler) y += butlerCard(root, y, w, env) + GAP;
    if (open || profile.gemPassView().active) y += gemPassCard(root, y, w, env) + GAP;
    const piggyAt = y;
    y += sectionHeader(root, y, 'gem', t('shop.sec.piggy'));
    y += piggyCard(root, y, w, env) + GAP;
    return { height: y, anchors: { piggy: piggyAt } };
  },
};
