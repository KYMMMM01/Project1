import { Rectangle, Sprite } from 'pixi.js';
import { Scene, scenes } from '@/core/scene';
import { game } from '@/core/game';
import { hasTex, loadImages, tex } from '@/core/assets';
import { t } from '@/core/i18n';
import { audio } from '@/audio';
import { PaperLabel } from '@/ui';
import { HomeFloor } from '@/screens/shell/HomeFloor';
import { Logo } from '@/screens/shell/Logo';
import '@/screens/shell/strings';

const LOGO_W = 600;

/**
 * Loads fonts and images behind the CSS splash, then hands over to the first real scene. With
 * `title` the hand-over goes through the title moment: the key art with the logo on its calm top third.
 */
export class BootScene extends Scene {
  private art: Sprite | null = null;
  private logo: Logo | null = null;
  private floor: HomeFloor | null = null;
  private ready: PaperLabel | null = null;

  /**
   * @param next Scene to open once loading finishes. Without it a "ready" card is shown.
   * @param ready Services still starting (platform, meta, settings): the CSS splash stays until it settles and the scene is up.
   * @param onShown Fires once the first scene is on screen and the splash is gone.
   * @param titleMs Show the title moment (key art and logo) for at least this long (a tap skips it) before `next`; 0 = none.
   */
  constructor(
    private readonly next?: () => Scene,
    private readonly services?: Promise<void>,
    private readonly onShown?: () => void,
    private readonly titleMs = 0,
  ) {
    super();
  }

  override async enter(): Promise<void> {
    const bar = document.getElementById('boot-bar');
    const setBar = (p: number) => {
      if (bar) bar.style.width = Math.round(p * 100) + '%';
    };
    const hideSplash = () => document.getElementById('boot')?.classList.add('hide');
    const { next, services, onShown } = this;
    setBar(0.05);
    audio.init();
    await Promise.all([
      document.fonts.load('32px GameLatin', 'Aa0'),
      document.fonts.load('32px GameKR', '가'),
    ]).catch(() => undefined);
    setBar(0.2);
    await loadImages((p) => setBar(0.2 + p * 0.75));

    await services;
    setBar(1);
    if (next && this.titleMs > 0) {
      // Built only now: the saved language is known once the services are up, and the logo is drawn in it.
      this.showTitle();
      hideSplash();
      await this.hold();
    }

    if (next) {
      // The real boot keeps the splash up until the first scene is in place, so nothing half-built is ever seen.
      if (!services) hideSplash();
      // The scene manager is still mid-transition while enter() runs, so hand over once it is idle.
      const tryGo = () => {
        if (scenes.transitioning) {
          setTimeout(tryGo, 16);
          return;
        }
        void scenes.goto(next, services ? 'none' : 'fade').then(() => {
          if (services && this.titleMs <= 0) hideSplash();
          onShown?.();
        });
      };
      setTimeout(tryGo, 0);
      return;
    }

    hideSplash();
    this.showReady();
  }

  override resize(): void {
    this.place();
  }

  /** The key art over the whole screen with the logo dropping onto its calm top third. */
  private showTitle(): void {
    if (hasTex('keyart_title')) {
      this.art = new Sprite(tex('keyart_title'));
      this.art.anchor.set(0.5);
      this.addChild(this.art);
    } else {
      this.floor = new HomeFloor();
      this.addChild(this.floor);
    }
    this.logo = new Logo(LOGO_W);
    this.addChild(this.logo);
    this.place();
    this.logo.play(0.1);
  }

  /** A tap skips the rest of the title moment. */
  private hold(): Promise<void> {
    return new Promise<void>((resolve) => {
      const finish = (): void => {
        clearTimeout(timer);
        this.off('pointerdown', finish);
        resolve();
      };
      const timer = setTimeout(finish, this.titleMs);
      this.eventMode = 'static';
      this.hitArea = new Rectangle(0, 0, game.w, game.h);
      this.on('pointerdown', finish);
    });
  }

  /** The card shown when no scene follows: the logo on the floor. */
  private showReady(): void {
    this.floor = new HomeFloor();
    this.logo = new Logo(LOGO_W);
    this.ready = new PaperLabel({ text: t('shell.logo.ready'), size: 36, paper: 'primary', padX: 40, padY: 12 });
    this.addChild(this.floor, this.logo, this.ready);
    this.place();
    this.logo.play();
  }

  private place(): void {
    const { w, h } = game;
    if (this.art) {
      this.art.scale.set(Math.max(w / this.art.texture.width, h / this.art.texture.height));
      this.art.position.set(w / 2, h / 2);
    }
    this.floor?.resize(w, h);
    if (this.logo) this.logo.position.set(w / 2, this.art ? Math.max(game.safeTop + 150, h * 0.17) : h * 0.4);
    this.ready?.position.set(w / 2, h * 0.4 + 160);
    if (this.eventMode === 'static') this.hitArea = new Rectangle(0, 0, w, h);
  }
}
