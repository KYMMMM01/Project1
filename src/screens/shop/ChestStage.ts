import { Container, Graphics, Sprite, type DestroyOptions, type Texture } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { mixColor } from '@/core/math';
import { Ease } from '@/core/tween';
import type { ChestKind, ChestRarity } from '@/meta/types';
import { Color, motion, paperSeed, paperShape, Rarity, rarityName, TweenBag, uiLabel } from '@/ui';
import { chestArt } from './art';
import type { ChestPose } from './chestPose';
import { chestKey } from './keys';
import { countPill } from './paperBits';

/** Edge of the square a chest is fitted into. */
export const CHEST_SIZE = 330;

/** Where the cards leave the open chest: this share of its picture's height above the foot. */
const OPENING = 0.62;
/** The tag is tied this far along the chest's width and up its height (any picture has a corner there). */
const TIE_X = 0.26;
const TIE_Y = 0.3;

/** The two colours of everything that leaks and bursts out of a chest: they tell the best rarity inside from the first frame to the last. */
export function tellColors(best: ChestRarity): { core: number; edge: number } {
  const r = Rarity[best];
  // Light is pale: paper white tinted with the rarity, so it reads as light on the wooden floor and not as a grey stain of the rarity's own colour.
  return best === 'common' ? { core: Color.paperLight, edge: r.light } : { core: mixColor(Color.paperLight, r.light, 0.55), edge: r.light };
}

function sprite(texture: Texture, scale: number): Sprite {
  const s = new Sprite(texture);
  s.anchor.set(0.5, 1);
  s.scale.set(scale);
  return s;
}

/** A flat paper tag hanging from a string: the best rarity in words, so colour is never the only cue. Origin = where the string is tied. */
function rarityTag(best: ChestRarity): Container {
  const r = Rarity[best];
  const label = uiLabel(rarityName(best), { size: 24, color: Color.inkDeep });
  const w = Math.max(92, Math.ceil(label.width) + 34);
  const h = 48;
  const c = new Container();
  const string = new Graphics();
  string.moveTo(0, 0).lineTo(0, 22).stroke({ width: 3, color: Color.kraftDark, cap: 'round' });
  const paper = paperShape({ w, h, radius: 10, fill: r.color, edge: r.dark, shadow: 4, grain: false, seed: paperSeed() });
  paper.position.set(0, 22 + h / 2);
  const hole = new Graphics().circle(0, 22 + 9, 4).fill(Color.paperLight);
  label.position.set(0, 22 + h / 2 + 4);
  c.addChild(string, paper, hole, label);
  return c;
}

/**
 * The chest of a reveal, whole from the first frame to the last: its picture is never cut or covered, so any picture works. It
 * shows the closed picture, flicks to the `_ajar` one for a few frames at the top of a hop when that exists, and swaps to the open
 * one at the pop (without it the closed chest just jumps). A paper tag with the best rarity's name hangs from a corner of it; a pile's
 * count sits on the top corner. Origin = the middle of the chest's foot on the floor; the rig squashes and tilts about it.
 */
export class ChestStage extends Container {
  /** Where cards leave the chest after the pop, relative to the origin. */
  readonly opening = { x: 0, y: 0 };
  /** Half the closed chest's height: lifting the origin by this much puts the chest's middle on a given spot. */
  readonly halfH: number;
  /** Width of the closed picture. */
  readonly bodyW: number;
  private readonly bag = new TweenBag();
  private readonly shadow = new Graphics();
  private readonly rig = new Container();
  private readonly closed: Container;
  private readonly ajar: Sprite | null;
  private readonly openArt: Sprite | null;
  private readonly tag: Container;
  private readonly pill: Container | null;
  private opened = false;

  constructor(kind: ChestKind, best: ChestRarity, count: number) {
    super();
    const key = chestKey(kind);
    let height = CHEST_SIZE;
    let width = CHEST_SIZE * 0.9;
    if (hasTex(key)) {
      const t = tex(key);
      const s = CHEST_SIZE / Math.max(t.width, t.height);
      this.closed = sprite(t, s);
      height = t.height * s;
      width = t.width * s;
    } else {
      // No picture at all (a test, or an art file that failed to load): the drawn icon.
      const art = chestArt(kind, CHEST_SIZE);
      art.position.y = -CHEST_SIZE / 2;
      this.closed = art;
    }
    // The other two pictures are drawn as wide as the closed one, so a swap never makes the chest jump sideways.
    const alike = (suffix: string): Sprite | null => {
      const k = key + suffix;
      if (!hasTex(k)) return null;
      const t = tex(k);
      const s = sprite(t, width / Math.max(1, t.width));
      s.visible = false;
      return s;
    };
    this.ajar = alike('_ajar');
    this.openArt = alike('_open');
    this.halfH = height / 2;
    this.bodyW = width;
    this.opening.y = -(this.openArt ? this.openArt.height : height) * OPENING;

    this.shadow.ellipse(0, 0, CHEST_SIZE * 0.44, 28).fill({ color: Color.shadow, alpha: 0.24 });

    this.tag = rarityTag(best);
    this.tag.position.set(width * TIE_X, -height * TIE_Y);
    this.rig.addChild(this.closed);
    if (this.ajar) this.rig.addChild(this.ajar);
    if (this.openArt) this.rig.addChild(this.openArt);
    this.rig.addChild(this.tag);
    if (count > 1) {
      this.pill = countPill('x' + count);
      this.pill.position.set(width * 0.4, -height + 30);
      this.rig.addChild(this.pill);
    } else {
      this.pill = null;
    }
    this.addChild(this.shadow, this.rig);
  }

  /** Put the chest in a pose: the rig squashes about the foot, the shadow shrinks with the height. */
  apply(p: ChestPose): void {
    this.rig.position.set(p.x, p.y);
    this.rig.rotation = p.rot;
    this.rig.scale.set(p.sx, p.sy);
    const lift = Math.min(1, Math.max(0, -p.y / 600));
    this.shadow.scale.set(1 - 0.55 * lift, 1 - 0.4 * lift);
    this.shadow.alpha = 1 - 0.5 * lift;
    if (this.opened) return;
    const flick = p.ajar && this.ajar !== null;
    this.closed.visible = !flick;
    if (this.ajar) this.ajar.visible = flick;
    this.tag.rotation = p.tag;
  }

  /** The lid is open: the open picture takes over (without one the closed chest stays) and the tag drops off. */
  open(): void {
    if (this.opened) return;
    this.opened = true;
    if (this.ajar) this.ajar.visible = false;
    if (this.openArt) {
      this.closed.visible = false;
      this.openArt.visible = true;
      if (this.pill) this.pill.y = -this.openArt.height + 30;
    } else {
      this.closed.visible = true;
    }
    this.tag.rotation = 0;
    if (motion.reduced) {
      this.tag.visible = false;
      return;
    }
    const { x, y } = this.tag;
    this.bag.run({
      duration: 0.5,
      ease: Ease.cubicIn,
      onUpdate: (k) => {
        this.tag.position.set(x, y + 90 * k);
        this.tag.rotation = 2.4 * k;
        this.tag.alpha = 1 - k;
      },
      onComplete: () => {
        this.tag.visible = false;
      },
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }
}
