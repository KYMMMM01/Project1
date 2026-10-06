/**
 * The toy choice between acts: a full screen with three large toy cards, each a paper photo frame
 * pinned down with tape, and one inline reroll offer (free first, then an ad or gems through the meta
 * layer). The card list always mirrors battle.pending, so rerolls, multi-picks and restored runs need
 * no special cases.
 */
import { Container, Graphics } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { mixColor } from '@/core/math';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { flyTo } from '@/fx';
import { relicDef, type PendingChoice } from '@/game';
import { errorKey, profile } from '@/meta';
import { ads } from '@/platform';
import {
  Button,
  Color,
  drawDashedRect,
  drawPaper,
  drawPaperFace,
  fitLabel,
  motion,
  PaperLabel,
  paperSeed,
  Rarity,
  rarityName,
  RARITY_GOLD,
  ScreenScaffold,
  tapeStrip,
  Tag,
  TweenBag,
  toast,
  uiLabel,
  type TapeName,
} from '@/ui';
import type { HudEnv } from '../env';
import { PressCard, relicIcon } from '../kit';
import { offerRoute } from '../policy';

const CARD_W = 672;
const CARD_H = 216;
const GAP = 18;
const TOP = 152;
/** The mat the toy lies on: a square window at the card's left. */
const MAT = 176;
const MAT_PAD = 20;

type RelicPending = Extract<PendingChoice, { kind: 'relic' }>;

/** One strip of tape per card, a different print for each rarity so a row of cards is never one flat colour. */
const TAPE: Record<'common' | 'rare' | 'epic' | 'legendary', { name: TapeName; pattern: 'dots' | 'gingham' | 'stripes' }> = {
  common: { name: 'sky', pattern: 'dots' },
  rare: { name: 'green', pattern: 'gingham' },
  epic: { name: 'pink', pattern: 'dots' },
  legendary: { name: 'yellow', pattern: 'stripes' },
};

export class RelicScreen {
  private readonly scaffold: ScreenScaffold;
  private readonly bag = new TweenBag();
  private readonly release: () => void;
  private readonly seed = paperSeed();
  private cards: PressCard[] = [];
  private head: Container | null = null;
  private busy = false;
  private closed = false;
  private optionKey = '';
  private readonly offResize: () => void;

  constructor(
    private readonly env: HudEnv,
    private readonly onClose: () => void,
  ) {
    this.scaffold = new ScreenScaffold({ title: t('hud.relic.title'), scroll: false, actionBarHeight: 150, padding: 24 });
    game.popupLayer.addChild(this.scaffold);
    this.release = env.holdPause();
    this.offResize = game.events.on('resize', () => this.render());
    void this.scaffold.show(true);
    this.render();
  }

  private pending(): RelicPending | null {
    const p = this.env.battle.pending;
    return p && p.kind === 'relic' ? p : null;
  }

  /** Rebuild from battle.pending. Call after a reroll or a pick. */
  render(): void {
    if (this.closed) return;
    const p = this.pending();
    if (!p) {
      this.close();
      return;
    }
    const key = p.options.join(',');
    const fresh = key !== this.optionKey;
    this.optionKey = key;
    const content = this.scaffold.content;
    for (const c of this.cards) c.destroy({ children: true });
    this.cards = [];
    this.head?.destroy({ children: true });

    // Tall screens: the stack sits a little above the middle instead of leaving a hole under the last card.
    const spare = Math.max(0, this.scaffold.viewportHeight - 48 - (TOP + 3 * CARD_H + 2 * GAP));
    const dy = Math.round(spare * 0.4);
    const head = new Container();
    head.y = dy;
    const act = this.env.battle.act;
    const line = p.picksLeft > 1 ? t('hud.relic.many', { n: p.picksLeft }) : t('hud.relic.one');
    const w = this.scaffold.contentWidth;
    const a = new PaperLabel({ text: t('hud.relic.cleared', { act }), size: 44, paper: 'primary', padX: 44, padY: 12, maxWidth: w - 20, seed: this.seed });
    a.position.set(w / 2, 42);
    const b = new PaperLabel({ text: line, size: 28, paper: Color.paper, padX: 28, padY: 8, maxWidth: w - 20, seed: this.seed + 1 });
    b.position.set(w / 2, 100);
    head.addChild(a, b);
    content.addChild(head);
    this.head = head;

    const best = this.bestIndex(p);
    p.options.forEach((id, i) => {
      const def = relicDef(id);
      const card = new PressCard(CARD_W, CARD_H, () => this.pick(i), { holdLimit: Infinity });
      card.position.set(w / 2, dy + TOP + CARD_H / 2 + i * (CARD_H + GAP));
      card.addChild(this.frame(def.rarity, i));
      const icon = relicIcon(id, 134, def.rarity);
      icon.position.set(-CARD_W / 2 + MAT_PAD + MAT / 2, 4);
      const rar = Rarity[def.rarity];
      const textX = -CARD_W / 2 + MAT_PAD + MAT + 26;
      const name = uiLabel(t(def.nameKey), { size: 40, anchorX: 0, align: 'left' });
      name.position.set(textX, -52);
      fitLabel(name, CARD_W / 2 - 20 - textX - 150, 40, 0.7);
      const tag = new Container();
      const tagLabel = uiLabel(rarityName(def.rarity), { size: 24, color: Color.inkDeep });
      const tagW = tagLabel.width + 28;
      const tagBg = new Graphics();
      drawPaper(tagBg, -tagW / 2, -17, { w: tagW, h: 34, kind: 'pill', fill: rar.color, edge: rar.dark, shadow: 3, grain: false, seed: this.seed + 20 + i });
      tag.addChild(tagBg, tagLabel);
      tag.position.set(CARD_W / 2 - 34 - tagW / 2, -52);
      const desc = uiLabel(def.descText(), { size: 27, wrap: CARD_W / 2 - 30 - textX, lineHeight: 34, anchorX: 0, anchorY: 0, align: 'left' });
      desc.position.set(textX, -22);
      card.addChild(icon, name, tag, desc);
      if (this.env.tutorial && i === best) {
        const rec = new Tag({ text: t('hud.recommend'), style: 'mustard', shape: 'flag', fontSize: 24, tilt: 0.1 });
        rec.position.set(CARD_W / 2 - 90, CARD_H / 2 - 20);
        card.addChild(rec);
      }
      content.addChild(card);
      this.cards.push(card);
      if (fresh && !motion.reduced) this.deal(card, i);
    });
    this.buildReroll(p);
  }

  /** The photo frame: cream border, a mat in the rarity colour holding the toy, and the ornaments that pile up with rarity. */
  private frame(rarity: 'common' | 'rare' | 'epic' | 'legendary', i: number): Container {
    const c = new Container();
    const g = new Graphics();
    const rar = Rarity[rarity];
    const idx = ['common', 'rare', 'epic', 'legendary'].indexOf(rarity);
    const seed = this.seed + 10 + i * 4;
    const x = -CARD_W / 2;
    const y = -CARD_H / 2;
    drawPaper(g, x, y, { w: CARD_W, h: CARD_H, radius: 34, fill: Color.paperLight, edge: Color.kraftDark, shadow: 7, seed });
    const mx = x + MAT_PAD;
    const my = -MAT / 2 + 4;
    drawPaperFace(g, mx, my, { w: MAT, h: MAT, radius: 26, fill: rar.color, edge: rar.dark, grain: false, seed: seed + 1, wobble: 0.7 });
    drawPaperFace(g, mx + 14, my + 14, { w: MAT - 28, h: MAT - 28, radius: 18, fill: mixColor(rar.light, Color.paper, 0.62), edge: rar.dark, grain: false, seed: seed + 2, wobble: 0.6 });
    if (idx >= 1) drawDashedRect(g, x + 8, y + 8, CARD_W - 16, CARD_H - 16, { radius: 28, color: rar.dark, width: 2.5, dash: 12, gap: 9, alpha: 0.8, seed: seed + 3 });
    if (idx >= 2) {
      // Photo-corner mounts on the mat.
      const k = 26;
      const mount = idx === 3 ? RARITY_GOLD : rar.dark;
      for (const sx of [0, 1] as const) {
        for (const sy of [0, 1] as const) {
          const cx = mx + sx * MAT;
          const cy = my + sy * MAT;
          const dx = sx === 0 ? 1 : -1;
          const dyy = sy === 0 ? 1 : -1;
          g.poly([cx, cy, cx + dx * k, cy, cx, cy + dyy * k]).fill(mount);
        }
      }
    }
    c.addChild(g);
    const pin = TAPE[rarity];
    const tape = tapeStrip({ name: pin.name, pattern: pin.pattern, w: 124, h: 32, angle: i % 2 === 0 ? -3 : 3, seed });
    tape.position.set(0, y + 2);
    c.addChild(tape);
    return c;
  }

  /** Highest rarity first: the card the tutorial points at. */
  private bestIndex(p: RelicPending): number {
    const order = ['common', 'rare', 'epic', 'legendary'];
    let best = 0;
    p.options.forEach((id, i) => {
      if (order.indexOf(relicDef(id).rarity) > order.indexOf(relicDef(p.options[best] ?? id).rarity)) best = i;
    });
    return best;
  }

  private deal(card: PressCard, i: number): void {
    const y1 = card.y;
    card.y = y1 + 140;
    card.alpha = 0;
    this.bag.run({
      duration: 0.28,
      delay: 0.05 + i * 0.08,
      ease: Ease.backOut,
      onUpdate: (k) => {
        card.y = y1 + 140 * (1 - k);
        card.alpha = Math.min(1, k * 3);
      },
      onComplete: () => {
        card.y = y1;
        card.alpha = 1;
      },
    });
  }

  // ───────────────────────── picking ─────────────────────────

  private pick(index: number): void {
    if (this.busy || this.closed) return;
    const { ctx, battle } = this.env;
    const p = this.pending();
    const id = p?.options[index];
    const card = this.cards[index];
    const def = id ? relicDef(id) : null;
    const fail = ctx.command('pickRelic', () => battle.pickRelic(index));
    if (fail !== null || !id || !def || !card) return;
    audio.play('relic_pick');
    flyTo({
      from: card,
      to: ctx.anchor('relics'),
      count: 1,
      make: () => relicIcon(id, 80, def.rarity),
      flight: [0.45, 0.55],
      hang: [0.05, 0.08],
    });
    this.cards.forEach((c, i) => {
      if (i !== index) this.bag.run({ duration: 0.18, ease: Ease.cubicIn, onUpdate: (k) => (c.alpha = 1 - k) });
    });
    this.bag.call(0.2, () => this.render());
  }

  // ───────────────────────── reroll ─────────────────────────

  private buildReroll(p: RelicPending): void {
    const bar = this.scaffold.actionBar;
    bar.removeChildren().forEach((c) => c.destroy({ children: true }));
    const { battle, sandbox } = this.env;
    const free = p.freeRerolls;
    const paidUsed = p.paidRerollUsed || battle.init.mode === 'daily';

    if (free > 0) {
      const btn = new Button({ label: t('hud.relic.reroll'), sublabel: t('hud.relic.free', { n: free }), icon: 'reroll', style: 'info', width: 420, height: 104, fontSize: 40 });
      btn.onTap(() => this.reroll(false));
      bar.addChild(btn);
      return;
    }
    if (paidUsed) {
      const note = uiLabel(t('hud.relic.noMore'), { size: 28 });
      bar.addChild(note);
      return;
    }
    if (sandbox) {
      const btn = new Button({ label: t('hud.relic.reroll'), sublabel: t('hud.relic.test'), icon: 'reroll', style: 'info', width: 420, height: 104, fontSize: 40 });
      btn.onTap(() => this.reroll(true));
      bar.addChild(btn);
      return;
    }
    const route = this.env.tutorial ? 'none' : offerRoute(ads.status('relic_reroll').reason, false);
    if (route === 'none') return;
    const gems = new Button({ label: t('hud.relic.reroll'), sublabel: '10', sublabelIcon: 'gem', icon: 'reroll', style: 'mustard', width: route === 'ad' ? 300 : 420, height: 104, fontSize: 36 });
    gems.onTap(() => this.pay('gems', gems));
    if (route === 'ad') {
      const ad = new Button({ label: t('hud.relic.reroll'), sublabel: t('hud.ad'), icon: 'ad', style: 'success', width: 340, height: 104, fontSize: 36 });
      ad.onTap(() => this.pay('ad', ad));
      ad.position.set(-170 - 8, 0);
      gems.position.set(150 + 8, 0);
      bar.addChild(ad);
    }
    bar.addChild(gems);
  }

  private reroll(paid: boolean): void {
    if (this.busy) return;
    const { ctx, battle } = this.env;
    const fail = ctx.command('rerollRelics', () => battle.rerollRelics(paid));
    if (fail === null) {
      audio.play('whoosh');
      this.render();
    }
  }

  private async pay(via: 'ad' | 'gems', btn: Button): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    btn.setBusy(true);
    const r = await profile.pay('relic_reroll', via);
    this.busy = false;
    if (this.closed) return;
    btn.setBusy(false);
    if (!r.ok) {
      toast(t(errorKey(r.error)), 'warning');
      return;
    }
    this.reroll(true);
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    this.offResize();
    this.release();
    this.bag.killAll();
    this.onClose();
    void this.scaffold.hide(true).then(() => this.scaffold.destroy({ children: true }));
  }

  destroy(): void {
    if (!this.closed) {
      this.closed = true;
      this.offResize();
      this.release();
    }
    this.bag.killAll();
    if (!this.scaffold.destroyed) this.scaffold.destroy({ children: true });
  }
}
