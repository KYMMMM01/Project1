import { Container, Graphics, Sprite, type Text } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { game } from '@/core/game';
import { t } from '@/core/i18n';
import { clamp, mixColor } from '@/core/math';
import { Color, drawIcon, numberText, paperSeed, paperShape, Rarity, RARITY_GOLD, rarityName, Tag, uiLabel } from '@/ui';
import { unitPortrait, wildArt } from './art';
import { stageScale } from './cardMotion';
import { unitKey } from './keys';
import { buildPlate } from './photoPlate';
import { NAME_GAP, NAME_LINE, NAME_SIZE, PLATE, rarityRank, type RevealStack } from './revealPlan';

/** The mat is this tall; the cream strip under it carries the count pill. */
const MAT_H = 112;

/** A cat as one flat paper shape in `ink`: its own picture cut out, or a plain disc when it has no picture (a wild card, a missing file). */
function silhouette(unit: RevealStack['unit'], size: number, ink: number): Container {
  const c = new Container();
  if (unit && hasTex(unitKey(unit))) {
    const t = tex(unitKey(unit));
    const s = new Sprite(t);
    s.anchor.set(0.5);
    s.scale.set(Math.min(size / Math.max(1, t.width), size / Math.max(1, t.height)));
    s.tint = ink;
    c.addChild(s);
  } else {
    c.addChild(new Graphics().circle(0, 0, size * 0.4).fill(ink));
  }
  return c;
}

/** The plate is baked for the biggest size it is shown at (alone on stage), so it is sharp there and not a soft enlargement. */
function stageResolution(): number {
  const r = game.app?.renderer.resolution ?? 1;
  return clamp(r * game.scale * stageScale(1), 1, 4);
}

/**
 * One stack of cards in the chest reveal: a paper back in the stack's rarity colour (edge, cream rim, paw and one pip per rank above
 * common, so it is told before it turns) that flips into a paper photo frame with the count on a pill at its foot and a "Wild" /
 * "Bonus" tag when it is one, and the cat's name under the frame. The frame is drawn at its natural size and scaled by the
 * layout; the name is counter-scaled so it is always `NAME_SIZE` on screen, wraps inside its cell and is never cut. The best card of a
 * good chest can first be shown veiled: the frame with the cat as one flat dark shape and nothing that says who it is, until it is
 * unveiled. Origin = centre of the frame.
 */
export class RevealCard extends Container {
  readonly back = new Container();
  readonly face = new Container();
  readonly count: ReturnType<typeof numberText>;
  private readonly caption: Text;
  private readonly art: Container;
  private readonly plain: Container[];
  private readonly shadeSize: number;
  private shade: Container | null = null;
  private ribbonArt: Graphics | null = null;
  private mark: Container | null = null;

  constructor(readonly stack: RevealStack) {
    super();
    const { w, h } = PLATE;
    const rim = Rarity[stack.rarity];
    const rank = rarityRank(stack.rarity);
    const seed = paperSeed();
    const rimLine = new Graphics().roundRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20, 14).stroke({ width: 3, color: Color.paperLight, alpha: 0.75 });
    this.back.addChild(
      paperShape({ w, h, radius: 22, fill: rim.color, edge: rim.dark, edgeWidth: 6, edgeAlpha: 1, shadow: 6, grain: false, seed }),
      rimLine,
      drawIcon('paw', w * 0.42, mixColor(rim.color, rim.dark, 0.6), { cache: false }),
    );
    if (rank > 0) {
      const pips = new Graphics();
      for (let i = 0; i < rank; i++) pips.circle((i - (rank - 1) / 2) * 18, h / 2 - 26, 6).fill(Color.paperLight);
      this.back.addChild(pips);
    }

    const plate = buildPlate({ w, h, matH: MAT_H, rarity: stack.rarity, tier: rank });
    plate.base.cacheAsTexture({ resolution: stageResolution(), antialias: true });
    const win = plate.win;
    const unit = stack.unit;
    this.shadeSize = Math.min(win.w, win.h) - 4;
    const art = unit ? unitPortrait(unit, stack.rarity, this.shadeSize) : wildArt(stack.rarity, 100);
    art.position.set(win.x + win.w / 2, win.y + win.h / 2 + 2);
    this.art = art;
    this.face.addChild(plate.base, art, plate.over);

    // What says who the card is (the "Wild" / "Bonus" tag, the count, the name) is hidden while it is veiled.
    this.plain = [this.art];
    const tagText = stack.bonus ? t('reveal.bonus') : unit ? '' : t('reveal.wild');
    if (tagText) {
      const tag = new Tag({ text: tagText, style: stack.bonus ? 'success' : 'info', shape: 'pill', fontSize: 24, tilt: -0.08 });
      tag.position.set(w / 2 - tag.uiBox.w / 2 - 2, -h / 2 + 20);
      this.face.addChild(tag);
      this.plain.push(tag);
    }

    // The count hangs at the foot of the frame, clear of the picture's top corners where the tag and tape sit.
    this.count = numberText(30, Color.ink, 'x1');
    const pill = paperShape({ w: 88, h: 38, kind: 'pill', fill: Color.paperLight, edge: Color.kraftDark, shadow: 3, grain: false, seed: seed + 5 });
    pill.position.set(0, h / 2 - 19);
    this.count.position.copyFrom(pill.position);
    this.face.addChild(pill, this.count);
    this.plain.push(pill, this.count);

    // The name sits on the wooden floor, so it is light text with a brown stroke.
    const label = unit ? t(`unit.${unit}.name`) : `${rarityName(stack.rarity)} ${t('reveal.wild')}`;
    this.caption = uiLabel(label, { size: NAME_SIZE, onArt: true, align: 'center', lineHeight: NAME_LINE, anchorY: 0, wrap: PLATE.w });
    this.face.addChild(this.caption);
    this.plain.push(this.caption);
    this.face.visible = false;
    this.addChild(this.back, this.face);
  }

  /** Lines the name takes when its cell is `cellW` wide. */
  nameLines(cellW: number): number {
    this.caption.style.wordWrapWidth = cellW - 4;
    return Math.max(1, Math.round(this.caption.height / this.caption.scale.y / NAME_LINE));
  }

  /** Scale the frame; the name keeps its size on screen and stays under the frame, wrapped as `layout` last said. */
  fitTo(scale: number): void {
    this.scale.set(scale);
    this.caption.scale.set(1 / scale);
    this.caption.position.set(0, PLATE.h / 2 + NAME_GAP / scale);
    if (this.ribbonArt) {
      this.ribbonArt.scale.set(1 / scale);
      this.ribbonArt.position.set(0, this.caption.y - 6 / scale);
    }
  }

  /** Apply a plate scale and the cell width the name may wrap in. */
  layout(scale: number, cellW: number): void {
    this.caption.style.wordWrapWidth = cellW - 4;
    this.fitTo(scale);
  }

  /** Turn the card over. Veiled, the frame shows the cat as one dark paper shape and nothing else that says who it is. */
  showFace(veiled = false): void {
    this.back.visible = false;
    this.face.visible = true;
    if (veiled) this.veil();
  }

  private veil(): void {
    if (!this.shade) {
      const ink = mixColor(Color.inkDeep, Rarity[this.stack.rarity].dark, 0.3);
      this.shade = silhouette(this.stack.unit, this.shadeSize, ink);
      this.shade.position.copyFrom(this.art.position);
      this.face.addChildAt(this.shade, this.face.getChildIndex(this.art) + 1);
    }
    for (const c of this.plain) c.visible = false;
    this.shade.visible = true;
  }

  /** The silhouette peels away: the real portrait, the count and the name are there. */
  unveil(): void {
    if (!this.shade) return;
    for (const c of this.plain) c.visible = true;
    this.shade.destroy({ children: true });
    this.shade = null;
  }

  /** The name goes on a paper ribbon in the rank's colour (swallowtail ends, drawn behind the name at its size on screen). */
  ribbon(): void {
    if (this.ribbonArt) return;
    const rim = Rarity[this.stack.rarity];
    const w = Math.max(this.caption.width / this.caption.scale.x, 60) + 44;
    const lines = Math.max(1, Math.round(this.caption.height / this.caption.scale.y / NAME_LINE));
    const h = lines * NAME_LINE + 14;
    const g = new Graphics();
    const tail = 16;
    g.poly([-w / 2, 0, -w / 2 - tail, h / 2, -w / 2, h]).fill(rim.dark);
    g.poly([w / 2, 0, w / 2 + tail, h / 2, w / 2, h]).fill(rim.dark);
    g.rect(-w / 2, 0, w, h).fill(rim.color);
    g.rect(-w / 2, 0, w, h).stroke({ width: 3, color: rim.dark, alignment: 0 });
    this.ribbonArt = g;
    this.fitTo(this.scale.x);
    this.face.addChildAt(g, this.face.getChildIndex(this.caption));
  }

  /** A gold star on a cream disc stuck on the frame's corner: the best card of the chest in the summary. Returns the sticker to animate. */
  markBest(): Container {
    if (this.mark) return this.mark;
    const { w, h } = PLATE;
    const disc = new Graphics().circle(0, 0, 25).fill(Color.paperLight).circle(0, 0, 25).stroke({ width: 3, color: RARITY_GOLD });
    const star = drawIcon('star', 34, RARITY_GOLD, { cache: false });
    this.mark = new Container();
    this.mark.addChild(disc, star);
    this.mark.position.set(w / 2 - 8, -h / 2 + 8);
    this.face.addChild(this.mark);
    return this.mark;
  }
}
