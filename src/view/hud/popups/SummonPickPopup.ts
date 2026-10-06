/**
 * Pick one of three kittens (every 6th paid summon, and the tutorial's scripted offer). The cards show
 * their rarity frame at once; a hold shows the skill; the simulation is paused while this is open.
 */
import { Container, type DestroyOptions } from 'pixi.js';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { classDef, unitClass, unitDef, unitRarity, type UnitId } from '@/game';
import {
  attachTooltip,
  CardFrame,
  Color,
  drawIcon,
  HOLD_DELAY,
  motion,
  Panel,
  Popup,
  TweenBag,
  uiLabel,
} from '@/ui';
import { audio } from '@/audio';
import { haptic } from '@/core/haptics';
import type { HudEnv } from '../env';
import { CLASS_ICON, PressCard, unitPortrait } from '../kit';
import { recommendPick } from '../policy';
import { Hand } from '../Hand';

const W = 690;
const SCALE = 0.92;
const CARD_W = 220 * SCALE;
const GAP = 14;

export class SummonPickPopup extends Popup<void> {
  private readonly bag = new TweenBag();
  private readonly cards: PressCard[] = [];
  private readonly offs: Array<() => void> = [];
  private picked = false;
  /** Index of the highlighted card, used by the tutorial pointer. */
  readonly recommended: number;
  readonly hand: Hand | null;

  constructor(
    private readonly env: HudEnv,
    options: readonly UnitId[],
    guide: boolean,
  ) {
    super({ dismissResult: undefined, backdropClose: false, backClose: false, priority: 2 });
    const board = env.battle.units.filter((u): u is NonNullable<typeof u> => u !== null).map((u) => u.id);
    this.recommended = recommendPick(
      options.map((id) => ({ id, classId: unitClass(id), rarity: unitRarity(id) })),
      board,
      unitClass,
    );

    const h = 560;
    const panel = new Panel({ width: W, height: h, title: t('hud.pick.title') });
    const c = panel.content;
    const sub = uiLabel(t('hud.pick.sub'), { size: 26, color: Color.textDim, strokeWidth: 4, shadow: false, wrap: W - 80 });
    sub.position.set(W / 2, 84);
    c.addChild(sub);

    options.forEach((id, i) => {
      const def = unitDef(id);
      const x = W / 2 + (i - (options.length - 1) / 2) * (CARD_W + GAP);
      const card = new PressCard(220, 292, () => this.choose(i), { holdLimit: HOLD_DELAY });
      card.scale.set(SCALE);
      card.position.set(x, 290);
      const frame = new CardFrame({
        rarity: def.rarity,
        size: 'medium',
        portrait: unitPortrait(id, 190),
        name: t(def.nameKey),
        newTag: guide && i === this.recommended ? t('hud.recommend') : undefined,
      });
      card.addChild(frame);
      const klass = new Container();
      const icon = drawIcon(CLASS_ICON[def.classId], 40);
      icon.position.set(-44, 0);
      const name = uiLabel(t(classDef(def.classId).nameKey), { size: 28, anchorX: 0, align: 'left', strokeWidth: 4, shadow: false });
      name.position.set(-18, 0);
      klass.addChild(icon, name);
      klass.position.set(0, 190);
      card.addChild(klass);
      this.offs.push(attachTooltip(card, () => ({ title: t(def.nameKey), text: def.skillText() })));
      c.addChild(card);
      this.cards.push(card);
    });

    const tip = uiLabel(t('hud.pick.tip'), { size: 24, color: Color.textDim, strokeWidth: 4, shadow: false, wrap: W - 80 });
    tip.position.set(W / 2, h - 44);
    c.addChild(tip);
    this.body.addChild(panel);

    if (guide) {
      this.hand = new Hand();
      this.hand.tap();
      const rx = W / 2 + (this.recommended - (options.length - 1) / 2) * (CARD_W + GAP);
      // The fingertip rests on the card's lower right corner so the hand never hides the name.
      this.hand.scale.set(0.85);
      this.hand.position.set(rx + 72, 398);
      c.addChild(this.hand);
    } else {
      this.hand = null;
    }
    this.setContentSize(W + 80, h + 100);
  }

  override onOpened(): void {
    if (motion.reduced) return;
    // Cards deal in one by one (U-10): rise, tilt, settle.
    this.cards.forEach((card, i) => {
      const y1 = card.y;
      const rot = (i - 1) * 0.1;
      card.y = y1 + 160;
      card.alpha = 0;
      this.bag.run({
        duration: 0.26,
        delay: 0.06 + i * 0.08,
        ease: Ease.backOut,
        onUpdate: (k) => {
          card.y = y1 + 160 * (1 - k);
          card.rotation = rot * (1 - k);
          card.alpha = Math.min(1, k * 3);
        },
        onComplete: () => {
          card.y = y1;
          card.rotation = 0;
          card.alpha = 1;
        },
      });
    });
  }

  private choose(index: number): void {
    if (this.picked) return;
    const { ctx, battle } = this.env;
    const fail = ctx.command('pickSummon', () => battle.pickSummon(index));
    if (fail !== null) return;
    this.picked = true;
    audio.play('relic_pick', { volume: 0.7 });
    haptic('medium');
    this.hand?.destroy();
    this.cards.forEach((card, i) => {
      card.setEnabled(false);
      if (i === index) this.bag.run({ duration: 0.16, ease: Ease.cubicOut, onUpdate: (k) => card.scale.set(SCALE * (1 + 0.1 * k)) });
      else this.bag.run({ duration: 0.16, ease: Ease.cubicIn, onUpdate: (k) => (card.alpha = 1 - 0.7 * k) });
    });
    this.bag.call(0.16, () => this.close());
  }

  override destroy(options?: DestroyOptions): void {
    for (const off of this.offs.splice(0)) off();
    this.bag.killAll();
    super.destroy(options);
  }
}
