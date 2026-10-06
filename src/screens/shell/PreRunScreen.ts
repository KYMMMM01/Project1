/**
 * The full-screen "get ready" page between the battle tab and the battle, a page of a scrapbook: the
 * chapter as a taped photo with its boss as a sticker, the rules this run adds, the four class lines
 * (what two identical cats become), and the starter snack offers. Picking a snack by ad or gems starts
 * the run at once; the big button starts without one.
 */
import { Container, Graphics } from 'pixi.js';
import { audio } from '@/audio';
import { fmt } from '@/core/format';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import { t } from '@/core/i18n';
import { modifierName, modifierText, stakeText, type ClassId } from '@/game';
import { OFFERS, SNACKS, profile, type SnackId } from '@/meta';
import { SNACK_FISH, SNACK_PURR } from '@/meta/data/economy';
import { ads } from '@/platform';
import {
  Button,
  Color,
  PaperLabel,
  Panel,
  ScreenScaffold,
  Tag,
  TweenBag,
  drawIcon,
  drawPaper,
  fitLabel,
  paperSeed,
  uiLabel,
  type IconName,
} from '@/ui';
import { ChapterPhoto, bossSticker, chapterInfo } from '../battle/ChapterPhoto';
import type { StartRunRequest } from '../contract';
import { startBob } from './bob';
import { CLASS_LINE_H, ClassLine } from './ClassLine';
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

const PHOTO_H = 340;
const PHOTO_TOP = 14;
const BOSS_BOX = 230;
/** Space a panel's straddling title label takes above its top edge. */
const TITLE_ROOM = 52;
const SNACK_ICON: Record<SnackId, IconName> = { fish: 'fish', purr: 'purr', rare_summon: 'dice' };
const CLASS_ICON: Record<ClassId, IconName> = { warrior: 'class_warrior', ranger: 'class_ranger', mage: 'class_mage', trickster: 'class_trickster' };
const CLASSES: readonly ClassId[] = ['warrior', 'ranger', 'mage', 'trickster'];
const ICON_SLOT = 76;

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

/** The photo, the boss sticker, and the labels that name the chapter and the mode. Height: the photo plus the sticker's overhang and caption. */
function buildHero(plan: RunPlan, w: number): Container {
  const root = new Container();
  const photo = new ChapterPhoto({ w, h: PHOTO_H, chapter: plan.chapter, tape: 'sky', tilt: 0.008 });
  photo.position.set(0, PHOTO_TOP);
  root.addChild(photo);

  const kickerText = plan.mode === 'daily' || plan.mode === 'endless'
    ? `${modeLabel(plan)} · ${t('shell.pre.chapter', { n: plan.chapter })}`
    : t('shell.pre.chapter', { n: plan.chapter });
  const kicker = new PaperLabel({ text: kickerText, size: 28, paper: 'info', padX: 24, padY: 9, maxWidth: w * 0.6 });
  kicker.position.set(26 - kicker.uiBox.x, PHOTO_TOP + 46);
  const name = new PaperLabel({ text: t(chapterInfo(plan.chapter).nameKey), size: 56, paper: 'mustard', padX: 34, padY: 12, maxWidth: w * 0.52 });
  name.position.set(22 - name.uiBox.x, PHOTO_TOP + PHOTO_H - 56);
  const boss = bossSticker(plan.chapter, BOSS_BOX, BOSS_BOX, false);
  boss.position.set(w - BOSS_BOX / 2 - 14, PHOTO_TOP + PHOTO_H + 28);
  const caption = new PaperLabel({ text: t('shell.pre.boss'), size: 24, paper: 'kraft', padX: 20, padY: 6, maxWidth: BOSS_BOX });
  caption.position.set(boss.x, PHOTO_TOP + PHOTO_H + 58);
  root.addChild(kicker, name, boss, caption);

  if (plan.mode === 'chapter' && plan.stake > 0) {
    const stake = new Tag({ text: t('shell.pre.stake', { n: plan.stake }), style: 'danger', shape: 'flag', fontSize: 28 });
    stake.position.set(w - 28 - stake.uiBox.w / 2, PHOTO_TOP + 54);
    root.addChild(stake);
  }
  return root;
}

function buildRules(plan: RunPlan, w: number): Panel {
  const lines = ruleLines(plan);
  const title = plan.mode === 'daily' ? t('shell.pre.daily.rules') : t('shell.pre.rules');
  const texts = lines.map((line) => uiLabel(line, { size: 28, wrap: w - 130, align: 'left', anchorX: 0, anchorY: 0 }));
  let y = 62;
  const rows = texts.map((tx) => {
    const top = y;
    y += Math.max(48, tx.height) + 14;
    return top;
  });
  const h = y + 10;
  const panel = new Panel({ width: w, height: h, variant: 'default', title, ribbon: 'info', cache: false });
  panel.position.set(w / 2, h / 2);
  texts.forEach((tx, i) => {
    const top = rows[i] as number;
    const bullet = drawIcon(plan.mode === 'daily' ? 'sun' : plan.stake > 0 ? 'warning' : 'check', 38);
    bullet.position.set(52, top + Math.max(48, tx.height) / 2);
    tx.position.set(92, top + (Math.max(48, tx.height) - tx.height) / 2);
    panel.content.addChild(bullet, tx);
  });
  return panel;
}

/** The four class lines: what two identical cats of a class become, rank by rank. */
function buildLines(w: number): Panel {
  const lineW = w - 40 - ICON_SLOT;
  const rowH = CLASS_LINE_H + 10;
  const hint = uiLabel(t('shell.pre.lines.hint'), { size: 24, wrap: w - 80, color: Color.inkSoft, anchorY: 0 });
  const h = 62 + CLASSES.length * rowH + hint.height + 22;
  const panel = new Panel({ width: w, height: h, variant: 'default', title: t('shell.pre.lines'), ribbon: 'primary', cache: false });
  panel.position.set(w / 2, h / 2);
  CLASSES.forEach((c, i) => {
    const top = 62 + i * rowH;
    const medal = new Graphics();
    drawPaper(medal, 20, top + 8, { w: 60, h: 60, kind: 'circle', fill: Color.paperDim, edge: Color.kraftDark, shadow: 3, grain: false, seed: paperSeed() });
    const icon = drawIcon(CLASS_ICON[c], 42);
    icon.position.set(50, top + 38);
    const line = new ClassLine(c, lineW);
    line.position.set(20 + ICON_SLOT, top);
    panel.content.addChild(medal, icon, line);
  });
  hint.position.set(w / 2, 62 + CLASSES.length * rowH + 4);
  panel.content.addChild(hint);
  return panel;
}

interface SnackRow {
  panel: Panel;
  buttons: Button[];
}

function buildSnackRow(id: SnackId, w: number, onPick: (via: 'ad' | 'gems') => void): SnackRow {
  const h = 236;
  const panel = new Panel({ width: w, height: h, variant: 'default', cache: false });
  panel.position.set(w / 2, h / 2);
  const seed = paperSeed();
  const disc = new Graphics();
  drawPaper(disc, 24, 24, { w: 92, h: 92, kind: 'circle', fill: Color.paperDim, edge: Color.kraftDark, shadow: 3, grain: false, seed });
  const icon = drawIcon(SNACK_ICON[id], 64);
  icon.position.set(24 + 46, 24 + 46);
  const textLeft = 24 + 92 + 20;
  const name = uiLabel(snackName(id), { size: 34, anchorX: 0 });
  name.position.set(textLeft, 24 + 18);
  fitLabel(name, w - textLeft - 24, 34);
  const desc = uiLabel(snackDesc(id), { size: 26, anchorX: 0, anchorY: 0, color: Color.inkSoft, align: 'left', wrap: w - textLeft - 24 });
  desc.position.set(textLeft, 24 + 46);
  panel.content.addChild(disc, icon, name, desc);

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
  const bag = new TweenBag();
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
  let y = PHOTO_TOP + PHOTO_H + 78;

  const rules = buildRules(plan, w);
  rules.y += y + TITLE_ROOM;
  content.addChild(rules);
  y += TITLE_ROOM + rules.panelH + 24;

  if (plan.mode !== 'tutorial') {
    const lines = buildLines(w);
    lines.y += y + TITLE_ROOM;
    content.addChild(lines);
    y += TITLE_ROOM + lines.panelH + 24;
  }

  if (plan.snackAllowed) {
    const head = new PaperLabel({ text: t('shell.pre.snack'), size: 36, paper: 'mustard', padX: 34, padY: 10 });
    head.position.set(-head.uiBox.x, y + 30);
    const hint = uiLabel(t('shell.pre.snack.hint'), { size: 24, anchorX: 0, anchorY: 0, onArt: true, align: 'left', wrap: w - 16 });
    hint.position.set(8, y + 78);
    content.addChild(head, hint);
    y += 78 + hint.height + 18;
    for (const id of SNACKS) {
      const row = buildSnackRow(id, w, (via) => {
        const source = row.buttons[via === 'ad' ? 0 : 1] as Button;
        void run({ id, via }, source);
      });
      row.panel.y += y;
      content.addChild(row.panel);
      locks.push(...row.buttons);
      y += row.panel.panelH + 18;
    }
  }
  scaffold.refresh();

  const go = new Button({ label: plan.snackAllowed ? t('shell.pre.start') : t('shell.pre.go'), icon: 'play', style: 'primary', width: 600, height: 124, fontSize: 48, tape: 'pink' });
  go.onTap(() => void run(undefined, go));
  locks.push(go);
  scaffold.actionBar.addChild(go);
  startBob(bag, go);

  void scaffold.show(true);
  audio.play('whoosh');
  haptic('light');

  return {
    destroy: () => {
      if (!alive) return;
      alive = false;
      bag.killAll();
      scaffold.destroy({ children: true });
    },
  };
}
