import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import type { ChestKind } from '@/meta/types';
import { Color } from '@/ui';
import { chestArt } from './art';
import { CrackLight } from './chestLight';
import type { ChestPose } from './chestPose';
import { chestKey } from './keys';
import { countPill } from './paperBits';

/** Edge of the square a chest is fitted into. */
export const CHEST_SIZE = 330;

/** Where the cards leave the open chest, and where the light leaks out of the lid: this share of its picture's height above the foot. */
const OPENING = 0.62;

function sprite(texture: Texture, scale: number): Sprite {
  const s = new Sprite(texture);
  s.anchor.set(0.5, 1);
  s.scale.set(scale);
  return s;
}

/**
 * The chest of a reveal, whole from the first frame to the last: its picture is never cut or covered, so any picture works, and nothing
 * hangs on it that could say what is inside. It shows the closed picture, flicks to the `_ajar` one for a few frames at the top of a
 * hop when that exists, and swaps to the open one at the pop (without it the closed chest just jumps). Light in the stage's colour
 * leaks out from behind the picture on every hop; a pile's count sits on the top corner. Origin = the middle of the chest's foot on the
 * floor; the rig squashes and tilts about it.
 */
export class ChestStage extends Container {
  /** Where cards leave the chest after the pop, relative to the origin. */
  readonly opening = { x: 0, y: 0 };
  /** Half the closed chest's height: lifting the origin by this much puts the chest's middle on a given spot. */
  readonly halfH: number;
  /** Width of the closed picture. */
  readonly bodyW: number;
  private readonly shadow = new Graphics();
  private readonly rig = new Container();
  private readonly closed: Container;
  private readonly ajar: Sprite | null;
  private readonly openArt: Sprite | null;
  private readonly crack: CrackLight;
  private readonly pill: Container | null;
  private opened = false;

  constructor(kind: ChestKind, count: number) {
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

    // Behind every picture: only what lies beyond the picture's edge shows, so it fits any chest.
    this.crack = new CrackLight(CHEST_SIZE * 0.95);
    this.crack.position.set(0, this.opening.y);
    this.rig.addChild(this.crack, this.closed);
    if (this.ajar) this.rig.addChild(this.ajar);
    if (this.openArt) this.rig.addChild(this.openArt);
    if (count > 1) {
      this.pill = countPill('x' + count);
      this.pill.position.set(width * 0.4, -height + 30);
      this.rig.addChild(this.pill);
    } else {
      this.pill = null;
    }
    this.addChild(this.shadow, this.rig);
  }

  /** The stage's colour changed: the light that leaks out of the lid takes it. */
  setLight(core: number, edge: number): void {
    this.crack.setTint(core, edge);
  }

  /** Put the chest in a pose: the rig squashes about the foot, the shadow shrinks with the height. */
  apply(p: ChestPose): void {
    this.rig.position.set(p.x, p.y);
    this.rig.rotation = p.rot;
    this.rig.scale.set(p.sx, p.sy);
    const lift = Math.min(1, Math.max(0, -p.y / 260));
    this.shadow.scale.set(1 - 0.55 * lift, 1 - 0.4 * lift);
    this.shadow.alpha = 1 - 0.5 * lift;
    if (this.opened) return;
    const flick = p.ajar && this.ajar !== null;
    this.closed.visible = !flick;
    if (this.ajar) this.ajar.visible = flick;
    this.crack.setGlow(p.glow);
  }

  /** The lid is open: the open picture takes over (without one the closed chest stays) and the light behind it is put out. */
  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.crack.visible = false;
    if (this.ajar) this.ajar.visible = false;
    if (this.openArt) {
      this.closed.visible = false;
      this.openArt.visible = true;
      if (this.pill) this.pill.y = -this.openArt.height + 30;
    } else {
      this.closed.visible = true;
    }
  }
}
