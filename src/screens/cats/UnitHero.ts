import { Container, Graphics, type DestroyOptions, type Text } from 'pixi.js';
import { t } from '@/core/i18n';
import { mixColor, TAU } from '@/core/math';
import { Ease } from '@/core/tween';
import type { UnitId } from '@/game/api';
import { unitClass, unitRarity } from '@/game/data/roster';
import { unitDef } from '@/game/data/units';
import {
  cacheStatic, Color, drawDashedInset, drawIcon, drawSpeechBubble, motion, paperSeed, paperShape, PaperLabel, punch, Rarity, rarityName,
  tapeStrip, TweenBag, uiLabel,
} from '@/ui';
import { unitPortrait } from '../shop/art';
import { classIcon } from '../shop/keys';
import { paperSun } from '../shop/paperBits';

const CAT_H = 340;
const SUN_Y = 300;
const CAT_BASE = 488;
const BUBBLE_Y = 552;

/** A small paper pill with ink text and an optional icon in front. Origin = centre. */
function chip(text: string, fill: number, edge: number, icon?: Container): Container {
  const label = uiLabel(text, { size: 26, color: Color.inkDeep });
  const iconW = icon ? 40 : 0;
  const w = Math.ceil(label.width) + 36 + iconW;
  const c = new Container();
  c.addChild(paperShape({ w, h: 46, kind: 'pill', fill, edge, shadow: 3, grain: false }));
  label.position.set(iconW / 2, 1);
  if (icon) {
    icon.position.set(-w / 2 + 28, 0);
    c.addChild(icon);
  }
  c.addChild(label);
  return c;
}

/**
 * The top of the unit screen: a cream sheet with a taped corner and a teal cut line, the name on a label in the
 * rarity colour, the cat as a sticker standing on a paper pedestal in front of a slowly turning flat sunburst,
 * the level on a round sticker and the flavour line in a speech bubble. Origin = top-left of the sheet.
 */
export class UnitHero extends Container {
  readonly heroH: number;
  private readonly bag = new TweenBag();
  private readonly sun: Graphics;
  private readonly cat: Container;
  private readonly sticker = new Container();
  private readonly lvNum: Text;
  private spin = 0;
  private turn = 0;

  constructor(unit: UnitId, w: number) {
    super();
    const rarity = unitRarity(unit);
    const rar = Rarity[rarity];
    const seed = paperSeed();

    const flavour = uiLabel(t(unitDef(unit).descKey), { size: 26, wrap: w - 130, lineHeight: 34, align: 'center' });
    const bubbleH = Math.ceil(flavour.height) + 40;
    this.heroH = BUBBLE_Y + bubbleH + 34;

    const paper = { w, h: this.heroH, fill: Color.paper, radius: 30, seed } as const;
    const sheet = paperShape(paper);
    sheet.position.set(w / 2, this.heroH / 2);
    const cut = new Graphics();
    drawDashedInset(cut, 0, 0, paper, 11, { seed });
    cacheStatic(cut);
    const tape = tapeStrip({ name: 'sky', w: 110, h: 32, angle: 3, pattern: 'dots', seed });
    tape.position.set(w - 86, 6);
    this.addChild(sheet, cut, tape);

    this.sun = paperSun(215, 14, mixColor(rar.light, Color.paperLight, 0.3), 0.85);
    this.sun.position.set(w / 2, SUN_Y);
    this.addChild(this.sun);

    const ped = new Graphics();
    ped.ellipse(w / 2, CAT_BASE + 20, 178, 36).fill({ color: Color.shadow, alpha: 0.22 });
    ped.ellipse(w / 2, CAT_BASE + 12, 172, 34).fill(Color.kraft).stroke({ width: 2, color: Color.kraftDark, alpha: 0.7, alignment: 0 });
    ped.ellipse(w / 2, CAT_BASE - 2, 138, 25).fill(rar.color).stroke({ width: 2, color: rar.dark, alpha: 0.8, alignment: 0 });
    cacheStatic(ped);
    this.addChild(ped);

    this.cat = unitPortrait(unit, rarity, CAT_H);
    this.cat.position.set(w / 2, CAT_BASE - CAT_H / 2 + 6);
    this.addChild(this.cat);

    const name = new PaperLabel({ text: t(`unit.${unit}.name`), size: 46, paper: rar.color, ink: Color.inkDeep, minWidth: 280, maxWidth: w - 150, seed });
    name.position.set(w / 2, 0);
    const rank = chip(rarityName(rarity), rar.color, rar.dark);
    const cls = unitClass(unit);
    const kind = chip(t(`class.${cls}.name`), Color.paperDim, Color.kraftDark, drawIcon(classIcon(cls), 34));
    const gap = 14;
    const rowW = (rank.width + kind.width + gap) / 2;
    rank.position.set(w / 2 - rowW + rank.width / 2, 74);
    kind.position.set(w / 2 + rowW - kind.width / 2, 74);

    const disc = paperShape({ w: 108, h: 108, kind: 'circle', fill: Color.paperLight, edge: Color.kraftDark, grain: false, seed: seed + 3 });
    const cap = uiLabel(t('cats.lv', { n: '' }), { size: 24, color: Color.inkSoft });
    cap.position.set(0, -26);
    this.lvNum = uiLabel('1', { size: 52 });
    this.lvNum.position.set(0, 12);
    this.sticker.addChild(disc, cap, this.lvNum);
    this.sticker.position.set(w - 84, 176);
    this.sticker.rotation = 0.1;

    const bubble = new Graphics();
    drawSpeechBubble(bubble, 40, BUBBLE_Y, w - 80, bubbleH, { radius: 26, seed, tail: { side: 'top', x: (w - 80) / 2, len: 20, half: 16 } });
    cacheStatic(bubble);
    flavour.position.set(w / 2, BUBBLE_Y + bubbleH / 2);
    this.addChild(bubble, flavour, name, rank, kind, this.sticker);

    if (!motion.reduced) {
      const catY = this.cat.y;
      this.bag.run({
        duration: 1.5, repeat: -1, yoyo: true, ease: Ease.sineInOut,
        onUpdate: (k) => {
          this.cat.y = catY - 8 * k;
        },
      });
      // Two whole turns per loop: the burst is symmetrical, so the restart is invisible.
      this.bag.run({
        duration: 100, repeat: -1, ease: Ease.linear,
        onUpdate: (k) => {
          this.turn = k * TAU * 2;
          this.sun.rotation = this.turn + this.spin;
        },
      });
    }
  }

  /** The level shown on the sticker (the number roll writes here every frame). */
  setLevel(n: number): void {
    this.lvNum.text = String(n);
  }

  /** The sticker pops and the sunburst spins faster for a moment. */
  celebrate(): void {
    if (motion.reduced) return;
    punch(this.bag, this.sticker, 0.3, 0.32);
    punch(this.bag, this.cat, 0.06, 0.3, this.cat.scale.x);
    this.bag.run({
      duration: 0.9,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        this.spin = 1.6 * k;
        this.sun.rotation = this.turn + this.spin;
      },
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }
}
