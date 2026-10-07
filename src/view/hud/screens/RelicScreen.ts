/**
 * The toy choice between acts: a full screen with three large toy cards, each a paper photo frame
 * pinned down with tape, and one inline reroll offer (free first, then an ad or gems through the meta
 * layer). The card list always mirrors battle.pending, so rerolls, multi-picks and restored runs need
 * no special cases.
 *
 * The screen lives as long as the battle: the HUD builds it hidden while the act's last wave is on (`idle`), draws its parts and a photo frame
 * for every rarity once into a target nobody sees (`prewarm`), and shows it when the offer comes, so the offer has only three cards to fill
 * (the toy, its name, tag and text) and a first opening is not 80 ms of paper, glyphs and uploads in one frame. Between acts it goes back to
 * sleep instead of being destroyed.
 */
import { Container, Graphics } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { mixColor } from '@/core/math';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { flyTo, renderOnce } from '@/fx';
import { relicDef, type PendingChoice } from '@/game';
import { topicTeach } from '@/guide';
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

import { TOY_BURST, TOY_FLY, TOY_HANG } from '@/view/timing';

const CARD_W = 672;
const CARD_H = 216;
const GAP = 18;
const TOP = 152;
/** Seconds the old cards of a reroll take to leave before the new ones are dealt. */
const FAREWELL = 0.14;
/** Seconds between building one card and the next of a new offer (a few frames: the deal is 0.08 s apart); the reroll offer comes a gap after the last card. */
const BUILD_GAP = 0.04;
/** The mat the toy lies on: a square window at the card's left. */
const MAT = 176;
const MAT_PAD = 20;

type RelicPending = Extract<PendingChoice, { kind: 'relic' }>;
type ToyRarity = 'common' | 'rare' | 'epic' | 'legendary';
const RARITIES: readonly ToyRarity[] = ['common', 'rare', 'epic', 'legendary'];
/** The places a card can have on the screen: an offer has three. */
const SLOTS: readonly number[] = [0, 1, 2];

/** What the first offer of a run looks like to the reroll button (one free reroll): the one drawn ahead of time. */
const FIRST_OFFER: RelicPending = { kind: 'relic', options: [], freeRerolls: 1, picksLeft: 1, paidRerollUsed: false };

/** One strip of tape per card, a different print for each rarity so a row of cards is never one flat colour. */
const TAPE: Record<ToyRarity, { name: TapeName; pattern: 'dots' | 'gingham' | 'stripes' }> = {
  common: { name: 'sky', pattern: 'dots' },
  rare: { name: 'green', pattern: 'gingham' },
  epic: { name: 'pink', pattern: 'dots' },
  legendary: { name: 'yellow', pattern: 'stripes' },
};

export class RelicScreen {
  private readonly scaffold: ScreenScaffold;
  private readonly bag = new TweenBag();
  private readonly seed = paperSeed();
  private release: (() => void) | null = null;
  private cards: PressCard[] = [];
  /** "Act n cleared" and the line under it, built once and re-worded when the act or the line changes. */
  private head: { root: Container; act: PaperLabel; line: PaperLabel; texts: [string, string] } | null = null;
  private busy = false;
  private shown = false;
  private dead = false;
  private optionKey = '';
  /** What the reroll bar was built for (the button, its text): the bar is rebuilt only when the offer wants something else. */
  private rerollSig = '';
  /** Counts the renders: a card whose building was put off belongs to the render that asked for it, not to a later one. */
  private generation = 0;
  /** The photo frames made so far, by rarity and slot: the part of a card that does not depend on the toy, kept between offers. */
  private readonly frames = new Map<string, Container>();
  private readonly pooled = new Set<Container>();
  private readonly frameOf = new WeakMap<PressCard, Container>();
  private readonly offResize: () => void;

  /**
   * `idle` builds the screen hidden and waits for `open()`; otherwise it opens at once.
   * `onClose` runs each time the offer is answered and the screen goes back to sleep.
   */
  constructor(
    private readonly env: HudEnv,
    private readonly onClose?: () => void,
    idle = false,
  ) {
    this.scaffold = new ScreenScaffold({ title: t('hud.relic.title'), scroll: false, actionBarHeight: 150, padding: 24 });
    this.scaffold.visible = false;
    game.popupLayer.addChild(this.scaffold);
    this.offResize = game.events.on('resize', () => this.render());
    if (!idle) this.open();
  }

  /** True from the moment an offer is shown until it is answered. */
  get isOpen(): boolean {
    return this.shown;
  }

  /** Show the screen for the pending offer (a second offer while it is up, a reroll or a second pick, only re-reads it). */
  open(): void {
    if (this.dead) return;
    if (this.shown) {
      this.render();
      return;
    }
    this.shown = true;
    // On top of whatever was added to the popup layer while the screen slept.
    game.popupLayer.addChild(this.scaffold);
    this.release = this.env.holdPause();
    void this.scaffold.show(true);
    this.render();
  }

  /**
   * The work that makes the first opening cheap, as pieces small enough for the warm-up queue (src/fx/warm.ts), each safe to run at any time before
   * the offer or never: the screen's own paper and header, the reroll button, then one photo frame per rarity and slot (4 x 3), each drawn once into
   * a hidden target.
   */
  prewarm(): Array<() => void> {
    const steps: Array<() => void> = [
      () => {
        if (this.dead || this.shown) return;
        this.ensureHead(null);
        renderOnce(this.scaffold);
      },
      () => {
        if (this.dead || this.shown) return;
        this.buildReroll(FIRST_OFFER);
        renderOnce(this.scaffold.actionBar);
      },
    ];
    for (const rarity of RARITIES) {
      for (const slot of SLOTS) {
        steps.push(() => {
          // A frame a card is wearing has been drawn.
          if (this.dead || this.frames.get(`${rarity}:${slot}`)?.parent) return;
          renderOnce(this.takeFrame(rarity, slot));
        });
      }
    }
    return steps;
  }

  private pending(): RelicPending | null {
    const p = this.env.battle.pending;
    return p && p.kind === 'relic' ? p : null;
  }

  /** The header: built the first time, then only re-worded when the act or the line changed. */
  private ensureHead(p: RelicPending | null): Container {
    const act = this.env.battle.act;
    // The tutorial's first toy choice says what toys are in the line under the title.
    const line = this.env.lessonOn('toys') ? topicTeach('toys') : p && p.picksLeft > 1 ? t('hud.relic.many', { n: p.picksLeft }) : t('hud.relic.one');
    const texts: [string, string] = [t('hud.relic.cleared', { act }), line];
    const w = this.scaffold.contentWidth;
    let head = this.head;
    if (!head) {
      const root = new Container();
      const a = new PaperLabel({ text: texts[0], size: 44, paper: 'primary', padX: 44, padY: 12, maxWidth: w - 20, seed: this.seed });
      const b = new PaperLabel({ text: texts[1], size: 28, paper: Color.paper, padX: 28, padY: 8, maxWidth: w - 20, seed: this.seed + 1 });
      root.addChild(a, b);
      this.scaffold.content.addChild(root);
      head = { root, act: a, line: b, texts };
      this.head = head;
    } else {
      const labels = [head.act, head.line];
      for (let i = 0; i < labels.length; i++) {
        const label = labels[i] as PaperLabel;
        label.setMaxWidth(w - 20);
        if (head.texts[i] !== texts[i]) label.setText(texts[i] as string);
      }
      head.texts = texts;
    }
    head.act.position.set(w / 2, 42);
    head.line.position.set(w / 2, 100);
    return head.root;
  }

  /** Rebuild from battle.pending. Call after a reroll or a pick. */
  render(): void {
    if (!this.shown) return;
    const p = this.pending();
    if (!p) {
      this.close();
      return;
    }
    const key = p.options.join(',');
    const fresh = key !== this.optionKey;
    this.optionKey = key;
    // A card still being dealt must lose its tween with it: a tween writing to a destroyed container throws on every frame.
    // A reroll sends the old cards off before the new ones are dealt; any other rebuild just replaces them.
    const sendOff = fresh && this.cards.length > 0 && !motion.reduced;
    for (const c of this.cards) {
      this.bag.killKeyed(c);
      if (sendOff) this.farewell(c);
      else this.dropCard(c);
    }
    this.cards = [];

    // Tall screens: the stack sits a little above the middle instead of leaving a hole under the last card.
    const spare = Math.max(0, this.scaffold.viewportHeight - 48 - (TOP + 3 * CARD_H + 2 * GAP));
    const dy = Math.round(spare * 0.4);
    this.ensureHead(p).y = dy;

    const best = this.bestIndex(p);
    const generation = ++this.generation;
    const wait = sendOff ? FAREWELL : 0;
    const spread = fresh && !motion.reduced;
    // A new offer is dealt card by card (0.08 s apart), so each card is also BUILT just ahead of its own deal, and the reroll offer after the last:
    // three cards of text and the buttons built in one frame are a hitch, one a frame is a third of it each.
    p.options.forEach((id, i) => {
      if (i === 0 || !spread) {
        this.buildCard(id, i, best, dy, wait, fresh);
        return;
      }
      this.bag.call(i * BUILD_GAP, () => {
        if (this.shown && this.generation === generation) this.buildCard(id, i, best, dy, wait, fresh);
      });
    });
    if (!spread) {
      this.buildReroll(p);
      return;
    }
    this.bag.call(p.options.length * BUILD_GAP, () => {
      const now = this.pending();
      if (this.shown && this.generation === generation && now) this.buildReroll(now);
    });
  }

  /** One toy card: the photo frame, the toy on its mat, the name, the rarity tag, the description, and the tutorial's "recommended" flag. */
  private buildCard(id: RelicPending['options'][number], i: number, best: number, dy: number, wait: number, fresh: boolean): void {
    const content = this.scaffold.content;
    const w = this.scaffold.contentWidth;
    const def = relicDef(id);
    const card = new PressCard(CARD_W, CARD_H, () => this.pick(i), { holdLimit: Infinity });
    card.position.set(w / 2, dy + TOP + CARD_H / 2 + i * (CARD_H + GAP));
    const frame = this.takeFrame(def.rarity, i);
    this.frameOf.set(card, frame);
    card.addChild(frame);
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
    if (fresh && !motion.reduced) this.deal(card, i, wait);
  }

  /** The photo frame a card of this rarity in this slot wears: the one kept from before when it is free, else a new one (kept when the slot had none). */
  private takeFrame(rarity: ToyRarity, slot: number): Container {
    const key = `${rarity}:${slot}`;
    const kept = this.frames.get(key);
    if (kept && !kept.destroyed && !kept.parent) return kept;
    const made = this.frame(rarity, slot);
    if (!kept) {
      this.frames.set(key, made);
      this.pooled.add(made);
    }
    return made;
  }

  /** A card is going: its frame goes back to the shelf, everything else on it is destroyed. */
  private dropCard(card: PressCard): void {
    const frame = this.frameOf.get(card);
    if (frame && this.pooled.has(frame)) card.removeChild(frame);
    this.frameOf.delete(card);
    card.destroy({ children: true });
  }

  /** The photo frame: cream border, a mat in the rarity colour holding the toy, and the ornaments that pile up with rarity. */
  private frame(rarity: ToyRarity, i: number): Container {
    const c = new Container();
    const g = new Graphics();
    const rar = Rarity[rarity];
    const idx = RARITIES.indexOf(rarity);
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
    let best = 0;
    p.options.forEach((id, i) => {
      if (RARITIES.indexOf(relicDef(id).rarity) > RARITIES.indexOf(relicDef(p.options[best] ?? id).rarity)) best = i;
    });
    return best;
  }

  /** A card that is not wanted any more slips down and fades, then goes; it takes no taps meanwhile. */
  private farewell(card: PressCard): void {
    const y0 = card.y;
    card.eventMode = 'none';
    this.bag.runKeyed(card, {
      duration: FAREWELL,
      ease: Ease.cubicIn,
      onUpdate: (k) => {
        if (card.destroyed) return;
        card.alpha = 1 - k;
        card.y = y0 + 30 * k;
      },
      onComplete: () => {
        if (!card.destroyed) this.dropCard(card);
      },
    });
  }

  private deal(card: PressCard, i: number, wait = 0): void {
    const y1 = card.y;
    card.y = y1 + 140;
    card.alpha = 0;
    this.bag.runKeyed(card, {
      duration: 0.28,
      delay: wait + 0.05 + i * 0.08,
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
    if (this.busy || !this.shown) return;
    const { ctx, battle } = this.env;
    const p = this.pending();
    const id = p?.options[index];
    const card = this.cards[index];
    const def = id ? relicDef(id) : null;
    const fail = ctx.command('pickRelic', () => battle.pickRelic(index));
    if (fail !== null || !id || !def || !card) return;
    flyTo({
      from: card,
      to: ctx.anchor('relics'),
      count: 1,
      make: () => relicIcon(id, 80, def.rarity),
      burstSeconds: TOY_BURST,
      flight: [TOY_FLY, TOY_FLY],
      hang: [TOY_HANG, TOY_HANG],
    });
    this.cards.forEach((c, i) => {
      if (i !== index) this.bag.runKeyed(c, { duration: 0.18, ease: Ease.cubicIn, onUpdate: (k) => (c.alpha = 1 - k) });
    });
    this.bag.call(0.2, () => this.render());
  }

  // ───────────────────────── reroll ─────────────────────────

  private buildReroll(p: RelicPending): void {
    const bar = this.scaffold.actionBar;
    const { battle, sandbox } = this.env;
    const free = p.freeRerolls;
    const paidUsed = p.paidRerollUsed || battle.init.mode === 'daily';
    const route = free > 0 || paidUsed || sandbox || this.env.tutorial ? 'none' : offerRoute(ads.status('relic_reroll').reason, false);
    const sig = `${free > 0 ? `free ${t('hud.relic.free', { n: free })}` : paidUsed ? 'used' : sandbox ? 'test' : `paid ${route}`}|${t('hud.relic.reroll')}`;
    if (sig === this.rerollSig) return;
    this.rerollSig = sig;
    bar.removeChildren().forEach((c) => c.destroy({ children: true }));

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
    // The new offer reaches the HUD as an event, which rebuilds this screen: a second render here would redo the cards undealt.
    if (fail === null) audio.play('whoosh');
  }

  private async pay(via: 'ad' | 'gems', btn: Button): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    btn.setBusy(true);
    const r = await profile.pay('relic_reroll', via);
    this.busy = false;
    if (!this.shown) return;
    btn.setBusy(false);
    if (!r.ok) {
      toast(t(errorKey(r.error)), 'warning');
      return;
    }
    this.reroll(true);
  }

  /** The offer is answered: the screen fades out and sleeps, keeping its paper, its header and its frames for the next act. */
  private close(): void {
    if (!this.shown) return;
    this.shown = false;
    this.optionKey = '';
    this.release?.();
    this.release = null;
    this.bag.killAll();
    this.onClose?.();
    void this.scaffold.hide(true).then(() => {
      if (this.shown || this.dead) return;
      for (const c of this.cards) this.dropCard(c);
      this.cards = [];
    });
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.shown = false;
    this.offResize();
    this.release?.();
    this.release = null;
    this.bag.killAll();
    // Frames on the shelf are not in the tree and would not be destroyed with the screen.
    for (const frame of this.pooled) if (!frame.parent && !frame.destroyed) frame.destroy({ children: true });
    this.pooled.clear();
    this.frames.clear();
    if (!this.scaffold.destroyed) this.scaffold.destroy({ children: true });
  }
}
