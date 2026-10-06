import { Container, Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { profile } from '@/meta';
import { TICKET_AD_AMOUNT } from '@/meta/data/economy';
import type { CosmeticRow } from '@/meta/economy';
import { buildRug, RUG_H, RUG_W } from '@/view/field/rug';
import { rugSkin } from '@/view/field/rugSkins';
import { themeOf } from '@/view/director/palette';
import { Color, drawGlow, drawIcon, uiLabel, fitLabel, vGradient } from '@/ui';
import { currencyArt } from './art';
import { actionButton, card, currencyButton, GAP, sectionHeader, SIDE, type Block, type BlockBuild, type BlockEnv } from './blockKit';
import { cosmeticStatus } from './shopLogic';

const CARD_H = 330;
const PREVIEW_H = 170;
const COLS = 2;

/** Skin previews are expensive to bake, so each one is built once and re-parented when the block is rebuilt. */
const rugCache = new Map<string, Container>();

/** Take every cached preview out of the tree so rebuilding the block does not destroy them. */
export function detachRugPreviews(): void {
  for (const c of rugCache.values()) c.parent?.removeChild(c);
}

export function disposeRugPreviews(): void {
  for (const c of rugCache.values()) c.destroy({ children: true });
  rugCache.clear();
}

function rugPreview(id: string, w: number): Container {
  let rug = rugCache.get(id);
  if (!rug) {
    rug = buildRug(rugSkin(id));
    rugCache.set(id, rug);
  }
  const holder = new Container();
  rug.parent?.removeChild(rug);
  const k = Math.min((w - 40) / RUG_W, (PREVIEW_H - 24) / RUG_H);
  rug.scale.set(k);
  rug.position.set((w - RUG_W * k) / 2, (PREVIEW_H - RUG_H * k) / 2);
  holder.addChild(rug);
  return holder;
}

function fxPreview(id: string, w: number, env: BlockEnv): Container {
  const theme = themeOf(id);
  const holder = new Container();
  const g = new Graphics();
  g.roundRect(0, 0, w, PREVIEW_H, 20).fill(vGradient(Color.panelLight, Color.bgDeep));
  drawGlow(g, w / 2, PREVIEW_H / 2, 70, theme.colors[0] ?? Color.white, 0.4);
  holder.addChild(g);
  const star = drawIcon('paw', 76, theme.colors[1] ?? theme.colors[0]);
  star.position.set(w / 2, PREVIEW_H / 2 - 6);
  holder.addChild(star);
  const play = drawIcon('play', 44);
  play.position.set(w - 40, PREVIEW_H - 38);
  holder.addChild(play);
  holder.eventMode = 'static';
  holder.cursor = 'pointer';
  holder.on('pointertap', () => env.actions.previewFx(id, holder));
  return holder;
}

function cosmeticCard(root: Container, x: number, y: number, w: number, row: CosmeticRow, env: BlockEnv): void {
  const c = card(root, x, y, w, CARD_H, row.equipped ? 'gold' : 'default');
  const pv = row.kind === 'rug' ? rugPreview(row.id, w) : fxPreview(row.id, w, env);
  pv.position.set(0, 14);
  c.addChild(pv);
  const name = uiLabel(t('meta.cos.' + row.id), { size: 28, strokeWidth: 5, shadow: false });
  fitLabel(name, w - 28, 28);
  name.position.set(w / 2, PREVIEW_H + 44);
  c.addChild(name);
  const st = cosmeticStatus(row);
  const by = CARD_H - 56;
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
      const b = actionButton({ label: String(st.gems), icon: 'gem', width: bw, fontSize: 32 }, () => env.actions.buyCosmetic(row.id));
      b.position.set(w / 2, by);
      c.addChild(b);
      break;
    }
    case 'chapter':
    case 'reward': {
      const lock = drawIcon('lock', 34);
      lock.position.set(28, by);
      const tx = uiLabel(st.kind === 'chapter' ? t('shop.cos.chapter', { n: st.chapter }) : t('shop.cos.reward'), {
        size: 24, color: Color.textDim, strokeWidth: 4, shadow: false, anchorX: 0, wrap: w - 80, lineHeight: 28,
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
    const w = env.w - SIDE * 2;
    let y = sectionHeader(root, 0, 'wardrobe', t('shop.sec.cosmetics'));
    const gap = 14;
    const cw = (w - gap * (COLS - 1)) / COLS;
    const rows = profile.cosmetics();
    for (const kind of ['rug', 'fx'] as const) {
      const sub = uiLabel(t(kind === 'rug' ? 'shop.cos.rugs' : 'shop.cos.fx'), { size: 32, color: Color.primary, strokeWidth: 5, anchorX: 0 });
      sub.position.set(SIDE + 8, y + 20);
      root.addChild(sub);
      y += 52;
      const list = rows.filter((r) => r.kind === kind);
      list.forEach((row, i) => cosmeticCard(root, SIDE + (i % COLS) * (cw + gap), y + Math.floor(i / COLS) * (CARD_H + gap), cw, row, env));
      y += Math.ceil(list.length / COLS) * (CARD_H + gap) + 8;
    }
    return { height: y + GAP };
  },
};

export const ticketsBlock: Block = {
  id: 'tickets',
  visible: () => true,
  signature: () => {
    const v = profile.ticketView();
    return [v.count, v.stock, v.adsLeft].join('|');
  },
  build(root, env): BlockBuild {
    const w = env.w - SIDE * 2;
    const v = profile.ticketView();
    let y = sectionHeader(root, 0, 'ticket', t('shop.sec.tickets'), t('shop.tickets.sub'));
    const h = 270;
    const c = card(root, SIDE, y, w, h);
    const art = currencyArt('tickets', 130);
    art.position.set(100, 100);
    c.addChild(art);
    const have = uiLabel(t('shop.tickets.have', { n: v.count, stock: v.stock }), { size: 40, strokeWidth: 7, anchorX: 0 });
    have.position.set(200, 60);
    fitLabel(have, w - 224, 40);
    c.addChild(have);
    const bw = (w - 28 - 14) / 2;
    const buy = currencyButton(t('shop.tickets.buy'), v.gemPrice, 'gems', bw, () => env.actions.buyTicket(), 'neutral');
    buy.position.set(14 + bw / 2, h - 66);
    const ad = actionButton(
      { label: t('shop.tickets.ad', { n: TICKET_AD_AMOUNT }), icon: 'ad', width: bw, style: 'info', sublabel: t('shop.tickets.adLeft', { n: v.adsLeft }), fontSize: 26 },
      () => env.actions.ticketAd(),
    );
    ad.setEnabled(v.adsLeft > 0);
    ad.onDisabledTap(() => env.actions.ticketAd());
    ad.position.set(14 + bw + 14 + bw / 2, h - 66);
    c.addChild(buy, ad);
    y += h + GAP;
    return { height: y };
  },
};
