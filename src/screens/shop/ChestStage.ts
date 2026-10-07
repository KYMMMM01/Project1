import { Container, Graphics, Rectangle, Sprite, Texture, type DestroyOptions } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { mixColor } from '@/core/math';
import { Ease } from '@/core/tween';
import { fxTex, fxTexture } from '@/fx';
import type { ChestKind, ChestRarity } from '@/meta/types';
import { backOut, Color, motion, paperSeed, paperShape, Rarity, rarityName, TweenBag, uiLabel } from '@/ui';
import { chestArt } from './art';
import { chestKey } from './keys';
import { countPill } from './paperBits';
import type { ChestPose } from './revealPlan';

/** Edge of the square a chest is fitted into. */
export const CHEST_SIZE = 330;

/** The lid meets the body at this share of the picture's height, counted from the top (all three chests are drawn alike). */
const SEAM = 0.46;
/** The art is cut 4 px inside its texture: a sticker outline and nothing else. */
const MARGIN = 4;
/** Where the lock sits on the closed chest (share of the height from the top), and where the opening is on the open one. */
const LOCK_Y = 0.6;
const OPENING_Y = 0.3;
const BEAMS = 5;

/** The two colours of everything that leaks and bursts out of a chest: they tell the best rarity inside from the first frame to the last. */
export function tellColors(best: ChestRarity): { core: number; edge: number } {
  const r = Rarity[best];
  // Light is pale: paper white tinted with the rarity, so it reads as light on the wooden floor and not as a grey stain of the rarity's own colour.
  return best === 'common' ? { core: Color.paperLight, edge: r.light } : { core: mixColor(Color.paperLight, r.light, 0.55), edge: r.light };
}

interface Halves {
  lid: Texture;
  body: Texture;
  /** Size of the whole picture in texture px. */
  w: number;
  h: number;
  /** Rows the lid takes. */
  cut: number;
}

const halvesCache = new Map<ChestKind, Halves>();

/** The closed chest cut along its seam into the lid and the body (cached: two views of the same texture per kind), or null while its picture is missing. */
function halvesOf(kind: ChestKind): Halves | null {
  const cached = halvesCache.get(kind);
  if (cached) return cached;
  const key = chestKey(kind);
  if (!hasTex(key)) return null;
  const base = tex(key);
  const { x, y, width: w, height: h } = base.frame;
  const cut = Math.round(h * SEAM);
  const out: Halves = {
    lid: new Texture({ source: base.source, frame: new Rectangle(x, y, w, cut), label: key + '_lid' }),
    body: new Texture({ source: base.source, frame: new Rectangle(x, y + cut, w, h - cut), label: key + '_body' }),
    w,
    h,
    cut,
  };
  halvesCache.set(kind, out);
  return out;
}

function sprite(texture: Texture, scale: number): Sprite {
  const s = new Sprite(texture);
  s.anchor.set(0.5, 1);
  s.scale.set(scale);
  return s;
}

/** A flat paper tag hanging from the lock by a string: the best rarity in words, so colour is never the only cue. Origin = where the string is tied. */
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
 * The chest of a reveal, from the first frame to the pop. Closed it is the sticker cut along its seam, so the lid can stand a crack
 * open on every rattle with flat light in the gap (a lens in the best rarity's colour, beams behind the chest, a flat disc under it),
 * and a paper tag with the rarity's name hangs from the lock: the colour of all of it is fixed for the whole opening. At the pop the
 * open sticker swaps in (while it is missing, the lid is thrown off and a flat light plate fills the opening). Origin = the middle of the
 * chest's foot on the floor.
 */
export class ChestStage extends Container {
  /** Where cards leave the chest after the pop, relative to the origin. */
  readonly opening = { x: 0, y: 0 };
  /** Half the chest's height: lifting the origin by this much puts the chest's middle on a given spot. */
  readonly halfH: number;
  private readonly bag = new TweenBag();
  private readonly shadow = new Graphics();
  private readonly rig = new Container();
  private readonly halo: Sprite;
  private readonly beams = new Container();
  private readonly slit = new Graphics();
  private readonly lid: Container | null;
  private readonly body: Container;
  private readonly openSprite: Sprite | null;
  private readonly plate: Sprite;
  private readonly tag: Container;
  private readonly seamY: number;
  private readonly slitH = 10;
  private opened = false;

  constructor(kind: ChestKind, best: ChestRarity, count: number) {
    super();
    const colors = tellColors(best);
    const halves = halvesOf(kind);
    let bodyW = CHEST_SIZE * 0.9;
    let height = CHEST_SIZE;
    let lockY: number;
    let openH = CHEST_SIZE;
    this.openSprite = null;
    if (halves) {
      const s = CHEST_SIZE / Math.max(halves.w, halves.h);
      const bodyH = (halves.h - halves.cut) * s;
      height = halves.h * s;
      bodyW = (halves.w - MARGIN * 2) * s;
      this.seamY = -bodyH;
      const lid = new Container();
      lid.addChild(sprite(halves.lid, s));
      lid.position.y = this.seamY;
      this.lid = lid;
      this.body = new Container();
      this.body.addChild(sprite(halves.body, s));
      lockY = -height * (1 - LOCK_Y);
      const openKey = chestKey(kind) + '_open';
      if (hasTex(openKey)) {
        const t = tex(openKey);
        // The open picture is drawn a little differently: its body is made as wide as the closed one's so the swap does not jump.
        const os = (s * (halves.w - MARGIN * 2)) / (t.width - MARGIN * 2);
        this.openSprite = sprite(t, os);
        this.openSprite.visible = false;
        openH = t.height * os;
      }
    } else {
      // No picture at all (a test, or an art file that failed to load): the drawn icon, with the lid and the seam as one piece.
      const art = chestArt(kind, CHEST_SIZE);
      art.position.y = -CHEST_SIZE / 2;
      this.body = new Container();
      this.body.addChild(art);
      this.lid = null;
      this.seamY = -CHEST_SIZE * (1 - SEAM);
      lockY = -CHEST_SIZE * (1 - LOCK_Y);
    }
    this.halfH = height / 2;
    this.opening.y = this.openSprite ? -openH * (1 - OPENING_Y) : this.seamY - 10;

    this.shadow.ellipse(0, 0, CHEST_SIZE * 0.44, 28).fill({ color: Color.shadow, alpha: 0.24 });

    this.halo = new Sprite(fxTexture('disc'));
    this.halo.anchor.set(0.5);
    this.halo.tint = colors.edge;
    this.halo.position.y = this.seamY;
    this.halo.alpha = 0;
    this.halo.scale.set((bodyW * 1.2) / 256);

    // Beams of flat light fanning up from the seam, behind the chest.
    const wedge = fxTex('wedge');
    for (let i = 0; i < BEAMS; i++) {
      const w = new Sprite(wedge.texture);
      w.anchor.set(wedge.ax, wedge.ay);
      w.tint = colors.core;
      const len = CHEST_SIZE * (i % 2 === 0 ? 0.78 : 0.6);
      w.scale.set(len / wedge.w, (len * 0.2) / wedge.h);
      w.rotation = -Math.PI / 2 + (i - (BEAMS - 1) / 2) * 0.34;
      this.beams.addChild(w);
    }
    this.beams.position.y = this.seamY;
    this.beams.alpha = 0;

    // A flat lens, pointed at both ends: light seeping out through the middle of the seam, not a strap round the chest.
    this.slit.ellipse(0, 0, bodyW * 0.36, this.slitH / 2).fill(colors.core);
    this.slit.position.y = this.seamY;

    this.plate = new Sprite(fxTexture('disc'));
    this.plate.anchor.set(0.5);
    this.plate.tint = colors.core;
    this.plate.scale.set((bodyW * 0.8) / 256, 72 / 256);
    this.plate.position.y = this.seamY - 8;
    this.plate.visible = false;

    this.tag = rarityTag(best);
    this.tag.position.set(bodyW * -0.02, lockY + 8);

    this.rig.addChild(this.halo, this.beams, this.body);
    this.rig.addChild(this.slit);
    if (this.lid) this.rig.addChild(this.lid);
    if (this.openSprite) this.rig.addChild(this.openSprite);
    this.rig.addChild(this.plate, this.tag);
    if (count > 1) {
      const pill = countPill('x' + count);
      pill.position.set(bodyW * 0.38, -height + 30);
      this.rig.addChild(pill);
    }
    this.addChild(this.shadow, this.rig);
  }

  /** Put the chest in a pose: the rig squashes about the foot, the shadow shrinks with the height, the seam opens by `crack`. */
  apply(p: ChestPose): void {
    this.rig.position.set(p.x, p.y);
    this.rig.rotation = p.rot;
    this.rig.scale.set(p.sx, p.sy);
    const lift = Math.min(1, Math.max(0, -p.y / 600));
    this.shadow.scale.set(1 - 0.55 * lift, 1 - 0.4 * lift);
    this.shadow.alpha = 1 - 0.5 * lift;
    if (this.opened) return;
    const gap = Math.max(0, p.crack);
    if (this.lid) this.lid.position.y = this.seamY - gap;
    this.slit.position.y = this.seamY - gap / 2;
    this.slit.scale.y = (gap + 3) / this.slitH;
    this.slit.alpha = 0.55 + 0.45 * p.light;
    this.halo.alpha = p.light * 0.3;
    this.halo.scale.set(((CHEST_SIZE * 1.08) / 256) * (0.8 + 0.5 * p.light));
    this.beams.alpha = p.light * 0.6;
    this.beams.scale.set(0.5 + 0.6 * p.light);
    this.tag.rotation = p.tag;
  }

  /** The lid flies open: the open sticker swaps in (or, without it, the lid is thrown off) and the chest gives a jolt; the leak and the tag go. */
  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.slit.visible = false;
    if (this.openSprite) {
      this.body.visible = false;
      if (this.lid) this.lid.visible = false;
      this.openSprite.visible = true;
    } else {
      this.plate.visible = true;
      if (this.lid) this.flingLid(this.lid);
    }
    this.rig.rotation = 0;
    this.rig.position.set(0, 0);
    this.rig.scale.set(1);
    this.leave(this.tag, 0, 90, 0.5);
    if (motion.reduced) {
      this.tag.visible = false;
      this.halo.alpha = 0.3;
      this.beams.alpha = 0;
      return;
    }
    this.bag.run({
      duration: 0.34,
      ease: backOut(3),
      onUpdate: (k) => {
        const j = 1.1 - 0.1 * k;
        this.rig.scale.set(j, 2 - j);
      },
      onComplete: () => this.rig.scale.set(1),
    });
    // The leak flares with the pop, then dies down to a soft disc behind the open chest.
    this.bag.run({
      duration: 0.5,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        this.beams.alpha = 0.9 * (1 - k);
        this.beams.scale.set(1.1 + 0.5 * k);
        this.halo.alpha = 0.55 - 0.25 * k;
      },
      onComplete: () => {
        this.beams.visible = false;
      },
    });
  }

  /** The chest has done its part: it sinks and fades while the cards take the place. */
  fadeOut(): void {
    if (motion.reduced) {
      this.visible = false;
      return;
    }
    const y = this.y;
    this.bag.run({
      duration: 0.4,
      ease: Ease.cubicIn,
      onUpdate: (k) => {
        this.alpha = 1 - k;
        this.y = y + 40 * k;
      },
      onComplete: () => {
        this.visible = false;
      },
    });
  }

  private flingLid(lid: Container): void {
    if (motion.reduced) {
      lid.visible = false;
      return;
    }
    const y = lid.y;
    this.bag.run({
      duration: 0.4,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        lid.y = y - 130 * k;
        lid.rotation = -0.5 * k;
        lid.alpha = 1 - k * k;
      },
      onComplete: () => {
        lid.visible = false;
      },
    });
  }

  /** `piece` drops off, spinning, and fades. */
  private leave(piece: Container, dx: number, dy: number, seconds: number): void {
    if (motion.reduced) return;
    const x = piece.x;
    const y = piece.y;
    const turn = piece.rotation;
    this.bag.run({
      duration: seconds,
      ease: Ease.cubicIn,
      onUpdate: (k) => {
        piece.position.set(x + dx * k, y + dy * k);
        piece.rotation = turn + 2.4 * k;
        piece.alpha = 1 - k;
      },
      onComplete: () => {
        piece.visible = false;
      },
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }
}
