import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { Color, TweenBag, backOut, cacheStatic, drawDashedRect, drawIcon, drawPaper, fitLabel, motion, paperSeed, tapeStrip, uiLabel } from '@/ui';

const RATIO = 0.31;

/**
 * The game's logo, drawn in code: the title (by language) on a large cream torn label with a teal cut
 * line, a strip of washi tape on one corner and a paw sticker on the other. Origin = centre.
 * `play()` drops the label on with a small overshoot and waves the paw once.
 */
export class Logo extends Container {
  private readonly bag = new TweenBag();
  private readonly plate = new Container();
  private readonly paw = new Container();

  constructor(width = 600) {
    super();
    const w = width;
    const h = Math.round(width * RATIO);
    const seed = paperSeed();

    const sheet = new Graphics();
    drawPaper(sheet, -w / 2, -h / 2, { w, h, radius: 22, fill: Color.paperLight, torn: ['left', 'right'], seed, grain: true });
    drawDashedRect(sheet, -w / 2 + 22, -h / 2 + 18, w - 44, h - 36, { radius: 16, alpha: 0.9, seed });
    cacheStatic(sheet);

    const size = Math.round(h * 0.56);
    const title = uiLabel(t('shell.logo'), { size });
    fitLabel(title, w - 150, size, 0.6);
    title.position.set(-14, 2);

    const tape = tapeStrip({ name: 'pink', pattern: 'gingham', w: Math.round(w * 0.2), h: 34, angle: -13, seed });
    tape.position.set(-w / 2 + w * 0.11, -h / 2 + 8);

    const pawShadow = drawIcon('paw', Math.round(h * 0.56));
    pawShadow.tint = Color.shadow;
    pawShadow.alpha = 0.22;
    pawShadow.position.set(0, 6);
    this.paw.addChild(pawShadow, drawIcon('paw', Math.round(h * 0.56)));
    this.paw.rotation = 0.24;
    this.paw.position.set(w / 2 - h * 0.2, -h / 2 + h * 0.08);

    this.plate.addChild(sheet, title, tape);
    this.addChild(this.plate, this.paw);
  }

  /** Drop the label onto the floor, then pop the paw sticker and tilt it twice. */
  play(delay = 0): void {
    if (motion.reduced) return;
    const plate = this.plate;
    const paw = this.paw;
    const restRot = paw.rotation;
    plate.alpha = 0;
    paw.alpha = 0;
    this.bag.run({
      duration: 0.5,
      delay,
      ease: backOut(2.2),
      onUpdate: (k) => {
        plate.alpha = Math.min(1, k * 5);
        plate.y = -70 * (1 - k);
        plate.scale.set(0.86 + 0.14 * k);
      },
      onComplete: () => {
        plate.alpha = 1;
        plate.y = 0;
        plate.scale.set(1);
      },
    });
    this.bag.run({
      duration: 0.7,
      delay: delay + 0.3,
      ease: Ease.linear,
      onUpdate: (k) => {
        paw.alpha = Math.min(1, k * 6);
        paw.scale.set(backOut(3)(Math.min(1, k * 1.6)));
        paw.rotation = restRot + Math.sin(k * Math.PI * 4) * 0.12 * (1 - k);
      },
      onComplete: () => {
        paw.alpha = 1;
        paw.scale.set(1);
        paw.rotation = restRot;
      },
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }
}
