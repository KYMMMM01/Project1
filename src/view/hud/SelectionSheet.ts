/**
 * Selection sheet: when a kitten is selected it takes over the upper part of the bottom panel with a
 * paper card: the kitten's photo, name, rank and class, damage / interval / range, the skill line, what
 * it becomes (merge or awakening, see BuildPlanView) and the Molt, Awaken and Sell buttons. The SUMMON
 * row below it stays where it is.
 */
import { Container, Graphics, Rectangle, type Text } from 'pixi.js';
import { audio } from '@/audio';
import { fmt, fmtPct } from '@/core/format';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { drawBuffMark } from '@/fx';
import { AWAKEN_MIN_TIER, classDef, tilesText, unitClass, unitDef, type Fail, type UnitState } from '@/game';
import {
  backOut,
  Button,
  Color,
  drawDashedInset,
  drawIcon,
  drawPaper,
  fitLabel,
  IconButton,
  motion,
  paperSeed,
  Rarity,
  rarityName,
  TweenBag,
  uiLabel,
  type IconName,
} from '@/ui';
import { info } from '../info';
import { BuffBoard, buffFacts, chipsFit, withOwnWard, type BuffFact } from '../field/buffMath';
import { SHEET, sheetBoxes, sheetSkillInfo, type Rect } from './layoutMath';
import type { HudEnv } from './env';
import { BuildPlanView } from './BuildPlanView';
import { CLASS_ACCENT, CLASS_ICON, CLASS_TAPE, tapArea, unitPhoto } from './kit';
import { moltRefusal, moltState } from './moltMath';
import { MoltPicker } from './popups/MoltPicker';

/** Seconds a cat's full skill text stays up (it is the longest line a bubble carries). */
const SKILL_FOR = 8;
/** The sticker on a buff chip (the board's badge, half width), and the space between the chips. */
const CHIP_R = 11;
const CHIP_GAP = 8;

/** One short line for a refused awakening, shown on the (disabled) button itself. */
function awakenReason(fail: Fail, cost: number): string {
  if (fail === 'not_enough_purr') return t('hud.awaken.r.purr', { n: cost });
  if (fail === 'synergy_too_low') return t('hud.awaken.r.synergy', { tier: AWAKEN_MIN_TIER });
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
  drawPaper(g, 0, -17, { w, h: 34, kind: 'pill', fill, edge, shadow: 3, grain: false, seed });
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
  /** Who helps this cat, worked out from the board (the field keeps its own copy for the badges). */
  private readonly helpers = new BuffBoard();
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
    this.molt = new Button({ label: t('hud.molt'), sublabel: '', sublabelIcon: 'purr', style: 'info', width: SHEET.molt, height: SHEET.button, fontSize: 32 });
    this.molt.onTap(() => this.openMolt());
    this.awaken = new Button({ label: t('hud.awaken'), sublabel: '', sublabelIcon: 'purr', style: 'mustard', width: SHEET.awaken, height: SHEET.button, fontSize: 32, fireOnDown: true });
    this.awaken.onTap(() => this.doAwaken());
    this.awaken.onDisabledTap(() => this.explainAwaken());
    this.sell = new Button({ label: t('hud.sell'), sublabel: '', sublabelIcon: 'fish', style: 'danger', width: SHEET.sell, height: SHEET.button, fontSize: 32, fireOnDown: true });
    this.sell.onTap(() => this.doSell());
    this.close = new IconButton({ icon: 'close', style: 'kraft', size: SHEET.close, fireOnDown: true });
    this.close.onTap(() => env.ctx.select(null));
    this.molt.visible = r.molt;
    this.awaken.visible = r.awaken;

    this.root.addChild(this.bg, this.dynamic, this.molt, this.awaken, this.sell, this.close);
    this.root.visible = false;

    const b = env.battle;
    for (const type of ['fish', 'purr', 'synergy', 'merge', 'molt', 'awaken', 'move', 'swap', 'sell', 'upgrade', 'summon'] as const) {
      env.on(b.events, type, () => (this.dirty = true));
    }
    // The tutorial brings the molt and awaken buttons in; the row of buttons re-centres around them.
    env.on(env.revealed, 'reveal', ({ key }) => {
      if (key !== 'molt' && key !== 'awaken') return;
      (key === 'molt' ? this.molt : this.awaken).visible = true;
      this.layout(this.rect);
    });
  }

  layout(rect: Rect): void {
    this.rect = rect;
    this.root.position.set(rect.x, rect.y);
    const boxes = sheetBoxes(rect.w, rect.h);
    this.close.position.set(boxes.close.x + boxes.close.w / 2, boxes.close.y + boxes.close.h / 2);
    const buttons = [this.molt, this.awaken, this.sell].filter((b) => b.visible);
    const widths = buttons.map((b) => (b === this.sell ? SHEET.sell : b === this.awaken ? SHEET.awaken : SHEET.molt));
    // The row is centred as a group, whatever the number of buttons.
    let x = (rect.w - widths.reduce((sum, w) => sum + w, 0) - SHEET.buttonGap * (buttons.length - 1)) / 2;
    buttons.forEach((btn, i) => {
      const w = widths[i] ?? SHEET.molt;
      btn.position.set(x + w / 2, boxes.buttonY);
      x += w + SHEET.buttonGap;
    });
    this.drawBg();
    this.shownKey = '';
    this.buttonsKey = '';
    if (this.cell !== null) this.render();
  }

  private drawBg(): void {
    const { w, h } = this.rect;
    this.bg.clear();
    const paper = { w, h, radius: 30, fill: Color.paperLight, edge: Color.kraftDark, seed: this.seed } as const;
    drawPaper(this.bg, 0, 0, paper);
    drawDashedInset(this.bg, 0, 0, paper, sheetBoxes(w, h).frame.x, { color: this.accent, width: 3, dash: 14, gap: 10, alpha: 0.85, seed: this.seed });
  }

  get shown(): boolean {
    return this.cell !== null;
  }

  /** The sheet's button for a command a refusal (or a lesson) can be about. */
  buttonFor(command: 'awaken' | 'sell' | 'molt'): Button {
    return command === 'awaken' ? this.awaken : command === 'molt' ? this.molt : this.sell;
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
    this.root.interactiveChildren = true;
    if (motion.reduced) return;
    const y1 = this.rect.y;
    // The sheet slides up from below and lands with a small settle, like a page laid on the pile.
    this.bag.runKeyed(this.root, {
      duration: 0.26,
      ease: backOut(1.3),
      onUpdate: (k) => {
        this.root.y = y1 + 36 * (1 - k);
        this.root.alpha = Math.min(1, k * 3);
      },
      onComplete: () => {
        this.root.y = y1;
        this.root.alpha = 1;
      },
    });
    const { battle, hints, reveal } = this.env;
    if (reveal.molt && this.cell !== null && moltState(battle.moltCostOf(this.cell), battle.moltsLeft(), battle.purr) === 'ready') hints.request('molt', this.molt, true);
    if (reveal.sellHint) hints.request('sell', this.sell, true);
  }

  private hide(): void {
    info.close();
    this.shownKey = '';
    this.buttonsKey = '';
    if (motion.reduced || !this.root.visible) {
      this.rest();
      return;
    }
    // It slides back down while the chips fade in, instead of vanishing on one frame; no taps land on a leaving sheet.
    const y1 = this.rect.y;
    const from = this.root.y;
    const a0 = this.root.alpha;
    this.root.interactiveChildren = false;
    this.bag.runKeyed(this.root, {
      duration: 0.16,
      ease: Ease.quadIn,
      onUpdate: (k) => {
        this.root.y = from + (y1 + 30 - from) * k;
        this.root.alpha = a0 * (1 - k);
      },
      onComplete: () => this.rest(),
    });
  }

  private rest(): void {
    this.bag.killKeyed(this.root);
    this.root.visible = false;
    this.root.interactiveChildren = true;
    this.root.alpha = 1;
    this.root.y = this.rect.y;
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
    this.helpers.refresh(b.units);
    const cat = this.helpers.at(this.cell);
    const facts = withOwnWard(cat ? buffFacts(cat) : [], u.id, u.dodge);
    const buffKey = facts.map((f) => `${f.kind}${Math.round((f.value ?? 0) * 100)}${f.from.join('+')}`).join(',');
    const key = [u.id, Math.round(u.dodge * 100), Math.round(u.stats.damage), interval, Math.round(u.stats.range), b.synergyTier(unitClass(u.id)), b.purr, b.awakenCost(), b.units.filter((o) => o?.id === u.id).length, b.canAwaken(this.cell), buffKey].join('|');
    if (key === this.shownKey) return;
    this.shownKey = key;
    const def = unitDef(u.id);
    const rar = Rarity[def.rarity];
    this.accent = rar.dark;
    this.drawBg();
    for (const ch of this.dynamic.removeChildren()) ch.destroy({ children: true });
    const d = this.dynamic;

    const box = sheetBoxes(this.rect.w, this.rect.h);
    const { textX: TEXT_X } = box;
    const { nameY: NAME_Y, statsY: STATS_Y, skillY: SKILL_Y, edge: EDGE } = SHEET;
    const photo = unitPhoto({ size: SHEET.photo, rarity: def.rarity, unit: u.id, tape: CLASS_TAPE[def.classId], seed: this.seed });
    photo.position.set(box.photo.x + box.photo.w / 2, box.photo.y + box.photo.h / 2);
    d.addChild(photo);

    // Rank and class pills sit right after the name; the name gives way when it is long.
    const rank = pill(rarityName(def.rarity), rar.color, rar.dark, null, this.seed + 1);
    const klass = pill(t(classDef(def.classId).nameKey), CLASS_ACCENT[def.classId], Color.kraftDark, CLASS_ICON[def.classId], this.seed + 2);
    const pillsW = rank.width + klass.width + 8;
    const textRight = box.textRight;
    const name = uiLabel(t(def.nameKey), { size: 34, anchorX: 0, align: 'left' });
    fitLabel(name, textRight - TEXT_X - pillsW - 14, 34, 0.7);
    name.position.set(TEXT_X, EDGE + NAME_Y);
    const px = TEXT_X + name.width + 14;
    rank.position.set(px, EDGE + NAME_Y);
    klass.position.set(px + rank.width + 8, EDGE + NAME_Y);
    d.addChild(name, rank, klass);

    let sx = TEXT_X;
    const stat = (icon: IconName, text: string): void => {
      const ic = drawIcon(icon, 26);
      ic.position.set(sx + 13, EDGE + STATS_Y);
      const tx = uiLabel(text, { size: 26, anchorX: 0, align: 'left' });
      tx.position.set(sx + 32, EDGE + STATS_Y + 1);
      d.addChild(ic, tx);
      // With buff chips to follow, the stats stand a little closer so the chips have room.
      sx += 32 + tx.width + (facts.length > 0 ? 12 : 24);
    };
    stat('swords', fmt(Math.round(u.stats.damage)));
    stat('clock', t('hud.stat.interval', { s: interval }));
    // Range in tiles, the unit the skill sentences count in.
    stat('target', tilesText(u.stats.range));
    this.buffChips(d, facts, u.dodge, sx, EDGE + STATS_Y, textRight);

    this.fullSkill = def.skillText();
    const skill = uiLabel(this.fullSkill, { size: 24, color: Color.inkSoft, anchorX: 0, align: 'left' });
    const lineW = box.content.x + box.content.w - TEXT_X;
    this.fitLine(skill, lineW);
    skill.position.set(TEXT_X, EDGE + SKILL_Y);
    let skillInfo: Container | null = null;
    if (skill.text !== this.fullSkill) {
      // A cut line says so with an "i" sticker at its head, on the photo's corner and a sheet's width away from the close button. The sticker's
      // slot, the photo and the line itself all open the full text; the line's band stays off the stats row above and the well below.
      const at = sheetSkillInfo(this.rect.w, this.rect.h);
      const open = (): void => {
        info.tap(`skill:${def.id}`, skill, { title: t(def.nameKey), text: this.fullSkill }, { seconds: SKILL_FOR });
      };
      skill.text = this.fullSkill;
      const cutW = box.content.x + box.content.w - at.lineX;
      this.fitLine(skill, cutW);
      skill.position.set(at.lineX, EDGE + SKILL_Y);
      tapArea(skill, 0, -14, cutW, box.well.y - (EDGE + SKILL_Y) + 14);
      skill.on('pointerdown', open);
      tapArea(photo, -SHEET.photo / 2, -SHEET.photo / 2, SHEET.photo, SHEET.photo);
      photo.on('pointerdown', open);
      const sticker = new Container();
      sticker.label = 'skill-info';
      const plate = new Graphics();
      drawPaper(plate, -at.r, -at.r, { w: at.r * 2, h: at.r * 2, kind: 'circle', fill: Color.paperLight, edge: Color.kraftDark, edgeWidth: 3, edgeAlpha: 1, seed: this.seed + 9, shadow: 3, grain: false });
      sticker.addChild(plate, drawIcon('info', 28, Color.tealDark));
      sticker.position.set(at.centre.x, at.centre.y);
      sticker.eventMode = 'static';
      sticker.cursor = 'pointer';
      sticker.hitArea = new Rectangle(at.slot.x - at.centre.x, at.slot.y - at.centre.y, at.slot.w, at.slot.h);
      sticker.on('pointerdown', open);
      skillInfo = sticker;
    }
    d.addChild(skill);

    const plan = new BuildPlanView(this.env, u, box.well.w);
    plan.position.set(box.well.x, box.well.y);
    d.addChild(plan);
    // The sticker lies over the photo's corner and laps the well's edge by a pixel, so it goes on last (its touch slot stops at the well).
    if (skillInfo) d.addChild(skillInfo);
  }

  /**
   * What the cat receives from tricksters, in the same line as its stats: the board's badge and the real number, as many as fit. Tapping a chip
   * says what it is and who gives it.
   */
  private buffChips(into: Container, facts: readonly BuffFact[], dodge: number, x0: number, y: number, right: number): void {
    const chips = facts.map((f) => {
      const chip = new Container();
      const badge = new Graphics();
      drawBuffMark(badge, CHIP_R, f.kind);
      badge.position.set(CHIP_R, 0);
      chip.addChild(badge);
      let w = 2 * CHIP_R;
      if (f.value !== null) {
        const label = uiLabel(fmtPct(f.value), { size: 24, anchorX: 0, align: 'left' });
        label.position.set(2 * CHIP_R + 5, 1);
        chip.addChild(label);
        w += 5 + label.width;
      }
      return { chip, w, f };
    });
    const fit = chipsFit(chips.map((c) => c.w), right - x0, CHIP_GAP);
    let x = x0;
    chips.forEach(({ chip, w, f }, i) => {
      if (i >= fit) {
        chip.destroy({ children: true });
        return;
      }
      chip.position.set(x, y);
      x += w + CHIP_GAP;
      const title = t(`hud.buff.${f.kind}`, { n: Math.round((f.kind === 'ward' ? dodge : f.value ?? 0) * 100) });
      const names = f.from.map((id) => t(unitDef(id).nameKey)).join(' · ');
      tapArea(chip, -6, -24, w + 12, 48);
      chip.on('pointerdown', () => info.tap(`buff:${f.kind}`, chip, { title, text: names ? t('hud.buff.from', { names }) : title }));
      into.addChild(chip);
    });
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
    const cost = b.moltCostOf(cell);
    const left = b.moltsLeft();
    const moltAs = moltState(cost, left, b.purr);
    const moltText = moltAs === 'none' ? t('hud.molt.none') : t('hud.molt.sub', { cost, left });
    const moltReady = moltAs === 'ready';
    const awakenFail = b.canAwaken(cell);
    const awakenCost = b.awakenCost();
    const key = [sellText, moltText, moltReady, awakenFail, awakenCost].join('|');
    if (key === this.buttonsKey) return;
    this.buttonsKey = key;
    this.sell.setSublabel(sellText, 'fish');
    // A guardian cannot molt: no purr price, so no purr icon (setSublabel keeps the previous icon unless the text is cleared first).
    if (moltAs === 'none') {
      this.molt.setSublabel(undefined);
      this.molt.setSublabel(moltText);
    } else this.molt.setSublabel(moltText, 'purr');
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

  /** The picker opens only when the molt can be paid; otherwise the button says why, with this cat's price. */
  private openMolt(): void {
    if (this.cell === null) return;
    const b = this.env.battle;
    const refusal = moltRefusal(moltState(b.moltCostOf(this.cell), b.moltsLeft(), b.purr));
    if (refusal) this.env.explain('molt', refusal);
    else void this.env.modal(new MoltPicker(this.env, this.cell));
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
