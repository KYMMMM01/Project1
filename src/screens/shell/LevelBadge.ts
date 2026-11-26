import { Container, Graphics, Sprite, type DestroyOptions, type Text } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { t } from '@/core/i18n';
import { unitClass, type ClassId, type UnitId } from '@/game';
import { COSMETIC_DEFAULTS, cosmetic } from '@/meta/data/catalog';
import { Color, TweenBag, cacheStatic, drawPaper, paperSeed, punch, uiLabel } from '@/ui';
import { BAND_CY, BAND_H, FRAME_BOX_H, FRAME_BOX_W, FRAME_D, ICON_D } from './layoutMath';

/** The cat a cosmetic icon id shows (the default icon's cat for an id the catalogue does not know). */
function iconUnit(id: string): UnitId {
  const s = (cosmetic(id) ?? cosmetic(COSMETIC_DEFAULTS.icon))?.source;
  return s?.type === 'unit' ? s.unit : 'w_paw';
}

/** The disc behind the cat, a pale tint of its class's clothes (red warriors, green rangers, blue mages, yellow tricksters), as approved on the 2nd sample sheet. */
const BACKDROP: Record<ClassId, number> = { warrior: 0xf8dcd4, ranger: 0xe1efd6, mage: 0xdbe6f7, trickster: 0xfbefcc };

/** A drawn frame's hole is this many pixels across in its file, whatever the file's size (tools/make_cosmetics.py). */
const FRAME_HOLE_PX = 197;

/**
 * A cat's face in a round window, on its class's disc, with a frame round it: the paper ring by default, else the frame's
 * picture. A picture fits the FRAME_BOX_W x FRAME_BOX_H box; one with big decorations has a smaller hole, and the cat shrinks to
 * it, so nothing reaches the screen's top or the currency pills. Origin = centre.
 */
export class Avatar extends Container {
  private readonly ring = new Graphics();
  private readonly backdrop = new Graphics();
  private readonly face = new Sprite();
  private readonly window = new Graphics();
  private readonly art = new Sprite();
  private iconD = ICON_D;
  private backdropColor: number = BACKDROP.warrior;

  constructor() {
    super();
    drawPaper(this.ring, -FRAME_D / 2, -FRAME_D / 2, { w: FRAME_D, h: FRAME_D, kind: 'circle', fill: Color.kraft, edge: Color.kraftDark, grain: false, shadow: 3, seed: paperSeed() });
    cacheStatic(this.ring);
    this.face.anchor.set(0.5);
    this.face.mask = this.window;
    this.art.anchor.set(0.5);
    this.art.visible = false;
    this.addChild(this.ring, this.backdrop, this.face, this.window, this.art);
    this.fit();
  }

  setIcon(id: string): void {
    const unit = iconUnit(id);
    this.face.texture = tex('avatar_' + unit);
    this.backdropColor = BACKDROP[unitClass(unit)];
    this.fit();
  }

  /** The default (or an id with no picture) is the paper ring. */
  setFrame(id: string): void {
    const drawn = id !== COSMETIC_DEFAULTS.frame && hasTex(id);
    this.ring.visible = !drawn;
    this.art.visible = drawn;
    if (drawn) {
      const t = tex(id);
      this.art.texture = t;
      const w = t.source.pixelWidth;
      const h = t.source.pixelHeight;
      this.iconD = Math.min(ICON_D, (FRAME_BOX_W * FRAME_HOLE_PX) / w, (FRAME_BOX_H * FRAME_HOLE_PX) / h);
      this.art.width = (w * this.iconD) / FRAME_HOLE_PX;
      this.art.height = (h * this.iconD) / FRAME_HOLE_PX;
    } else this.iconD = ICON_D;
    this.fit();
  }

  /** Leave the hole empty, so only the frame shows (the shop's frame previews). */
  hideFace(): void {
    this.backdrop.visible = false;
    this.face.visible = false;
  }

  /** Size the window, the disc behind the cat and the cat to the current hole. */
  private fit(): void {
    const r = this.iconD / 2;
    this.window.clear().circle(0, 0, r).fill(0xffffff);
    this.backdrop.clear().circle(0, 0, r + 3).fill(this.backdropColor);
    const t = this.face.texture;
    this.face.scale.set(this.iconD / Math.max(1, t.width, t.height));
  }
}

/**
 * The profile circle: the cat icon with its ring and, stuck over the icon's lower edge, the account level on a small paper band.
 * Origin = centre of the icon. The level-up sequence is the XP strip's (HomeTopBar); the band only takes the new number with a punch.
 */
export class LevelBadge extends Container {
  private readonly avatar = new Avatar();
  private readonly band = new Graphics();
  private readonly lv: Text = uiLabel('', { size: 24 });
  private readonly bag = new TweenBag();
  private level = -1;

  constructor() {
    super();
    this.lv.position.set(0, BAND_CY);
    this.band.position.set(0, BAND_CY);
    this.addChild(this.avatar, this.band, this.lv);
  }

  setIcon(id: string): void {
    this.avatar.setIcon(id);
  }

  setFrame(id: string): void {
    this.avatar.setFrame(id);
  }

  setLevel(level: number, animate = false): void {
    if (level === this.level) return;
    const first = this.level < 0;
    this.level = level;
    this.lv.text = `${t('shell.lv')} ${level}`;
    const w = Math.max(76, Math.ceil(this.lv.width) + 28);
    this.band.clear();
    drawPaper(this.band, -w / 2, -BAND_H / 2, { w, h: BAND_H, kind: 'pill', fill: Color.paperLight, edge: Color.kraftDark, grain: false, shadow: 3, seed: paperSeed() });
    if (animate && !first) punch(this.bag, this, 0.18, 0.3);
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }
}
