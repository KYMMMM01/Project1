import { Container, Graphics, Sprite, type DestroyOptions, type Text } from 'pixi.js';
import { tex } from '@/core/assets';
import { t } from '@/core/i18n';
import { unitClass, type ClassId, type UnitId } from '@/game';
import { COSMETIC_DEFAULTS, cosmetic } from '@/meta/data/catalog';
import { Color, TweenBag, cacheStatic, drawPaper, paperSeed, punch, uiLabel } from '@/ui';
import { BAND_CY, BAND_H, FRAME_D, ICON_D } from './layoutMath';

/** The cat a cosmetic icon id shows (the default icon's cat for an id the catalogue does not know). */
function iconUnit(id: string): UnitId {
  const s = (cosmetic(id) ?? cosmetic(COSMETIC_DEFAULTS.icon))?.source;
  return s?.type === 'unit' ? s.unit : 'w_paw';
}

/** The disc behind the cat, a pale tint of its class's clothes (red warriors, green rangers, blue mages, yellow tricksters), as approved on the 2nd sample sheet. */
const BACKDROP: Record<ClassId, number> = { warrior: 0xf8dcd4, ranger: 0xe1efd6, mage: 0xdbe6f7, trickster: 0xfbefcc };

/** A cat's face in a round window with the paper ring around it (the one border there is for now). Origin = centre. */
export class Avatar extends Container {
  private readonly face = new Sprite();
  private readonly backdrop = new Graphics();

  constructor() {
    super();
    const ring = new Graphics();
    drawPaper(ring, -FRAME_D / 2, -FRAME_D / 2, { w: FRAME_D, h: FRAME_D, kind: 'circle', fill: Color.kraft, edge: Color.kraftDark, grain: false, shadow: 3, seed: paperSeed() });
    cacheStatic(ring);
    const window = new Graphics().circle(0, 0, ICON_D / 2).fill(0xffffff);
    this.face.anchor.set(0.5);
    this.face.mask = window;
    this.addChild(ring, this.backdrop, this.face, window);
  }

  setIcon(id: string): void {
    const unit = iconUnit(id);
    const texture = tex('avatar_' + unit);
    this.face.texture = texture;
    this.face.scale.set(ICON_D / Math.max(texture.width, texture.height));
    this.backdrop.clear().circle(0, 0, ICON_D / 2 + 3).fill(BACKDROP[unitClass(unit)]);
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
