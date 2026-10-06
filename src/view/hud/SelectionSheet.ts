/**
 * Selection bar: when a kitten is selected it takes over the upper part of the bottom panel with the
 * kitten's portrait, name, rarity, class, damage / interval / range, the skill line, and the Molt,
 * Awaken and Sell buttons. The SUMMON row below it stays where it is.
 */
import { Container, Graphics } from 'pixi.js';
import { audio } from '@/audio';
import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { classDef, unitDef, type Fail, type UnitState } from '@/game';
import {
  Button,
  Color,
  drawIcon,
  fitLabel,
  IconButton,
  motion,
  Rarity,
  rarityName,
  tooltip,
  TweenBag,
  uiLabel,
  vGradient,
  type IconName,
  shade,
} from '@/ui';
import type { Rect } from './layoutMath';
import type { HudEnv } from './env';
import { CLASS_ICON, tapArea, unitPortrait } from './kit';
import { MoltPicker } from './popups/MoltPicker';

const BTN_W = 212;
const BTN_H = 88;
const SKILL_W = 664;

/** One short line for a refused awakening, shown on the (disabled) button itself. */
function awakenReason(fail: Fail, cost: number): string {
  if (fail === 'not_enough_purr') return t('hud.awaken.r.purr', { n: cost });
  if (fail === 'synergy_too_low') return t('hud.awaken.r.synergy');
  if (fail === 'not_legendary') return t('hud.awaken.r.legend');
  return t('hud.awaken.r.other');
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
  private cell: number | null = null;
  private dirty = false;
  private rect: Rect = { x: 12, y: 6, w: 696, h: 270 };
  private accent: number = Color.neutral;
  private fullSkill = '';

  constructor(private readonly env: HudEnv) {
    const r = env.reveal;
    this.molt = new Button({ label: t('hud.molt'), sublabel: '', sublabelIcon: 'purr', style: 'purple', width: BTN_W, height: BTN_H, fontSize: 32 });
    this.molt.onTap(() => this.openMolt());
    this.awaken = new Button({ label: t('hud.awaken'), sublabel: '', sublabelIcon: 'purr', style: 'primary', width: BTN_W, height: BTN_H, fontSize: 32, fireOnDown: true });
    this.awaken.onTap(() => this.doAwaken());
    this.awaken.onDisabledTap(() => this.explainAwaken());
    this.sell = new Button({ label: t('hud.sell'), sublabel: '', sublabelIcon: 'fish', style: 'danger', width: BTN_W, height: BTN_H, fontSize: 32, fireOnDown: true });
    this.sell.onTap(() => this.doSell());
    this.close = new IconButton({ icon: 'close', style: 'neutral', size: 64, fireOnDown: true });
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
    this.close.position.set(rect.w - 50, 48);
    const y = 220;
    const first = 16 + BTN_W / 2;
    const step = BTN_W + 10;
    const buttons = [this.molt, this.awaken, this.sell].filter((b) => b.visible);
    const total = buttons.length;
    // Fewer buttons are centred as a group.
    const x0 = rect.w / 2 - ((total - 1) * step) / 2;
    buttons.forEach((btn, i) => btn.position.set(total === 3 ? first + i * step : x0 + i * step, y));
    this.drawBg();
    if (this.cell !== null) this.render();
  }

  private drawBg(): void {
    const { w, h } = this.rect;
    this.bg.clear();
    this.bg.roundRect(0, 6, w, h, 34).fill({ color: Color.black, alpha: 0.4 });
    this.bg.roundRect(0, 0, w, h, 34).fill(vGradient(shade(Color.panelLight, 0.06), Color.panel)).stroke({ width: 6, color: Color.outline, alignment: 1 });
    this.bg.roundRect(6, 6, w - 12, h - 12, 28).stroke({ width: 3, color: this.accent, alpha: 0.85, alignment: 1 });
  }

  get shown(): boolean {
    return this.cell !== null;
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
  }

  // ───────────────────────── content ─────────────────────────

  private unit(): UnitState | null {
    return this.cell === null ? null : this.env.battle.units[this.cell] ?? null;
  }

  private render(): void {
    const u = this.unit();
    const b = this.env.battle;
    if (!u || this.cell === null) return;
    const def = unitDef(u.id);
    const rar = Rarity[def.rarity];
    this.accent = rar.color;
    this.drawBg();
    for (const ch of this.dynamic.removeChildren()) ch.destroy({ children: true });
    const d = this.dynamic;

    const plate = new Graphics();
    plate.roundRect(14, 12, 88, 88, 24).fill(vGradient(rar.light, rar.color)).stroke({ width: 5, color: Color.outline, alignment: 1 });
    plate.roundRect(20, 18, 76, 76, 18).fill({ color: Color.bgDeep, alpha: 0.3 });
    const pic = unitPortrait(u.id, 82);
    pic.position.set(58, 58);
    d.addChild(plate, pic);

    const name = uiLabel(t(def.nameKey), { size: 34, anchorX: 0, align: 'left', strokeWidth: 6 });
    name.position.set(118, 28);
    fitLabel(name, 400, 34, 0.75);
    d.addChild(name);

    d.addChild(this.pill(118, 66, rarityName(def.rarity), rar.color, rar.light, null));
    d.addChild(this.pill(this.lastPillEnd + 10, 66, t(classDef(def.classId).nameKey), Color.purpleDark, Color.white, CLASS_ICON[def.classId]));

    const interval = (Math.round(u.stats.interval * 100) / 100).toString();
    let sx = 118;
    const stat = (icon: IconName, text: string): void => {
      const ic = drawIcon(icon, 26);
      ic.position.set(sx + 13, 96);
      const tx = uiLabel(text, { size: 26, anchorX: 0, align: 'left', strokeWidth: 4, shadow: false });
      tx.position.set(sx + 32, 97);
      d.addChild(ic, tx);
      sx += 32 + tx.width + 22;
    };
    stat('swords', fmt(Math.round(u.stats.damage)));
    stat('clock', t('hud.stat.interval', { s: interval }));
    stat('target', fmt(Math.round(u.stats.range)));

    this.fullSkill = def.skillText();
    const skill = uiLabel(this.fullSkill, { size: 24, wrap: SKILL_W, lineHeight: 30, anchorX: 0, anchorY: 0, align: 'left', strokeWidth: 4, shadow: false });
    let cut = this.fullSkill.length;
    while (skill.height > 62 && cut > 6) {
      cut -= Math.max(2, Math.ceil(cut * 0.06));
      skill.text = this.fullSkill.slice(0, cut).trimEnd() + '…';
    }
    skill.position.set(16, 112);
    if (cut < this.fullSkill.length) {
      tapArea(skill, 0, 0, SKILL_W, 64);
      skill.on('pointerdown', () => tooltip.show(skill, { title: t(def.nameKey), text: this.fullSkill }, 8));
    }
    d.addChild(skill);

    // Buttons.
    const sellV = b.sellValue(this.cell);
    this.sell.setSublabel(sellV.purr > 0 ? t('hud.sell.both', { fish: fmt(sellV.fish), purr: sellV.purr }) : `+${fmt(sellV.fish)}`, 'fish');
    const cost = b.moltCost();
    const left = b.moltsLeft();
    this.molt.setSublabel(t('hud.molt.sub', { cost, left }), 'purr');
    this.molt.setStyle(left > 0 && b.purr >= cost ? 'purple' : 'neutral');
    this.renderAwaken();
  }

  /** Right edge of the last pill drawn by pill(); the next one starts after it. */
  private lastPillEnd = 0;

  private pill(x: number, y: number, text: string, fill: number, textColor: number, icon: IconName | null): Container {
    const c = new Container();
    const label = uiLabel(text, { size: 24, color: textColor, strokeWidth: 4, shadow: false });
    const iw = icon ? 28 : 0;
    const w = label.width + iw + 28;
    const g = new Graphics();
    g.roundRect(0, -16, w, 32, 16).fill({ color: fill, alpha: 0.35 }).stroke({ width: 3, color: fill });
    label.position.set(14 + iw + label.width / 2, 0);
    c.addChild(g, label);
    if (icon) {
      const ic = drawIcon(icon, 24);
      ic.position.set(14 + 12, 0);
      c.addChild(ic);
    }
    c.position.set(x, y);
    this.lastPillEnd = x + w;
    return c;
  }

  private renderAwaken(): void {
    const b = this.env.battle;
    const u = this.unit();
    if (!u || this.cell === null) return;
    const fail = b.canAwaken(this.cell);
    const cost = b.awakenCost();
    if (fail === null) {
      this.awaken.setEnabled(true);
      this.awaken.setSublabel(String(cost), 'purr');
    } else {
      this.awaken.setEnabled(false);
      // setSublabel keeps the previous icon unless the text is cleared first.
      this.awaken.setSublabel(undefined);
      this.awaken.setSublabel(awakenReason(fail, cost));
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
