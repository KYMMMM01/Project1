/**
 * What the laser pointer does, on one paper card: a small picture, the real numbers from the battle's data (what the cats
 * do while the dot is on, the damage bonus on the marked enemies, how long it lasts, the recharge) and what changes them
 * (the toy and the training). Opened by the first presses of the laser button and, from then on, by its info mark.
 */
import { Container, Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { drawTargetMark } from '@/fx';
import { relicDef } from '@/game';
import { Button, Color, drawDashedLine, drawDashedRect, drawIcon, Panel, Popup, uiLabel } from '@/ui';
import type { HudEnv } from '../env';
import { enemyPortrait, relicIcon, unitPortrait } from '../kit';
import { LASER_TOY, laserFacts, secondsText, type LaserFacts } from '../laserMath';

export type LaserCardResult = 'use' | 'close';

const W = 640;
const ART_W = 560;
const ART_H = 168;
const ROW_W = 470;

/** The little scene: a cat, a stretch of lane, three enemies, the dot with its area round two of them and a sticker on each. */
function scene(): Container {
  const c = new Container();
  const lane = new Graphics();
  lane.roundRect(-ART_W / 2, -26, ART_W, 108, 24).fill(Color.kraft);
  drawDashedRect(lane, -ART_W / 2 + 8, -18, ART_W - 16, 92, { radius: 18, color: Color.paperLight, width: 3.5, dash: 14, gap: 10 });
  const area = new Graphics();
  area.circle(-96, 36, 88).fill({ color: Color.coral, alpha: 0.14 });
  area.circle(-96, 36, 88).stroke({ width: 4, color: Color.coralDark });
  c.addChild(lane, area);
  const foes: Array<[number, number, boolean]> = [[-150, 42, true], [-36, 40, true], [150, 42, false]];
  for (const [x, y, marked] of foes) {
    const e = enemyPortrait('cucumber', 78);
    e.position.set(x, y);
    c.addChild(e);
    if (marked) {
      const mark = new Graphics();
      drawTargetMark(mark, 16);
      mark.position.set(x, y - 52);
      c.addChild(mark);
    }
  }
  const dot = new Graphics();
  dot.circle(-96, 36, 13).fill(Color.paperLight);
  dot.circle(-96, 36, 9.5).fill(Color.coralDark);
  c.addChild(dot);
  // A cat on the board side points at the marked enemy that is nearest the dot.
  const cat = unitPortrait('w_paw', 92);
  cat.position.set(112, -78);
  const aim = new Graphics();
  drawDashedLine(aim, 80, -58, -20, 10, { color: Color.tealDark, width: 4.5, dash: 12, gap: 9 });
  aim.poly([-26, 14, -8, 14, -18, -2]).fill(Color.tealDark);
  c.addChild(aim, cat);
  return c;
}

export class LaserCard extends Popup<LaserCardResult> {
  constructor(env: HudEnv, ready: boolean) {
    super({ dismissResult: 'close', priority: 2 });
    const b = env.battle;
    const f = laserFacts(b.laser, b.relics, b.init.loadout.training, b.init.modifiers);

    const c = new Container();
    let y = 108;
    const art = scene();
    art.position.set(W / 2, y + ART_H / 2 - 18);
    c.addChild(art);
    y += ART_H + 14;

    const row = (icon: Container, text: string, color: number = Color.ink): void => {
      const label = uiLabel(text, { size: 26, color, anchorX: 0, align: 'left', wrap: ROW_W });
      const h = Math.max(64, label.height + 16);
      icon.position.set(64, y + h / 2);
      label.position.set(112, y + h / 2);
      c.addChild(icon, label);
      y += h + 6;
    };
    row(drawIcon('target', 50), t('hud.laserCard.row1', { dur: secondsText(f.duration) }));
    const sticker = new Graphics();
    drawTargetMark(sticker, 24);
    row(sticker, t('hud.laserCard.row2', { pct: f.bonusPercent }));
    row(drawIcon('clock', 50), t('hud.laserCard.row3', { cd: secondsText(f.cooldown) }));

    y += 6;
    const mods = uiLabel(t('hud.laserCard.mods'), { size: 26, color: Color.inkSoft });
    mods.position.set(W / 2, y + 16);
    c.addChild(mods);
    y += 44;
    row(relicIcon(LASER_TOY, 56, relicDef(LASER_TOY).rarity), this.toyText(f), f.toy.has ? Color.leafDark : Color.ink);
    row(drawIcon('energy', 50), `${t('hud.laserCard.train', { name: t('training.laser_cd.name'), n: f.training.level })}\n${t('hud.laserCard.trainFx', { cut: secondsText(f.training.perLevel), now: secondsText(f.training.cooldownCut) })}`);
    if (f.rule > 0) row(drawIcon('calendar', 50), t('hud.laserCard.rule', { cd: secondsText(f.rule) }));

    y += 10;
    const btnH = 96;
    const add = (label: string, style: 'success' | 'neutral', x: number, w: number, result: LaserCardResult): void => {
      const btn = new Button({ label, style, width: w, height: btnH, fontSize: 36 });
      btn.position.set(x, y + btnH / 2);
      btn.onTap(() => this.close(result));
      c.addChild(btn);
    };
    if (ready) {
      add(t('hud.laserCard.got'), 'neutral', 188, 250, 'close');
      add(t('hud.laserCard.use'), 'success', 452, 300, 'use');
    } else {
      add(t('hud.laserCard.got'), 'success', W / 2, 360, 'close');
    }
    y += btnH + 56;
    // The sheet is cut to the content's height, which is only known now.
    const panel = new Panel({ width: W, height: y, title: t('hud.laserCard.title'), torn: 'bottom', tape: 'sky' });
    panel.content.addChild(c);
    this.body.addChild(panel);
    this.setContentSize(W + 80, y + 100);
  }

  /** "Toy Batteries (not yet)" over what it adds. */
  private toyText(f: LaserFacts): string {
    const head = t(f.toy.has ? 'hud.laserCard.toyHave' : 'hud.laserCard.toyNone', { name: t(relicDef(LASER_TOY).nameKey) });
    return `${head}\n${t('hud.laserCard.toyFx', { dur: secondsText(f.toy.duration), cut: secondsText(f.toy.cooldownCut) })}`;
  }
}
