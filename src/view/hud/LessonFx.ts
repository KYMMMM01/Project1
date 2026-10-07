/**
 * The small celebrations of the lessons, all flat cut paper (no glow, no blur): a starburst that opens behind a control the
 * moment it arrives, and a "nice!" sticker with a flutter of confetti when the player has done what a lesson asked.
 * Everything is pooled; nothing allocates while it runs.
 */
import { Container, Graphics } from 'pixi.js';
import { audio } from '@/audio';
import { Color, motion, PaperLabel, paperSeed } from '@/ui';
import { Ease } from '@/core/tween';

const BURSTS = 3;
const PIECES = 14;
const BURST_LIFE = 0.7;
const CHEER_LIFE = 1.1;
const PIECE_LIFE = 1.2;
const GRAVITY = 900;
const PAPERS = [Color.coral, Color.leaf, Color.mustard, Color.teal, Color.berry] as const;

interface Burst {
  g: Graphics;
  age: number;
  size: number;
}

interface Piece {
  g: Graphics;
  vx: number;
  vy: number;
  spin: number;
  age: number;
}

/** A deterministic scatter that needs no random generator: pieces fan out evenly with a little variety per index. */
function fan(i: number, n: number): { vx: number; vy: number; spin: number } {
  const a = -Math.PI / 2 + ((i + 0.5) / n - 0.5) * 2.3;
  const speed = 330 + ((i * 53) % 7) * 34;
  return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, spin: ((i % 5) - 2) * 4.2 };
}

export class LessonFx {
  private readonly layer = new Container();
  private readonly bursts: Burst[] = [];
  private readonly pieces: Piece[] = [];
  private cheerAge = -1;
  private cheer: PaperLabel | null = null;
  private nextBurst = 0;
  private nextPiece = 0;

  constructor(parent: Container) {
    this.layer.eventMode = 'none';
    for (let i = 0; i < BURSTS; i++) {
      const g = new Graphics();
      const points: number[] = [];
      for (let k = 0; k < 20; k++) {
        const r = k % 2 === 0 ? 1 : 0.58;
        const a = (k / 20) * Math.PI * 2;
        points.push(Math.cos(a) * r, Math.sin(a) * r);
      }
      // Flat rays round an open window: the control that has arrived stays in plain sight inside it.
      g.poly(points).fill({ color: Color.mustard, alpha: 0.9 });
      g.circle(0, 0, 0.5).cut();
      g.visible = false;
      this.layer.addChild(g);
      this.bursts.push({ g, age: BURST_LIFE, size: 1 });
    }
    for (let i = 0; i < PIECES; i++) {
      const g = new Graphics();
      g.rect(-7, -4, 14, 8).fill(PAPERS[i % PAPERS.length] as number);
      g.visible = false;
      this.layer.addChild(g);
      this.pieces.push({ g, vx: 0, vy: 0, spin: 0, age: PIECE_LIFE });
    }
    parent.addChild(this.layer);
  }

  /** A paper starburst opens behind a control that has just arrived, `size` px across. */
  arrive(x: number, y: number, size: number): void {
    const b = this.bursts[this.nextBurst++ % BURSTS] as Burst;
    b.age = 0;
    b.size = size;
    b.g.position.set(x, y);
    b.g.visible = true;
    b.g.alpha = 1;
    b.g.scale.set(motion.reduced ? size * 0.55 : size * 0.2);
    audio.play('ui_tab', { volume: 0.6 });
  }

  /** A "nice!" sticker slaps down at (x, y) and confetti flutters up from it. */
  celebrate(x: number, y: number, word: string): void {
    this.cheer?.destroy({ children: true });
    const label = new PaperLabel({ text: word, size: 40, paper: Color.leaf, padX: 30, padY: 10, seed: paperSeed(), tape: 'pink' });
    label.position.set(x, y);
    label.rotation = -0.08;
    this.layer.addChild(label);
    this.cheer = label;
    this.cheerAge = 0;
    audio.play('star', { volume: 0.8 });
    if (motion.reduced) return;
    for (let i = 0; i < PIECES; i++) {
      const p = this.pieces[(this.nextPiece++) % PIECES] as Piece;
      const f = fan(i, PIECES);
      p.vx = f.vx;
      p.vy = f.vy;
      p.spin = f.spin;
      p.age = 0;
      p.g.position.set(x, y);
      p.g.visible = true;
      p.g.alpha = 1;
    }
  }

  update(dt: number): void {
    for (const b of this.bursts) {
      if (b.age >= BURST_LIFE) continue;
      b.age += dt;
      const k = Math.min(1, b.age / BURST_LIFE);
      if (b.age >= BURST_LIFE) {
        b.g.visible = false;
        continue;
      }
      if (!motion.reduced) {
        b.g.scale.set(b.size * (0.2 + 0.5 * Ease.cubicOut(Math.min(1, k * 1.6))));
        b.g.rotation = k * 0.5;
      }
      b.g.alpha = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
    }
    for (const p of this.pieces) {
      if (p.age >= PIECE_LIFE) continue;
      p.age += dt;
      if (p.age >= PIECE_LIFE) {
        p.g.visible = false;
        continue;
      }
      p.vy += GRAVITY * dt;
      p.vx *= 1 - Math.min(1, 1.6 * dt);
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.g.rotation += p.spin * dt;
      // The sheet of paper tips over as it falls.
      p.g.scale.y = Math.cos(p.age * 9 + p.spin);
      p.g.alpha = p.age < PIECE_LIFE * 0.7 ? 1 : 1 - (p.age - PIECE_LIFE * 0.7) / (PIECE_LIFE * 0.3);
    }
    if (this.cheer && this.cheerAge >= 0) {
      this.cheerAge += dt;
      const k = this.cheerAge / CHEER_LIFE;
      if (k >= 1) {
        this.cheer.destroy({ children: true });
        this.cheer = null;
        this.cheerAge = -1;
      } else if (!motion.reduced) {
        // Slapped down: it lands a little big, settles at once, then lifts off and fades.
        const land = Math.min(1, this.cheerAge / 0.16);
        this.cheer.scale.set(1 + 0.45 * (1 - Ease.cubicOut(land)));
        this.cheer.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        this.cheer.y -= 14 * dt;
      } else {
        this.cheer.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      }
    }
  }

  destroy(): void {
    this.layer.destroy({ children: true });
    this.cheer = null;
  }
}
