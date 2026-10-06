/**
 * The full-screen "get ready" page between the battle tab and the battle: what is about to be played
 * (chapter, butler level and its rules, the boss), and the starter snack offer. Picking a snack by ad or
 * gems starts the run at once; the big button starts without one.
 */
import { Container, Graphics, Sprite, type Text } from 'pixi.js';
import { audio } from '@/audio';
import { hasTex, tex } from '@/core/assets';
import { fmt } from '@/core/format';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import { t } from '@/core/i18n';
import { CHAPTERS, modifierName, modifierText, stakeText, type EnemyId } from '@/game';
import { OFFERS, SNACKS, profile, type SnackId } from '@/meta';
import { ads } from '@/platform';
import {
  Button,
  Color,
  Panel,
  ScreenScaffold,
  Tag,
  drawIcon,
  fitLabel,
  gradient,
  rgba,
  uiLabel,
  type IconName,
} from '@/ui';
import { SNACK_FISH, SNACK_PURR } from '@/meta/data/economy';
import type { StartRunRequest } from '../contract';
import { planRun, type RunPlan } from './runPlan';
import './strings';

export interface SnackChoice {
  id: SnackId;
  via: 'ad' | 'gems';
}

export interface PreRunHandlers {
  /** Begin the run. Resolves true when the battle is opening, false to stay on this page (a refused payment, say). */
  start(snack: SnackChoice | undefined): Promise<boolean>;
  cancel(): void;
}

export interface PreRunHandle {
  destroy(): void;
}

const HERO_H = 340;
const SNACK_ICON: Record<SnackId, IconName> = { fish: 'fish', purr: 'purr', rare_summon: 'dice' };

function snackName(id: SnackId): string {
  switch (id) {
    case 'fish':
      return t('shell.pre.snack.fish', { n: SNACK_FISH });
    case 'purr':
      return t('shell.pre.snack.purr', { n: SNACK_PURR });
    case 'rare_summon':
      return t('shell.pre.snack.rare_summon');
  }
}

function snackDesc(id: SnackId): string {
  return t('shell.pre.snack.' + id + '.desc', { rarity: t('rarity.rare') });
}

/** The lines under "rules this run": one per stake step reached, today's rule for the daily, a note for endless. */
function ruleLines(plan: RunPlan): string[] {
  switch (plan.mode) {
    case 'daily':
      return plan.modifiers.map((m) => `${modifierName(m)}: ${modifierText(m)}`);
    case 'endless':
      return [t('shell.pre.endless.rules')];
    default: {
      if (plan.stake <= 0) return [t('shell.pre.rules.none')];
      return Array.from({ length: plan.stake }, (_, i) => stakeText(i + 1));
    }
  }
}

function modeLabel(plan: RunPlan): string {
  return t('shell.pre.mode.' + (plan.mode === 'tutorial' ? 'chapter' : plan.mode));
}

function buildHero(plan: RunPlan, w: number): Container {
  const info = CHAPTERS[plan.chapter - 1] ?? CHAPTERS[0];
  const root = new Container();
  const mask = new Graphics().roundRect(0, 0, w, HERO_H, 36).fill(Color.white);
  const art = new Container();
  const base = new Graphics().roundRect(0, 0, w, HERO_H, 36).fill(Color.panelDark);
  art.addChild(base);
  if (info && hasTex(info.background)) {
    const bg = new Sprite(tex(info.background));
    const s = Math.max(w / bg.texture.width, HERO_H / bg.texture.height);
    bg.scale.set(s);
    bg.anchor.set(0.5);
    bg.position.set(w / 2, HERO_H * 0.5);
    art.addChild(bg);
  }
  const shade = new Graphics()
    .rect(0, 0, w, HERO_H)
    .fill(gradient([[0, rgba(Color.black, 0.78)], [0.62, rgba(Color.black, 0.25)], [1, rgba(Color.black, 0)]], true));
  const floor = new Graphics()
    .rect(0, HERO_H - 90, w, 90)
    .fill(gradient([[0, rgba(Color.black, 0)], [1, rgba(Color.black, 0.55)]]));
  art.addChild(shade, floor);
  art.mask = mask;
  root.addChild(art, mask);

  const bossId: EnemyId | undefined = info?.boss;
  if (bossId && hasTex(bossId)) {
    const boss = new Sprite(tex(bossId));
    boss.anchor.set(0.5, 1);
    boss.scale.set(Math.min(300 / boss.texture.height, 330 / boss.texture.width));
    boss.position.set(w - 150, HERO_H - 8);
    root.addChild(boss);
  } else {
    const skull = drawIcon('skull', 150);
    skull.position.set(w - 150, HERO_H / 2);
    root.addChild(skull);
  }

  const mode = new Tag({ text: modeLabel(plan), style: 'info', shape: 'pill', fontSize: 26 });
  mode.position.set(24 + mode.uiBox.w / 2, 36);
  const name = uiLabel(t(info?.nameKey ?? 'chapter.1.name'), { size: 64, strokeWidth: 9, anchorX: 0, anchorY: 0.5 });
  name.position.set(28, HERO_H - 120);
  fitLabel(name, w * 0.5, 64);
  const subtitle: Text = uiLabel(t('shell.pre.chapter', { n: plan.chapter }), {
    size: 28,
    anchorX: 0,
    anchorY: 0.5,
    color: Color.textDim,
  });
  subtitle.position.set(30, HERO_H - 64);
  fitLabel(subtitle, w * 0.5, 28);
  root.addChild(mode, name, subtitle);
  if (plan.mode === 'chapter' && plan.stake > 0) {
    const stake = new Tag({ text: t('shell.pre.stake', { n: plan.stake }), style: 'danger', shape: 'flag', fontSize: 26 });
    stake.position.set(w - 24 - stake.uiBox.w / 2, 40);
    root.addChild(stake);
  }
  return root;
}

function buildRules(plan: RunPlan, w: number): Panel {
  const lines = ruleLines(plan);
  const title = plan.mode === 'daily' ? t('shell.pre.daily.rules') : t('shell.pre.rules');
  const texts = lines.map((line) => uiLabel(line, { size: 28, wrap: w - 130, align: 'left', anchorX: 0, anchorY: 0, stroke: false, shadow: false }));
  let y = 84;
  const rows = texts.map((tx) => {
    const top = y;
    y += Math.max(48, tx.height) + 14;
    return top;
  });
  const h = y + 12;
  const panel = new Panel({ width: w, height: h, variant: 'inset', cache: false });
  panel.position.set(w / 2, h / 2);
  const head = uiLabel(title, { size: 32, anchorX: 0 });
  head.position.set(28, 44);
  panel.content.addChild(head);
  texts.forEach((tx, i) => {
    const top = rows[i] as number;
    const bullet = drawIcon(plan.mode === 'daily' ? 'sun' : plan.stake > 0 ? 'warning' : 'check', 38);
    bullet.position.set(52, top + Math.max(48, tx.height) / 2);
    tx.position.set(92, top + (Math.max(48, tx.height) - tx.height) / 2);
    panel.content.addChild(bullet, tx);
  });
  return panel;
}

interface SnackRow {
  panel: Panel;
  buttons: Button[];
}

function buildSnackRow(id: SnackId, w: number, onPick: (via: 'ad' | 'gems') => void): SnackRow {
  const h = 214;
  const panel = new Panel({ width: w, height: h, variant: 'default', cache: false });
  panel.position.set(w / 2, h / 2);
  const icon = drawIcon(SNACK_ICON[id], 84);
  icon.position.set(24 + 42, 28 + 42);
  const name = uiLabel(snackName(id), { size: 34, anchorX: 0 });
  name.position.set(24 + 84 + 20, 28 + 16);
  fitLabel(name, w - 24 - 84 - 20 - 24, 34);
  const desc = uiLabel(snackDesc(id), { size: 26, anchorX: 0, anchorY: 0, color: Color.textDim, stroke: false, shadow: false, align: 'left', wrap: w - 24 - 84 - 20 - 24 });
  desc.position.set(24 + 84 + 20, 28 + 40);
  panel.content.addChild(icon, name, desc);

  const bw = (w - 24 * 2 - 16) / 2;
  const adReady = ads.canOffer(OFFERS.start_snack.ad);
  const adBtn = new Button({
    label: adReady ? t('shell.pre.ad') : t('shell.pre.ad.none'),
    icon: 'ad',
    style: 'success',
    width: bw,
    height: 88,
    fontSize: 30,
    enabled: adReady,
    disabledMark: 'none',
  });
  adBtn.position.set(24 + bw / 2, h - 24 - 44);
  adBtn.onTap(() => onPick('ad'));
  const gemBtn = new Button({
    label: fmt(OFFERS.start_snack.gems),
    icon: 'gem',
    style: 'info',
    width: bw,
    height: 88,
    fontSize: 34,
  });
  gemBtn.position.set(24 + bw + 16 + bw / 2, h - 24 - 44);
  gemBtn.onTap(() => onPick('gems'));
  panel.content.addChild(adBtn, gemBtn);
  return { panel, buttons: [adBtn, gemBtn] };
}

export function openPreRun(request: StartRunRequest, handlers: PreRunHandlers): PreRunHandle {
  const plan = planRun(request, { cleared: profile.data.cleared, daily: profile.dailyView().setup });
  const scaffold = new ScreenScaffold({ title: t('shell.pre.title'), onBack: () => handlers.cancel(), scroll: true, actionBarHeight: 170 });
  game.popupLayer.addChild(scaffold);
  const w = scaffold.contentWidth;
  const content = scaffold.content;
  let alive = true;
  let busy = false;
  const locks: Button[] = [];

  const setBusy = (v: boolean): void => {
    busy = v;
    for (const b of locks) b.setEnabled(!v);
  };

  const run = async (snack: SnackChoice | undefined, source: Button): Promise<void> => {
    if (busy) return;
    setBusy(true);
    source.setBusy(true);
    const ok = await handlers.start(snack);
    if (!alive) return;
    source.setBusy(false);
    if (ok) return;
    setBusy(false);
  };

  const hero = buildHero(plan, w);
  content.addChild(hero);
  let y = HERO_H + 20;

  const rules = buildRules(plan, w);
  rules.y += y;
  content.addChild(rules);
  y += rules.panelH + 20;

  if (plan.snackAllowed) {
    const head = uiLabel(t('shell.pre.snack'), { size: 36, anchorX: 0 });
    head.position.set(8, y + 22);
    const hint = uiLabel(t('shell.pre.snack.hint'), { size: 24, anchorX: 0, anchorY: 0, color: Color.textDim, stroke: false, shadow: false, align: 'left', wrap: w - 16 });
    hint.position.set(8, y + 52);
    content.addChild(head, hint);
    y += 52 + hint.height + 14;
    for (const id of SNACKS) {
      const row = buildSnackRow(id, w, (via) => {
        const source = row.buttons[via === 'ad' ? 0 : 1] as Button;
        void run({ id, via }, source);
      });
      row.panel.y += y;
      content.addChild(row.panel);
      locks.push(...row.buttons);
      y += row.panel.panelH + 16;
    }
  }
  scaffold.refresh();

  const go = new Button({ label: plan.snackAllowed ? t('shell.pre.start') : t('shell.pre.go'), icon: 'play', style: 'primary', width: 600, height: 124, fontSize: 48 });
  go.onTap(() => void run(undefined, go));
  locks.push(go);
  scaffold.actionBar.addChild(go);
  go.startPulse({ times: -1 });

  void scaffold.show(true);
  audio.play('whoosh');
  haptic('light');

  return {
    destroy: () => {
      if (!alive) return;
      alive = false;
      scaffold.destroy({ children: true });
    },
  };
}
