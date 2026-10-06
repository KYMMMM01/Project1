/**
 * The chapter as a print: a crop of the chapter's picture inside a cream photo border, taped down by
 * its top edge, and the chapter boss as a sticker. Shared by the chapter card and the pre-run page.
 */
import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { CHAPTERS, type ChapterInfo } from '@/game';
import { Color, cacheStatic, drawIcon, drawPaper, paperSeed, tapeStrip, type TapeName } from '@/ui';
import { coverCrop } from '../shell/layoutMath';

const BORDER = 10;
/**
 * Where each kind of picture is most worth showing, as the share of its spare height above the crop:
 * the key art's cats sit mid-picture, while a chapter background keeps its furniture along the top
 * edge and leaves the middle as bare floor.
 */
const FOCUS = { keyArt: 0.5, background: 0.02 };

const crops = new Map<string, Texture>();

export function chapterInfo(chapter: number): ChapterInfo {
  return CHAPTERS[Math.min(CHAPTERS.length, Math.max(1, Math.round(chapter))) - 1] ?? (CHAPTERS[0] as ChapterInfo);
}

/** Chapter 1 is shown with the key art; the others with their own background. */
function picture(chapter: number): { key: string; focus: number } {
  return chapter === 1 && hasTex('keyart_title')
    ? { key: 'keyart_title', focus: FOCUS.keyArt }
    : { key: chapterInfo(chapter).background, focus: FOCUS.background };
}

/** The picture cut to the photo's shape; the texture shares the picture's pixels, so a cached crop costs nothing. */
function cropTexture(key: string, focus: number, w: number, h: number): Texture | null {
  if (!hasTex(key)) return null;
  const id = `${key}|${w}|${h}`;
  let crop = crops.get(id);
  if (!crop) {
    const base = tex(key);
    const c = coverCrop(base.width, base.height, w, h, focus);
    crop = new Texture({ source: base.source, frame: new Rectangle(base.frame.x + c.x, base.frame.y + c.y, c.w, c.h) });
    crops.set(id, crop);
  }
  return crop;
}

export interface ChapterPhotoOpts {
  /** Size of the whole print, border included. */
  w: number;
  h: number;
  chapter: number;
  /** Piece of tape across the top edge. */
  tape?: TapeName;
  /** Tilt in radians; a print lying on a page is never quite straight. */
  tilt?: number;
}

/** Origin = top-left of the print's unrotated frame. */
export class ChapterPhoto extends Container {
  constructor(opts: ChapterPhotoOpts) {
    super();
    const { w, h } = opts;
    const print = new Container();
    print.pivot.set(w / 2, h / 2);
    print.position.set(w / 2, h / 2);
    print.rotation = opts.tilt ?? 0;

    const paper = new Graphics();
    drawPaper(paper, 0, 0, { w, h, radius: 10, fill: Color.paperLight, edge: Color.kraftDark, wobble: 0.5, seed: paperSeed(), grain: false });
    cacheStatic(paper);
    print.addChild(paper);

    const { key, focus } = picture(opts.chapter);
    const crop = cropTexture(key, focus, w - BORDER * 2, h - BORDER * 2);
    if (crop) {
      const photo = new Sprite(crop);
      photo.position.set(BORDER, BORDER);
      photo.width = w - BORDER * 2;
      photo.height = h - BORDER * 2;
      print.addChild(photo);
    }
    if (opts.tape) {
      const tape = tapeStrip({ name: opts.tape, pattern: 'dots', w: 112, h: 32, angle: -3, seed: w + h });
      tape.position.set(w / 2, 2);
      print.addChild(tape);
    }
    this.addChild(print);
  }
}

/**
 * The chapter boss as a sticker lying on the page: its own white border, a flat shadow under it, a
 * slight tilt. Origin = bottom centre; it is scaled to fit `boxW x boxH`, whatever its proportions.
 * `hidden` turns it into a flat silhouette (a chapter that is still locked).
 */
export function bossSticker(chapter: number, boxW: number, boxH: number, hidden: boolean): Container {
  const root = new Container();
  const id = chapterInfo(chapter).boss;
  if (hasTex(id)) {
    const texture = tex(id);
    const scale = Math.min(boxW / texture.width, boxH / texture.height);
    const shadow = new Sprite(texture);
    shadow.anchor.set(0.5, 1);
    shadow.scale.set(scale);
    shadow.tint = Color.shadow;
    shadow.alpha = 0.22;
    shadow.y = 7;
    const sticker = new Sprite(texture);
    sticker.anchor.set(0.5, 1);
    sticker.scale.set(scale);
    if (hidden) sticker.tint = Color.inkSoft;
    root.addChild(shadow, sticker);
  } else {
    const skull = drawIcon('skull', Math.min(boxW, boxH) * 0.7);
    skull.y = -Math.min(boxW, boxH) * 0.4;
    root.addChild(skull);
  }
  root.rotation = 0.06;
  return root;
}
