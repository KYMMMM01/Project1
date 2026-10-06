import { Graphics } from 'pixi.js';
import { Scene, scenes } from '@/core/scene';
import { game } from '@/core/game';
import { loadImages } from '@/core/assets';
import { Ease } from '@/core/tween';
import { audio } from '@/audio';
import { label } from '@/ui/text';
import { Color } from '@/ui/theme';

/** Loads fonts and images behind the CSS splash, then hands over to the first real scene. */
export class BootScene extends Scene {
  /** @param next Scene to open once loading finishes. Without it a "ready" card is shown. */
  constructor(private readonly next?: () => Scene) {
    super();
  }

  override async enter(): Promise<void> {
    const bar = document.getElementById('boot-bar');
    const setBar = (p: number) => {
      if (bar) bar.style.width = Math.round(p * 100) + '%';
    };
    setBar(0.05);
    audio.init();
    await Promise.all([
      document.fonts.load('32px GameLatin', 'Aa0'),
      document.fonts.load('32px GameKR', '가'),
    ]).catch(() => undefined);
    setBar(0.2);
    await loadImages((p) => setBar(0.2 + p * 0.8));
    document.getElementById('boot')?.classList.add('hide');

    if (this.next) {
      const make = this.next;
      // The scene manager is still mid-transition while enter() runs, so hand over once it is idle.
      const tryGo = () => {
        if (scenes.transitioning) setTimeout(tryGo, 16);
        else void scenes.goto(make, 'fade');
      };
      setTimeout(tryGo, 0);
      return;
    }

    const g = new Graphics()
      .roundRect(-260, -90, 520, 180, 36)
      .fill(Color.panel)
      .stroke({ width: 8, color: Color.outline });
    g.position.set(game.w / 2, game.h / 2);
    const title = label('Lucky Paws', { size: 72, color: Color.primary });
    title.position.set(game.w / 2, game.h / 2 - 20);
    const sub = label('엔진 준비 완료', { size: 30 });
    sub.position.set(game.w / 2, game.h / 2 + 46);
    this.addChild(g, title, sub);
    this.tweens.to(
      title.scale,
      { x: 1.06, y: 1.06 },
      { duration: 0.8, ease: Ease.sineInOut, yoyo: true, repeat: -1 },
    );
  }
}
