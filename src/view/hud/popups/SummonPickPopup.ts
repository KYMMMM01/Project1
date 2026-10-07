/**
 * Pick one of three kittens (every 6th paid summon, and the tutorial's scripted offer). The cards show
 * their rarity frame at once; a hold shows the skill; the simulation is paused while this is open.
 */
import { Container, type DestroyOptions } from 'pixi.js';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { classDef, unitClass, unitDef, unitRarity, type UnitId } from '@/game';
import { topicTeach } from '@/guide';
import {
  attachTooltip,
  CardFrame,
  Color,
  drawIcon,
  fitLabel,
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
import { planOf } from '../planMath';
import { PICK, pickCardX, pickHand, pickSheet } from '../layoutMath';
import { recommendPick } from '../policy';
import { Hand } from '../Hand';

const W = PICK.w;
const SCALE = PICK.scale;
/** The card's own size (CardFrame 'medium') and the size its small lines are set in: shown at 0.92 they still read 24 px or more. */
const CARD_W = 220;
const CARD_H = 292;
const LABEL = 27;
/** Seconds the chosen card takes to spring up (and the others to slip away) before the sheet leaves. */
const FAREWELL = 0.18;

export class SummonPickPopup extends Popup<void> {
  private readonly bag = new TweenBag();
  private readonly cards: PressCard[] = [];
  private readonly offs: Array<() => void> = [];
  private picked = false;
  /** Centre line of the cards: the lesson's sheet keeps a band over them for the pointing hand, a plain pick does not. */
  private readonly cardY: number;
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

    const { cardY, h } = pickSheet(guide);
    this.cardY = cardY;
    const panel = new Panel({ width: W, height: h, title: t('hud.pick.title'), torn: 'bottom', tape: 'pink' });
    const c = panel.content;
    // The tutorial's pick carries its lesson in the sub line: what the pick is, and which card to take.
    const sub = uiLabel(guide ? `${topicTeach('pick3')} ${t('guide.tut.pickRec')}` : t('hud.pick.sub'), { size: 26, color: guide ? Color.ink : Color.inkSoft, wrap: W - 80, lineHeight: 34 });
    sub.position.set(W / 2, PICK.subY);
    c.addChild(sub);

    options.forEach((id, i) => {
      const def = unitDef(id);
      const x = pickCardX(i, options.length);
      const card = new PressCard(CARD_W, CARD_H, () => this.choose(i), { holdLimit: HOLD_DELAY });
      card.scale.set(SCALE);
      card.position.set(x, cardY);
      // The tutorial's recommended card wears the kit's flag; the card is shown at 0.92, so its text is 27 px and still reads 24.
      const flag = guide && i === this.recommended ? { newTag: t('hud.recommend'), newFontSize: LABEL } : {};
      card.addChild(
        new CardFrame({
          rarity: def.rarity,
          size: 'medium',
          portrait: unitPortrait(id, 190),
          name: t(def.nameKey),
          ...flag,
        }),
      );
      // The class glyph and its name are one group, centred under the card whatever the name's length.
      const klass = new Container();
      const icon = drawIcon(CLASS_ICON[def.classId], 40);
      const name = uiLabel(t(classDef(def.classId).nameKey), { size: 28, anchorX: 0, align: 'left' });
      const groupW = 40 + 8 + name.width;
      icon.position.set(-groupW / 2 + 20, 0);
      name.position.set(-groupW / 2 + 48, 0);
      klass.addChild(icon, name);
      klass.position.set(0, 190);
      card.addChild(klass);
      // What two of this cat make (or what a king awakens into): the line the player is building.
      const plan = planOf(id, []);
      if (plan.result) {
        const lead = uiLabel(t(plan.kind === 'awaken' ? 'hud.plan.awaken' : 'hud.plan.merge'), { size: LABEL, color: Color.inkSoft });
        lead.position.set(0, 226);
        const next = uiLabel(t(unitDef(plan.result).nameKey), { size: LABEL });
        fitLabel(next, 232, LABEL, 0.9);
        next.position.set(0, 256);
        card.addChild(lead, next);
      }
      this.offs.push(attachTooltip(card, () => ({ title: t(def.nameKey), text: def.skillText() })));
      c.addChild(card);
      this.cards.push(card);
    });

    const tip = uiLabel(t('hud.pick.tip'), { size: 24, color: Color.inkSoft, wrap: W - 80 });
    tip.position.set(W / 2, h - 46);
    c.addChild(tip);
    this.body.addChild(panel);

    if (guide) {
      this.hand = new Hand();
      const { tip, rotation } = pickHand(this.recommended, options.length);
      // The paw comes down from above the card and its fingertip rests on the photo's top edge: its arm stays in the band under the
      // sub line, so no card's name, class or "merges into" line is ever under it (pickHand, tested).
      this.hand.place(tip.x, tip.y, rotation);
      this.hand.tap();
      this.hand.alpha = 0;
      c.addChild(this.hand);
    } else {
      this.hand = null;
    }
    this.setContentSize(W + 80, h + 100);
  }

  override onOpened(): void {
    // The hand arrives after the cards have been dealt, so it never points at an empty spot.
    const hand = this.hand;
    if (hand) {
      if (motion.reduced) hand.alpha = 1;
      else this.bag.run({ duration: 0.2, delay: 0.55, ease: Ease.cubicOut, onUpdate: (k) => (hand.alpha = k) });
    }
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

  /** True from the press until the sheet is gone: the HUD must not close it from under its own farewell. */
  get picking(): boolean {
    return this.picked;
  }

  /**
   * The press is answered before anything else happens: the chosen card springs up, the other two slip down and
   * fade, and only then the simulation is told and the sheet leaves, so the new cat's reveal plays on a clear board.
   */
  private choose(index: number): void {
    if (this.picked) return;
    this.picked = true;
    audio.play('relic_pick', { volume: 0.7 });
    haptic('medium');
    this.hand?.destroy();
    const still = motion.reduced;
    this.cards.forEach((card, i) => {
      card.setEnabled(false);
      const y0 = card.y;
      if (i === index) {
        this.bag.run({
          duration: still ? 0 : FAREWELL,
          ease: Ease.backOut,
          onUpdate: (k) => {
            card.scale.set(SCALE * (1 + 0.12 * k));
            card.y = y0 - 14 * k;
          },
        });
      } else {
        this.bag.run({
          duration: still ? 0 : FAREWELL,
          ease: Ease.cubicIn,
          onUpdate: (k) => {
            card.alpha = 1 - 0.75 * k;
            card.y = y0 + 26 * k;
          },
        });
      }
    });
    this.bag.call(still ? 0 : FAREWELL + 0.02, () => {
      const { ctx, battle } = this.env;
      const fail = ctx.command('pickSummon', () => battle.pickSummon(index));
      if (fail === null) {
        this.close();
        return;
      }
      // The pick was refused after all: the cards come back and the player chooses again.
      this.picked = false;
      for (const card of this.cards) {
        card.setEnabled(true);
        card.alpha = 1;
        card.scale.set(SCALE);
        card.y = this.cardY;
      }
    });
  }

  override destroy(options?: DestroyOptions): void {
    for (const off of this.offs.splice(0)) off();
    this.bag.killAll();
    super.destroy(options);
  }
}
