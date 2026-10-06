import { Container, Sprite, Texture } from 'pixi.js';
import { tex } from '@/core/assets';
import { mixColor } from '@/core/math';
import { CHAPTERS, type ChapterInfo } from '@/game';
import { fxVignette } from '@/fx';
import { Color } from '@/ui';
import { backgroundPlacement } from '../layout';
import type { BattleLayout } from '../context';

const FALLBACK_EDGE: number = Color.woodDark;

/** A white strip that is opaque at the top and clear at the bottom; tint and flip it to make any edge gradient. */
function fadeTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    // Eased stops so the blend does not show a visible start line.
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 64);
  }
  return Texture.from(c);
}

/** Average colour of the top and bottom rows of the art, so the strips beside a short image match it. */
function edgeColors(art: Texture): { top: number; bottom: number } {
  const src = art.source.resource as CanvasImageSource | undefined;
  if (!src || art.width < 2) return { top: FALLBACK_EDGE, bottom: FALLBACK_EDGE };
  try {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { top: FALLBACK_EDGE, bottom: FALLBACK_EDGE };
    ctx.drawImage(src, 0, 0, 16, 16);
    const avg = (row: number): number => {
      const d = ctx.getImageData(0, row, 16, 1).data;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 0; i < 16; i++) {
        r += d[i * 4] as number;
        g += d[i * 4 + 1] as number;
        b += d[i * 4 + 2] as number;
      }
      return ((r / 16) << 16) | ((g / 16) << 8) | (b / 16);
    };
    return { top: avg(0), bottom: avg(15) };
  } catch {
    // A tainted or detached source cannot be read back; the plain fallback still looks right in a dark UI.
    return { top: FALLBACK_EDGE, bottom: FALLBACK_EDGE };
  }
}

/**
 * Chapter floor art behind the field. It keeps its natural width, is centred on the field, and
 * fades into a matching colour on screens taller than the art. A soft warm vignette (one stretched
 * sprite) and a warm shade at the top and bottom calm the art behind the HUD pieces and keep the
 * board's sheet the brightest thing on the floor.
 */
export class Background {
  private readonly image: Sprite;
  private readonly fillTop = new Sprite(Texture.WHITE);
  private readonly fillBottom = new Sprite(Texture.WHITE);
  private readonly blendTop: Sprite;
  private readonly blendBottom: Sprite;
  private readonly shadeTop: Sprite;
  private readonly shadeBottom: Sprite;
  private readonly vignette = new Sprite(fxVignette());
  private readonly fade: Texture;
  private readonly edges: { top: number; bottom: number };

  constructor(
    private readonly layer: Container,
    chapter: number,
  ) {
    const info = CHAPTERS[Math.max(0, Math.min(CHAPTERS.length - 1, chapter - 1))] ?? (CHAPTERS[0] as ChapterInfo);
    const art = tex(info.background);
    this.edges = edgeColors(art);
    this.fade = fadeTexture();
    this.image = new Sprite(art);
    this.blendTop = new Sprite(this.fade);
    this.blendBottom = new Sprite(this.fade);
    this.shadeTop = new Sprite(this.fade);
    this.shadeBottom = new Sprite(this.fade);
    this.fillTop.tint = this.edges.top;
    this.fillBottom.tint = this.edges.bottom;
    this.blendTop.tint = this.edges.top;
    this.blendBottom.tint = this.edges.bottom;
    this.shadeTop.tint = Color.shadow;
    this.shadeBottom.tint = Color.shadow;
    this.shadeTop.alpha = 0.34;
    this.shadeBottom.alpha = 0.4;
    this.vignette.tint = Color.shadow;
    this.vignette.alpha = 0.3;
    layer.addChild(this.fillTop, this.fillBottom, this.image, this.blendTop, this.blendBottom, this.shadeTop, this.shadeBottom, this.vignette);
  }

  resize(layout: BattleLayout): void {
    const imgH = this.image.texture.height || 1287;
    const scale = layout.w / Math.max(1, this.image.texture.width);
    this.image.scale.set(scale);
    const place = backgroundPlacement(layout, imgH * scale);
    this.image.position.set(0, place.y);
    const imgBottom = place.y + imgH * scale;

    this.fillTop.position.set(0, 0);
    this.fillTop.width = layout.w;
    this.fillTop.height = Math.max(0, place.y + 2);
    this.fillBottom.position.set(0, imgBottom - 2);
    this.fillBottom.width = layout.w;
    this.fillBottom.height = Math.max(0, layout.h - imgBottom + 2);

    // The seam blends only where the art ends inside the screen.
    this.blendTop.visible = place.gapTop > 0;
    this.blendBottom.visible = place.gapBottom > 0;
    this.blendTop.position.set(0, place.y);
    this.blendTop.width = layout.w;
    this.blendTop.height = 90;
    this.blendBottom.position.set(0, imgBottom);
    this.blendBottom.width = layout.w;
    this.blendBottom.height = -90;

    const topSpan = layout.safeTop + layout.topH + 46;
    const bottomSpan = layout.bottomH + layout.safeBottom + 46;
    this.shadeTop.position.set(0, 0);
    this.shadeTop.width = layout.w;
    this.shadeTop.height = topSpan;
    this.shadeBottom.position.set(0, layout.h);
    this.shadeBottom.width = layout.w;
    this.shadeBottom.height = -bottomSpan;
    this.vignette.width = layout.w;
    this.vignette.height = layout.h;
    // Tall screens fill their gaps with the edge colour darkened toward the HUD tone.
    this.fillTop.tint = mixColor(this.edges.top, Color.bgDeep, 0.25);
    this.fillBottom.tint = mixColor(this.edges.bottom, Color.bgDeep, 0.25);
  }

  destroy(): void {
    for (const s of [this.fillTop, this.fillBottom, this.image, this.blendTop, this.blendBottom, this.shadeTop, this.shadeBottom, this.vignette]) {
      this.layer.removeChild(s);
      s.destroy();
    }
    this.fade.destroy(true);
  }
}
