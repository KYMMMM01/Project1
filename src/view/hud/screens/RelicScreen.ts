/**
 * The toy choice between acts: a full screen with three large toy cards and one inline reroll offer
 * (free first, then an ad or gems through the meta layer). The card list always mirrors
 * battle.pending, so rerolls, multi-picks and restored runs need no special cases.
 */
import { Container, Graphics } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { flyTo } from '@/fx';
import { relicDef, type PendingChoice } from '@/game';
import { errorKey, profile } from '@/meta';
import { ads } from '@/platform';
import {
  Button,
  Color,
  drawGlow,
  fitLabel,
  motion,
  Rarity,
  rarityName,
  ScreenScaffold,
  TweenBag,
  toast,
  uiLabel,
  vGradient,
  shade,
} from '@/ui';
import type { HudEnv } from '../env';
import { PressCard, relicIcon } from '../kit';
import { offerRoute } from '../policy';

const CARD_W = 672;
const CARD_H = 216;
const GAP = 18;
const TOP = 112;

type RelicPending = Extract<PendingChoice, { kind: 'relic' }>;

export class RelicScreen {
  private readonly scaffold: ScreenScaffold;
  private readonly bag = new TweenBag();
  private readonly release: () => void;
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
    const a = uiLabel(t('hud.relic.cleared', { act }), { size: 40, color: Color.gold, strokeWidth: 6 });
    a.position.set(this.scaffold.contentWidth / 2, 30);
    const b = uiLabel(line, { size: 28, wrap: this.scaffold.contentWidth - 20, strokeWidth: 4, shadow: false });
    b.position.set(this.scaffold.contentWidth / 2, 78);
    head.addChild(a, b);
    content.addChild(head);
    this.head = head;

    const best = this.bestIndex(p);
    p.options.forEach((id, i) => {
      const def = relicDef(id);
      const r = Rarity[def.rarity];
      const card = new PressCard(CARD_W, CARD_H, () => this.pick(i), { holdLimit: Infinity });
      card.position.set(this.scaffold.contentWidth / 2, dy + TOP + CARD_H / 2 + i * (CARD_H + GAP));
      const g = new Graphics();
      g.roundRect(-CARD_W / 2, -CARD_H / 2 + 8, CARD_W, CARD_H, 34).fill({ color: Color.black, alpha: 0.4 });
      g.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 34)
        .fill(vGradient(shade(Color.panelLight, 0.06), Color.panel))
        .stroke({ width: 7, color: r.color, alignment: 1 });
      g.roundRect(-CARD_W / 2 + 9, -CARD_H / 2 + 9, CARD_W - 18, CARD_H - 18, 26).stroke({ width: 3, color: Color.outline, alpha: 0.8, alignment: 1 });
      const glow = new Graphics();
      drawGlow(glow, 0, 0, 120, r.glow, 0.55);
      glow.position.set(-CARD_W / 2 + 112, 0);
      glow.blendMode = 'add';
      const icon = relicIcon(id, 148, def.rarity);
      icon.position.set(-CARD_W / 2 + 112, 0);
      const name = uiLabel(t(def.nameKey), { size: 40, anchorX: 0, align: 'left', strokeWidth: 6 });
      name.position.set(-CARD_W / 2 + 206, -62);
      fitLabel(name, CARD_W - 206 - 150, 40, 0.7);
      const tag = uiLabel(rarityName(def.rarity), { size: 24, color: r.light, anchorX: 1, align: 'right', strokeWidth: 4, shadow: false });
      tag.position.set(CARD_W / 2 - 30, -62);
      const desc = uiLabel(def.descText(), {
        size: 27, wrap: CARD_W - 206 - 36, lineHeight: 34, anchorX: 0, anchorY: 0, align: 'left', strokeWidth: 4, shadow: false,
      });
      desc.position.set(-CARD_W / 2 + 206, -30);
      card.addChild(g, glow, icon, name, tag, desc);
      if (this.env.tutorial && i === best) {
        const rec = uiLabel(t('hud.recommend'), { size: 24, color: Color.textDark, stroke: false, shadow: false });
        const pill = new Graphics();
        pill.roundRect(-52, -18, 104, 36, 18).fill(Color.gold).stroke({ width: 4, color: Color.outline });
        const tagc = new Container();
        tagc.addChild(pill, rec);
        tagc.position.set(-CARD_W / 2 + 112, -CARD_H / 2 + 6);
        card.addChild(tagc);
      }
      content.addChild(card);
      this.cards.push(card);
      if (fresh && !motion.reduced) this.deal(card, i);
    });
    this.buildReroll(p);
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
      const note = uiLabel(t('hud.relic.noMore'), { size: 28, color: Color.textDim, strokeWidth: 4, shadow: false });
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
    const gems = new Button({ label: t('hud.relic.reroll'), sublabel: '10', sublabelIcon: 'gem', icon: 'reroll', style: 'purple', width: route === 'ad' ? 300 : 420, height: 104, fontSize: 36 });
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
