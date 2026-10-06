import { Container, Graphics } from 'pixi.js';
import { game } from './game';
import { Ease, Tweener, uiTweens } from './tween';

/**
 * A full-screen state of the game (boot, home, battle...). Subclasses build their display tree in
 * the constructor or `enter`, lay it out in `resize`, and advance it in `update`.
 */
export abstract class Scene extends Container {
  /** Scene-local clock: killed automatically on exit, and may be paused/slowed independently. */
  readonly tweens = new Tweener();

  /** Called once after the scene is on stage, before the transition reveals it. */
  enter(): void | Promise<void> {}
  /** Called once when the scene is leaving. Release listeners, timers and pooled objects here. */
  exit(): void {}
  update(_dt: number): void {}
  /** Called on entry and whenever the design-space height changes. */
  resize(_w: number, _h: number): void {}
}

export type TransitionKind = 'none' | 'fade' | 'iris';

export class SceneManager {
  current: Scene | null = null;
  private busy = false;
  private readonly cover = new Graphics();
  private irisR = 0;
  private irisActive = false;

  init(): void {
    game.transitionLayer.addChild(this.cover);
    this.cover.visible = false;
    this.cover.eventMode = 'static'; // swallow taps mid-transition
    game.onUpdate((dt) => {
      const s = this.current;
      if (!s) return;
      s.tweens.update(dt);
      s.update(dt);
    });
    game.events.on('resize', ({ w, h }) => {
      this.current?.resize(w, h);
      if (this.cover.visible) this.drawCover();
    });
  }

  get transitioning(): boolean {
    return this.busy;
  }

  /** Swap scenes. Ignored (returns false) while another transition is still running. */
  async goto(make: () => Scene, kind: TransitionKind = 'fade'): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    try {
      if (this.current && kind !== 'none') await this.close(kind);
      const prev = this.current;
      if (prev) {
        prev.exit();
        prev.tweens.killAll();
        game.sceneLayer.removeChild(prev);
        prev.destroy({ children: true });
      }
      const next = make();
      this.current = next;
      game.sceneLayer.addChild(next);
      next.resize(game.w, game.h);
      await next.enter();
      if (kind !== 'none') await this.open(kind);
    } finally {
      this.busy = false;
    }
    return true;
  }

  private drawCover(): void {
    const g = this.cover;
    g.clear();
    g.rect(0, 0, game.w, game.h).fill(0x120b24);
    if (this.irisActive && this.irisR > 0.5) {
      g.circle(game.w / 2, game.h / 2, this.irisR).cut();
    }
  }

  private maxIris(): number {
    return Math.hypot(game.w, game.h) / 2 + 8;
  }

  private async close(kind: TransitionKind): Promise<void> {
    const g = this.cover;
    g.visible = true;
    if (kind === 'iris') {
      this.irisActive = true;
      g.alpha = 1;
      const max = this.maxIris();
      await uiTweens.run({
        duration: 0.38,
        ease: Ease.cubicIn,
        onUpdate: (k) => {
          this.irisR = max * (1 - k);
          this.drawCover();
        },
      }).finished;
      this.irisR = 0;
      this.drawCover();
    } else {
      this.irisActive = false;
      this.drawCover();
      g.alpha = 0;
      await uiTweens.to(g, { alpha: 1 }, { duration: 0.2, ease: Ease.quadIn }).finished;
    }
  }

  private async open(kind: TransitionKind): Promise<void> {
    const g = this.cover;
    if (kind === 'iris') {
      this.irisActive = true;
      const max = this.maxIris();
      await uiTweens.run({
        duration: 0.45,
        ease: Ease.cubicOut,
        onUpdate: (k) => {
          this.irisR = max * k;
          this.drawCover();
        },
      }).finished;
    } else {
      await uiTweens.to(g, { alpha: 0 }, { duration: 0.25, ease: Ease.quadOut }).finished;
    }
    g.visible = false;
    this.irisActive = false;
  }
}

export const scenes = new SceneManager();
