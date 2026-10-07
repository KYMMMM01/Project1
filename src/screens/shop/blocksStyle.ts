import { Container, Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { mixColor } from '@/core/math';
import { profile } from '@/meta';
import { ads } from '@/platform';
import { TICKET_AD_AMOUNT } from '@/meta/data/economy';
import type { CosmeticRow } from '@/meta/economy';
import { buildRug, RUG_H, RUG_W } from '@/view/field/rug';
import { rugSkin } from '@/view/field/rugSkins';
import { themeOf } from '@/view/director/palette';
import { cacheStatic, Color, drawIcon, fitLabel, paperSeed, paperShape, PaperLabel, tapeStrip, uiLabel } from '@/ui';
import { currencyArt } from './art';
import { actionButton, GAP, mountPage, PAD, SIDE, subCard, type Block, type BlockBuild, type BlockEnv } from './blockKit';
import { drawCoupon, PriceTag } from './paperBits';
import { cosmeticStatus } from './shopLogic';

const CARD_H = 336;
const PREVIEW_H = 170;
const COLS = 2;

/** Skin previews are expensive to bake, so each one is built once and re-parented when the block is rebuilt. */
const rugCache = new Map<string, Container>();

/** What was equipped the last time the block was built, to tell a new choice (tape slapped on) from a page that was already so. */
const wasEquipped = new Map<CosmeticRow['kind'], string>();

/** Take every cached preview out of the tree so rebuilding the block does not destroy them. */
export function detachRugPreviews(): void {
  for (const c of rugCache.values()) c.parent?.removeChild(c);
}

export function disposeRugPreviews(): void {
  for (const c of rugCache.values()) c.destroy({ children: true });
  rugCache.clear();
}

/** The paperDim well a swatch sits in. */
function well(w: number): Container {
  const c = new Container();
  const piece = paperShape({ w, h: PREVIEW_H, radius: 18, fill: Color.paperDim, edge: Color.kraftDark, edgeAlpha: 0.5, shadow: false, grain: false, seed: paperSeed() });
  piece.position.set(w / 2, PREVIEW_H / 2);
  c.addChild(piece);
  return c;
}

/** The real mat, small, lying in its well. */
function rugPreview(id: string, w: number): Container {
  let rug = rugCache.get(id);
  if (!rug) {
    rug = buildRug(rugSkin(id));
    rugCache.set(id, rug);
  }
  const holder = well(w);
  rug.parent?.removeChild(rug);
  const k = Math.min((w - 30) / RUG_W, (PREVIEW_H - 26) / RUG_H);
  rug.scale.set(k);
  rug.position.set((w - RUG_W * k) / 2, (PREVIEW_H - RUG_H * k) / 2);
  holder.addChild(rug);
  return holder;
}

/** A burst of the effect's own paper bits round a paw sticker; tapping it plays the real effect. */
function fxPreview(id: string, w: number, env: BlockEnv): Container {
  const theme = themeOf(id);
  const holder = well(w);
  const bits = new Graphics();
  const colors = theme.colors.length > 0 ? theme.colors : [Color.coral, Color.mustard];
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4;
    const r = 44 + (i % 4) * 11 + i * 1.6;
    const x = w / 2 + Math.cos(a) * r * 1.35;
    const y = PREVIEW_H / 2 + Math.sin(a) * r * 0.78;
    const s = 5 + (i % 3) * 2.5;
    const col = colors[i % colors.length] as number;
    if (i % 2 === 0) bits.circle(x, y, s).fill(col);
    else bits.poly([x, y - s * 1.3, x + s, y, x, y + s * 1.3, x - s, y]).fill(col);
  }
  cacheStatic(bits);
  const paw = drawIcon('paw', 70, colors[0]);
  paw.position.set(w / 2, PREVIEW_H / 2 - 4);
  const play = drawIcon('play', 40);
  play.position.set(w - 34, PREVIEW_H - 32);
  holder.addChild(bits, paw, play);
  holder.eventMode = 'static';
  holder.cursor = 'pointer';
  holder.on('pointertap', () => env.actions.previewFx(id, holder));
  return holder;
}

function cosmeticCard(inner: Container, x: number, y: number, w: number, row: CosmeticRow, env: BlockEnv): void {
  const c = subCard(inner, x, y, w, CARD_H, row.equipped ? mixColor(Color.paperLight, Color.mustard, 0.22) : Color.paperLight);
  const pv = row.kind === 'rug' ? rugPreview(row.id, w - 24) : fxPreview(row.id, w - 24, env);
  pv.position.set(12, 12);
  c.addChild(pv);
  if (row.equipped) {
    const tape = tapeStrip({ name: 'yellow', w: 84, h: 28, angle: -22, pattern: 'dots' });
    tape.position.set(26, 14);
    c.addChild(tape);
    const before = wasEquipped.get(row.kind);
    if (before !== undefined && before !== row.id) c.slap(tape);
    wasEquipped.set(row.kind, row.id);
  }
  const name = uiLabel(t('meta.cos.' + row.id), { size: 28 });
  fitLabel(name, w - 28, 28);
  name.position.set(w / 2, PREVIEW_H + 44);
  c.addChild(name);
  const st = cosmeticStatus(row);
  const by = CARD_H - 54;
  const bw = w - 28;
  switch (st.kind) {
    case 'equipped': {
      const b = actionButton({ label: t('shop.cos.equipped'), icon: 'check', width: bw, style: 'neutral', fontSize: 28 }, () => undefined);
      b.setEnabled(false);
      b.position.set(w / 2, by);
      c.addChild(b);
      break;
    }
    case 'equip': {
      const b = actionButton({ label: t('shop.cos.equip'), width: bw, style: 'info', fontSize: 30 }, () => env.actions.equip(row.id));
      b.position.set(w / 2, by);
      c.addChild(b);
      break;
    }
    case 'buy': {
      const tag = new PriceTag({ width: bw, style: 'primary', currency: 'gems', amount: st.gems, fontSize: 32 });
      tag.onTap(() => env.actions.buyCosmetic(row.id));
      tag.position.set(w / 2, by);
      c.addChild(tag);
      break;
    }
    case 'chapter':
    case 'reward': {
      const lock = drawIcon('lock', 34);
      lock.position.set(30, by);
      const tx = uiLabel(st.kind === 'chapter' ? t('shop.cos.chapter', { n: st.chapter }) : t('shop.cos.reward'), {
        size: 24, color: Color.inkSoft, anchorX: 0, wrap: w - 90, lineHeight: 28, align: 'left',
      });
      tx.position.set(56, by);
      c.addChild(lock, tx);
      break;
    }
  }
}

export const cosmeticsBlock: Block = {
  id: 'cosmetics',
  visible: () => true,
  signature: () => {
    const c = profile.data.cosmetics;
    return [profile.featureUnlocked('cosmetics'), c.owned.join(','), c.rug, c.fx].join('|');
  },
  build(root, env): BlockBuild {
    const pageW = env.w - SIDE * 2;
    const w = pageW - PAD * 2;
    const inner = new Container();
    const gap = 14;
    const cw = (w - gap * (COLS - 1)) / COLS;
    const rows = profile.cosmetics();
    let y = 4;
    for (const kind of ['rug', 'fx'] as const) {
      const sub = new PaperLabel({ text: t(kind === 'rug' ? 'shop.cos.rugs' : 'shop.cos.fx'), size: 30, paper: 'kraft', minWidth: 150 });
      sub.position.set(PAD + sub.uiBox.w / 2, y + 28);
      inner.addChild(sub);
      y += 66;
      const list = rows.filter((r) => r.kind === kind);
      list.forEach((row, i) => cosmeticCard(inner, PAD + (i % COLS) * (cw + gap), y + Math.floor(i / COLS) * (CARD_H + gap), cw, row, env));
      y += Math.ceil(list.length / COLS) * (CARD_H + gap) + 6;
    }
    return { height: mountPage(root, 0, pageW, inner, y - gap, { title: t('shop.sec.cosmetics'), ribbon: 'success', tape: 'green' }) + GAP };
  },
};

export const ticketsBlock: Block = {
  id: 'tickets',
  visible: () => true,
  signature: () => {
    const v = profile.ticketView();
    return [v.count, v.stock, v.adsLeft, ads.canOffer('sweep_ticket')].join('|');
  },
  build(root, env): BlockBuild {
    const pageW = env.w - SIDE * 2;
    const w = pageW - PAD * 2;
    const v = profile.ticketView();
    const inner = new Container();
    const sub = uiLabel(t('shop.tickets.sub'), { size: 26, color: Color.inkSoft, anchorX: 0, anchorY: 0, wrap: w, lineHeight: 32, align: 'left' });
    sub.position.set(PAD + 8, 0);
    inner.addChild(sub);
    const y = sub.height + 16;
    const h = 276;
    const c = new Container();
    const g = new Graphics();
    drawCoupon(g, w, h, { axis: 'x', at: 190, r: 14 }, mixColor(Color.paperLight, Color.mustard, 0.2));
    c.addChild(g);
    c.position.set(PAD, y);
    inner.addChild(c);
    const art = currencyArt('tickets', 130);
    art.position.set(95, h / 2);
    const x0 = 214;
    const have = uiLabel(t('shop.tickets.have', { n: v.count, stock: v.stock }), { size: 40, anchorX: 0 });
    fitLabel(have, w - x0 - 24, 40);
    have.position.set(x0, 56);
    c.addChild(art, have);
    const bw = w - x0 - 22;
    const buy = new PriceTag({ width: bw, style: 'primary', currency: 'gems', amount: v.gemPrice, label: t('shop.tickets.buy') });
    buy.onTap(() => env.actions.buyTicket());
    buy.position.set(x0 + bw / 2, 128);
    const ad = actionButton(
      { label: t('shop.tickets.ad', { n: TICKET_AD_AMOUNT }), icon: 'ad', width: bw, style: 'info', sublabel: t('shop.tickets.adLeft', { n: v.adsLeft }), fontSize: 26 },
      () => env.actions.ticketAd(),
    );
    ad.setEnabled(v.adsLeft > 0 && ads.canOffer('sweep_ticket'));
    ad.onDisabledTap(() => env.actions.ticketAd());
    ad.position.set(x0 + bw / 2, h - 60);
    c.addChild(buy, ad);
    return { height: mountPage(root, 0, pageW, inner, y + h + 4, { title: t('shop.sec.tickets'), ribbon: 'danger', tape: 'sky' }) + GAP };
  },
};
