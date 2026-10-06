/**
 * Selection sheet: when a kitten is selected it takes over the upper part of the bottom panel with a
 * paper card: the kitten's photo, name, rank and class, damage / interval / range, the skill line, what
 * it becomes (merge or awakening, see BuildPlanView) and the Molt, Awaken and Sell buttons. The SUMMON
 * row below it stays where it is.
 */
import { Container, Graphics, type Text } from 'pixi.js';
import { audio } from '@/audio';
import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { classDef, unitClass, unitDef, type Fail, type UnitState } from '@/game';
import {
  Button,
  Color,
  drawDashedRect,
  drawIcon,
  drawPaper,
  fitLabel,
  IconButton,
  motion,
  paperSeed,
  Rarity,
  rarityName,
  tooltip,
  TweenBag,
  uiLabel,
  type IconName,
} from '@/ui';
import type { Rect } from './layoutMath';
import type { HudEnv } from './env';
import { BuildPlanView } from './BuildPlanView';
import { CLASS_ACCENT, CLASS_ICON, CLASS_TAPE, tapArea, unitPhoto } from './kit';
import { MoltPicker } from './popups/MoltPicker';

/** Sell and awaken are wider than molt: a cat that also pays purr says both amounts on the sell button, and awaken carries its reason, all in 24 px text. */
const BTN_W = 186;
const AWAKEN_W = 214;
const SELL_W = 240;
const BTN_GAP = 10;
const BTN_H = 80;
const BTN_Y = 224;
const PHOTO = 90;
const TEXT_X = 122;
/** The close button sits on the card's top-right corner; text stays clear of it. */
const TEXT_RIGHT = 628;
const PLAN_X = 16;
/** Room kept at the end of a cut skill line for its info mark. */
const INFO_W = 36;
const PLAN_Y = 114;

/** One short line for a refused awakening, shown on the (disabled) button itself. */
function awakenReason(fail: Fail, cost: number): string {
  if (fail === 'not_enough_purr') return t('hud.awaken.r.purr', { n: cost });
  if (fail === 'synergy_too_low') return t('hud.awaken.r.synergy');
  if (fail === 'not_legendary') return t('hud.awaken.r.legend');
  return t('hud.awaken.r.other');
}

/** A small paper pill: a rank or class name on its own paper, with an optional class glyph. */
function pill(text: string, fill: number, edge: number, icon: IconName | null, seed: number): Container {
  const c = new Container();
  const label = uiLabel(text, { size: 24, color: Color.inkDeep });
  const iw = icon ? 28 : 0;
  const w = label.width + iw + 28;
  const g = new Graphics();
  drawPaper(g, 0, -18, { w, h: 36, kind: 'pill', fill, edge, shadow: 3, grain: false, seed });
  label.position.set(14 + iw + label.width / 2, 0);
  c.addChild(g, label);
  if (icon) {
    const ic = drawIcon(icon, 24);
    ic.position.set(14 + 12, 0);
    c.addChild(ic);
  }
  return c;
}

export class SelectionSheet {
  readonly root = new Container();
  private readonly bag = new TweenBag();
  private readonly bg = new Graphics();
  private readonly dynamic = new Container();
  private readonly molt: Button;
  private readonly awaken: Button;
  private readonly sell: Button;
  private readonly close: IconButton;
  private readonly seed = paperSeed();
  private cell: number | null = null;
  private dirty = false;
  private rect: Rect = { x: 12, y: 6, w: 696, h: 270 };
  private accent: number = Color.kraftDark;
  private fullSkill = '';
  /** What the card currently shows: it is rebuilt only when this changes, not on every fish tick. */
  private shownKey = '';
  private buttonsKey = '';

  constructor(private readonly env: HudEnv) {
    const r = env.reveal;
    this.molt = new Button({ label: t('hud.molt'), sublabel: '', sublabelIcon: 'purr', style: 'info', width: BTN_W, height: BTN_H, fontSize: 32 });
    this.molt.onTap(() => this.openMolt());
    this.awaken = new Button({ label: t('hud.awaken'), sublabel: '', sublabelIcon: 'purr', style: 'mustard', width: AWAKEN_W, height: BTN_H, fontSize: 32, fireOnDown: true });
    this.awaken.onTap(() => this.doAwaken());
    this.awaken.onDisabledTap(() => this.explainAwaken());
    this.sell = new Button({ label: t('hud.sell'), sublabel: '', sublabelIcon: 'fish', style: 'danger', width: SELL_W, height: BTN_H, fontSize: 32, fireOnDown: true });
    this.sell.onTap(() => this.doSell());
    this.close = new IconButton({ icon: 'close', style: 'kraft', size: 60, fireOnDown: true });
    this.close.onTap(() => env.ctx.select(null));
    this.molt.visible = r.molt;
    this.awaken.visible = r.awaken;

    this.root.addChild(this.bg, this.dynamic, this.molt, this.awaken, this.sell, this.close);
    this.root.visible = false;

    const b = env.battle;
    for (const type of ['fish', 'purr', 'synergy', 'merge', 'molt', 'awaken', 'move', 'swap', 'sell', 'upgrade', 'summon'] as const) {
      env.on(b.events, type, () => (this.dirty = true));
    }
  }

  layout(rect: Rect): void {
    this.rect = rect;
    this.root.position.set(rect.x, rect.y);
    this.close.position.set(rect.w - 36, 36);
    const buttons = [this.molt, this.awaken, this.sell].filter((b) => b.visible);
    const widths = buttons.map((b) => (b === this.sell ? SELL_W : b === this.awaken ? AWAKEN_W : BTN_W));
    // The row is centred as a group, whatever the number of buttons.
    let x = (rect.w - widths.reduce((sum, w) => sum + w, 0) - BTN_GAP * (buttons.length - 1)) / 2;
    buttons.forEach((btn, i) => {
      const w = widths[i] ?? BTN_W;
      btn.position.set(x + w / 2, BTN_Y);
      x += w + BTN_GAP;
    });
    this.drawBg();
    this.shownKey = '';
    this.buttonsKey = '';
    if (this.cell !== null) this.render();
  }

  private drawBg(): void {
    const { w, h } = this.rect;
    this.bg.clear();
    drawPaper(this.bg, 0, 0, { w, h, radius: 30, fill: Color.paperLight, edge: Color.kraftDark, seed: this.seed });
    drawDashedRect(this.bg, 10, 10, w - 20, h - 20, { radius: 22, color: this.accent, width: 3, dash: 14, gap: 10, alpha: 0.85, seed: this.seed });
  }

  get shown(): boolean {
    return this.cell !== null;
  }

  /** The sheet's button for a command a refusal can be about. */
  buttonFor(command: 'awaken' | 'sell'): Button {
    return command === 'awaken' ? this.awaken : this.sell;
  }

  /** Show for `cell`, or hide with null. */
  select(cell: number | null): void {
    const was = this.cell;
    const unit = cell === null ? null : this.env.battle.units[cell] ?? null;
    this.cell = unit ? cell : null;
    if (this.cell === null) {
      if (was !== null) this.hide();
      return;
    }
    this.render();
    if (was === null) this.show();
    else if (!motion.reduced) {
      // Another kitten: a quick pop so the change registers.
      this.bag.runKeyed(this.dynamic, {
        duration: 0.18,
        ease: Ease.linear,
        onUpdate: (k) => this.dynamic.scale.set(1 + 0.04 * Math.sin(k * Math.PI)),
        onComplete: () => this.dynamic.scale.set(1),
      });
    }
    audio.play('pickup', { volume: 0.5 });
  }

  private show(): void {
    this.root.visible = true;
    if (motion.reduced) return;
    const y1 = this.rect.y;
    this.bag.runKeyed(this.root, {
      duration: 0.2,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        this.root.y = y1 + 36 * (1 - k);
        this.root.alpha = Math.min(1, k * 2.2);
      },
      onComplete: () => {
        this.root.y = y1;
        this.root.alpha = 1;
      },
    });
    if (this.env.reveal.molt) this.env.hints.request('molt', this.molt, true);
    if (this.env.reveal.awaken) this.env.hints.request('awaken', this.awaken, true);
    if (this.env.reveal.sellHint) this.env.hints.request('sell', this.sell, true);
  }

  private hide(): void {
    this.bag.killKeyed(this.root);
    this.root.visible = false;
    this.root.alpha = 1;
    this.root.y = this.rect.y;
    this.shownKey = '';
    this.buttonsKey = '';
  }

  // ───────────────────────── content ─────────────────────────

  private unit(): UnitState | null {
    return this.cell === null ? null : this.env.battle.units[this.cell] ?? null;
  }

  private render(): void {
    const u = this.unit();
    const b = this.env.battle;
    if (!u || this.cell === null) return;
    this.refreshButtons(this.cell);
    const interval = (Math.round(u.stats.interval * 100) / 100).toString();
    const key = [u.id, Math.round(u.stats.damage), interval, Math.round(u.stats.range), b.synergyTier(unitClass(u.id)), b.purr, b.awakenCost(), b.units.filter((o) => o?.id === u.id).length, b.canAwaken(this.cell)].join('|');
    if (key === this.shownKey) return;
    this.shownKey = key;
    const def = unitDef(u.id);
    const rar = Rarity[def.rarity];
    this.accent = rar.dark;
    this.drawBg();
    for (const ch of this.dynamic.removeChildren()) ch.destroy({ children: true });
    const d = this.dynamic;

    const photo = unitPhoto({ size: PHOTO, rarity: def.rarity, unit: u.id, tape: CLASS_TAPE[def.classId], seed: this.seed });
    photo.position.set(16 + PHOTO / 2, 18 + PHOTO / 2);
    d.addChild(photo);

    // Rank and class pills sit right after the name; the name gives way when it is long.
    const rank = pill(rarityName(def.rarity), rar.color, rar.dark, null, this.seed + 1);
    const klass = pill(t(classDef(def.classId).nameKey), CLASS_ACCENT[def.classId], Color.kraftDark, CLASS_ICON[def.classId], this.seed + 2);
    const pillsW = rank.width + klass.width + 8;
    const name = uiLabel(t(def.nameKey), { size: 34, anchorX: 0, align: 'left' });
    fitLabel(name, TEXT_RIGHT - TEXT_X - pillsW - 14, 34, 0.7);
    name.position.set(TEXT_X, 34);
    const px = TEXT_X + name.width + 14;
    rank.position.set(px, 34);
    klass.position.set(px + rank.width + 8, 34);
    d.addChild(name, rank, klass);

    let sx = TEXT_X;
    const stat = (icon: IconName, text: string): void => {
      const ic = drawIcon(icon, 26);
      ic.position.set(sx + 13, 70);
      const tx = uiLabel(text, { size: 26, anchorX: 0, align: 'left' });
      tx.position.set(sx + 32, 71);
      d.addChild(ic, tx);
      sx += 32 + tx.width + 24;
    };
    stat('swords', fmt(Math.round(u.stats.damage)));
    stat('clock', t('hud.stat.interval', { s: interval }));
    stat('target', fmt(Math.round(u.stats.range)));

    this.fullSkill = def.skillText();
    const skill = uiLabel(this.fullSkill, { size: 24, color: Color.inkSoft, anchorX: 0, align: 'left' });
    const lineW = TEXT_RIGHT - TEXT_X;
    this.fitLine(skill, lineW);
    skill.position.set(TEXT_X, 98);
    if (skill.text !== this.fullSkill) {
      // A cut line says so: an info mark closes it, and the whole band around it opens the full text.
      skill.text = this.fullSkill;
      this.fitLine(skill, lineW - INFO_W);
      const info = drawIcon('info', 26);
      info.position.set(TEXT_X + lineW - 13, 98);
      d.addChild(info);
      tapArea(skill, 0, -44, lineW, 88);
      skill.on('pointerdown', () => tooltip.show(skill, { title: t(def.nameKey), text: this.fullSkill }, 8));
    }
    d.addChild(skill);

    const plan = new BuildPlanView(this.env, u, this.rect.w - PLAN_X * 2);
    plan.position.set(PLAN_X, PLAN_Y);
    d.addChild(plan);
  }

  /** Cut `label` to one line of at most `maxW`, ending with an ellipsis. */
  private fitLine(label: Text, maxW: number): void {
    const full = label.text;
    let cut = full.length;
    while (label.width > maxW && cut > 6) {
      cut -= Math.max(1, Math.ceil(cut * 0.05));
      label.text = full.slice(0, cut).trimEnd() + '…';
    }
  }

  /** Sublabels and states of the three buttons; a button is touched only when what it says changed. */
  private refreshButtons(cell: number): void {
    const b = this.env.battle;
    const sellV = b.sellValue(cell);
    const sellText = sellV.purr > 0 ? t('hud.sell.both', { fish: fmt(sellV.fish), purr: sellV.purr }) : `+${fmt(sellV.fish)}`;
    const cost = b.moltCost();
    const left = b.moltsLeft();
    const moltText = t('hud.molt.sub', { cost, left });
    const moltReady = left > 0 && b.purr >= cost;
    const awakenFail = b.canAwaken(cell);
    const awakenCost = b.awakenCost();
    const key = [sellText, moltText, moltReady, awakenFail, awakenCost].join('|');
    if (key === this.buttonsKey) return;
    this.buttonsKey = key;
    this.sell.setSublabel(sellText, 'fish');
    this.molt.setSublabel(moltText, 'purr');
    this.molt.setStyle(moltReady ? 'info' : 'kraft');
    if (awakenFail === null) {
      this.awaken.setEnabled(true);
      this.awaken.setSublabel(String(awakenCost), 'purr');
    } else {
      this.awaken.setEnabled(false);
      // setSublabel keeps the previous icon unless the text is cleared first.
      this.awaken.setSublabel(undefined);
      this.awaken.setSublabel(awakenReason(awakenFail, awakenCost));
    }
  }

  // ───────────────────────── actions ─────────────────────────

  private openMolt(): void {
    if (this.cell === null) return;
    void this.env.modal(new MoltPicker(this.env, this.cell));
  }

  private doAwaken(): void {
    if (this.cell === null) return;
    const cell = this.cell;
    this.env.ctx.command('awaken', () => this.env.battle.awaken(cell), cell);
  }

  private explainAwaken(): void {
    if (this.cell === null) return;
    const fail = this.env.battle.canAwaken(this.cell);
    if (fail) this.env.explain('awaken', fail);
  }

  private doSell(): void {
    if (this.cell === null) return;
    const cell = this.cell;
    const fail = this.env.ctx.command('sell', () => this.env.battle.sell(cell), cell);
    if (fail === null) this.env.ctx.select(null);
  }

  invalidate(): void {
    this.dirty = true;
  }

  update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    if (this.cell === null) return;
    if (!this.unit()) {
      this.env.ctx.select(null);
      this.select(null);
      return;
    }
    this.render();
  }

  destroy(): void {
    this.bag.killAll();
    this.root.destroy({ children: true });
  }
}
