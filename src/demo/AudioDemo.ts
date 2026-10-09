import { Container, Graphics, Rectangle, type FederatedPointerEvent, type FederatedWheelEvent, type Text } from 'pixi.js';
import { attackSfx, audio, audioStats, critSfx, foeDieSfx, foeHitSfx, impactSfx, SFX_IDS, type CombatCue, type MusicId, type SfxId, type StingerId } from '@/audio';
import { game } from '@/core/game';
import { ENEMY_IDS, UNIT_IDS, type EnemyId } from '@/game/api';
import { clamp, darken, lighten } from '@/core/math';
import { Scene } from '@/core/scene';
import { Ease, type Tweener } from '@/core/tween';
import { fitWidth, label } from '@/ui/text';
import { Color } from '@/ui/theme';

/**
 * ?demo=audio: tap targets for every SFX, every music track (12 of them: the chapter tracks, boss, elite, gold dungeon, result and menu tracks), intensity, stingers, the step ladder and volume. The grid has two pages:
 * "all ids" (every SFX in catalogue order) and "fight" (each cat's release and impact, each enemy's hit and death, boss deaths).
 */

const PAD = 16;
const GAP = 8;
const COLS = 4;
const CELL_H = 54;
const MUSIC: readonly MusicId[] = ['none', 'home', 'home2', 'battle', 'kitchen', 'bath', 'garden', 'clinic', 'elite', 'boss', 'gold', 'win', 'lose'];
const MUSIC_COLS = 7;
const STINGERS: readonly StingerId[] = ['victory', 'defeat', 'boss_intro', 'mythic', 'level_up', 'jackpot'];
const STEPS = 11;

/** The v1.0 battle verbs, drawn as one teal block at the end of the grid. */
const BATTLE_VERBS: readonly SfxId[] = ['laser_on', 'laser_off', 'molt', 'purr', 'awaken', 'call_wave', 'sunbeam', 'hazard_warn', 'splash', 'zap', 'weaken', 'shield_break'];

/** Button colour per sound family, so the grid reads at a glance. */
function familyColor(id: SfxId): number {
  if (BATTLE_VERBS.includes(id)) return Color.tealDark;
  if (id.startsWith('ui_') || id === 'place' || id === 'pickup') return Color.infoDark;
  if (id.startsWith('summon') || id.startsWith('merge') || id === 'upgrade' || id === 'sell') return Color.violetDark;
  if (id.startsWith('atk_') || id.startsWith('imp_')) return Color.dangerDark;
  if (id.startsWith('foe_')) return Color.mustardDark;
  if (id.startsWith('shoot') || id.startsWith('hit') || id === 'crit' || id === 'explosion' || id.startsWith('boss') || id === 'enemy_die') return Color.dangerDark;
  if (['freeze', 'stun', 'buff', 'heal'].includes(id)) return Color.mustardDark;
  if (['wave_start', 'wave_clear', 'danger_alarm', 'countdown_tick', 'whoosh', 'relic_pick'].includes(id)) return Color.successDark;
  if (id.startsWith('chest') || id.startsWith('card') || id.startsWith('reel') || id === 'jackpot' || id === 'gamble_fail') return Color.berryDark;
  return Color.primaryDark;
}

/** One tap target of the grid. */
interface Cell {
  label: string;
  color: number;
  play: () => void;
}

/** Seconds between the release of an attack and its impact when the demo plays them as a pair. */
const FLIGHT = 0.12;

class DemoButton extends Container {
  private readonly bg = new Graphics();
  private readonly flash = new Graphics();
  private readonly tx: Text;
  private baseColor: number;

  constructor(
    readonly bw: number,
    readonly bh: number,
    text: string,
    color: number,
    private readonly tweens: Tweener,
    onPress: () => void,
    size = 22,
  ) {
    super();
    this.baseColor = color;
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(0, 0, bw, bh);
    this.tx = label(text, { size });
    this.tx.position.set(bw / 2, bh / 2);
    fitWidth(this.tx, bw - 12);
    this.flash.alpha = 0;
    this.addChild(this.bg, this.flash, this.tx);
    this.draw();
    // Gameplay-style: react on pointerdown, not on release.
    this.on('pointerdown', () => {
      onPress();
      this.pulse();
    });
  }

  setText(text: string): void {
    this.tx.text = text;
    fitWidth(this.tx, this.bw - 12);
  }

  setColor(color: number): void {
    this.baseColor = color;
    this.draw();
  }

  private draw(): void {
    const { bw, bh } = this;
    this.bg.clear();
    this.bg.roundRect(0, 0, bw, bh, 14).fill(darken(this.baseColor, 0.35)).stroke({ width: 3, color: Color.outline });
    this.bg.roundRect(0, 0, bw, bh - 6, 14).fill(this.baseColor);
    this.bg.roundRect(6, 4, bw - 12, 8, 4).fill({ color: lighten(this.baseColor, 0.45), alpha: 0.5 });
    this.flash.clear();
    this.flash.roundRect(0, 0, bw, bh - 6, 14).fill(Color.white);
  }

  pulse(): void {
    this.tweens.killOf(this.flash);
    this.flash.alpha = 0.55;
    this.tweens.to(this.flash, { alpha: 0 }, { duration: 0.28, ease: Ease.quadOut });
  }
}

export default class AudioDemo extends Scene {
  private readonly bg = new Graphics();
  private readonly hud: Text;
  private readonly intensityBar = new Graphics();
  private readonly intensityText: Text;
  private readonly musicButtons: DemoButton[] = [];
  private readonly gridView = new Container();
  private readonly gridContent = new Container();
  private readonly gridMask = new Graphics();
  private readonly gridFlash = new Graphics();
  private readonly gridBg = new Graphics();
  private cells: Array<Cell | null> = [];
  private readonly modeButtons: DemoButton[] = [];
  private sfxVolText!: Text;
  private musicVolText!: Text;
  private stressButton!: DemoButton;

  private gridTop = 0;
  private gridH = 600;
  private contentH = 0;
  private scrollY = 0;
  private dragging = false;
  private dragMoved = false;
  private downY = 0;
  private downScroll = 0;

  private intensity = 0;
  private sfxVol = 1;
  private musicVol = 1;
  private muted = false;
  private stressTimer: ReturnType<typeof setInterval> | null = null;
  private stressLast = 0;
  /** 1 = a busy wave, 3 = the same wave at speed 3 (three times the sounds per real second). */
  private stressScale = 1;
  private hudTimer = 0;
  // Stress-test accumulators (seconds until the next shot of each kind).
  private nextHit = 0;
  private nextDie = 0;
  private nextShot = 0;
  private nextCoin = 0;
  private nextBoom = 0;
  private nextCrit = 0;

  constructor() {
    super();
    this.hud = label('', { size: 20, color: Color.textDim, stroke: false, align: 'center' });
    this.intensityText = label('', { size: 22 });
  }

  override enter(): void {
    audio.init();
    this.addChild(this.bg);
    const title = label('Audio Lab', { size: 44, color: Color.primary });
    title.position.set(game.w / 2, 42);
    this.hud.position.set(game.w / 2, 90);
    this.addChild(title, this.hud);

    let y = 118;
    y = this.section('MUSIC', y);
    const mw = (game.w - PAD * 2 - GAP * (MUSIC_COLS - 1)) / MUSIC_COLS;
    MUSIC.forEach((id, i) => {
      const b = new DemoButton(mw, 50, id, Color.neutralDark, this.tweens, () => this.setTrack(id), 18);
      b.position.set(PAD + (i % MUSIC_COLS) * (mw + GAP), y + Math.floor(i / MUSIC_COLS) * 58);
      this.musicButtons.push(b);
      this.addChild(b);
    });
    y += 58 * Math.ceil(MUSIC.length / MUSIC_COLS) + 6;

    // Intensity: [-]  bar  [+]
    const minus = new DemoButton(64, 52, '-', Color.infoDark, this.tweens, () => this.stepIntensity(-0.25), 34);
    const plus = new DemoButton(64, 52, '+', Color.infoDark, this.tweens, () => this.stepIntensity(0.25), 34);
    minus.position.set(PAD, y);
    plus.position.set(game.w - PAD - 64, y);
    this.intensityBar.position.set(PAD + 64 + GAP, y + 8);
    this.intensityText.position.set(game.w / 2, y + 26);
    this.addChild(minus, plus, this.intensityBar, this.intensityText);
    this.drawIntensity();
    y += 62;

    y = this.section('STINGERS', y);
    const sw = (game.w - PAD * 2 - GAP * 5) / 6;
    STINGERS.forEach((id, i) => {
      const b = new DemoButton(sw, 50, id, Color.purpleDark, this.tweens, () => audio.stinger(id), 17);
      b.position.set(PAD + i * (sw + GAP), y);
      this.addChild(b);
    });
    y += 58;

    y = this.section('playStep ladder (coin, major pentatonic)', y);
    const lw = (game.w - PAD * 2 - GAP * (STEPS - 1)) / STEPS;
    for (let i = 0; i < STEPS; i++) {
      const b = new DemoButton(lw, 50, String(i), Color.primaryDark, this.tweens, () => audio.playStep('coin', i), 22);
      b.position.set(PAD + i * (lw + GAP), y);
      this.addChild(b);
    }
    y += 58;

    y = this.section('VOLUME / UTIL', y);
    const uw = (game.w - PAD * 2 - GAP * 6) / 7;
    const util: Array<[string, () => void, number]> = [
      ['sfx -', () => this.stepVolume('sfx', -0.2), Color.infoDark],
      ['sfx +', () => this.stepVolume('sfx', 0.2), Color.infoDark],
      ['mus -', () => this.stepVolume('music', -0.2), Color.infoDark],
      ['mus +', () => this.stepVolume('music', 0.2), Color.infoDark],
      ['mute', () => this.toggleMute(), Color.dangerDark],
      ['duck', () => audio.duck(0.7, 1.2), Color.neutralDark],
      ['stress', () => this.toggleStress(), Color.successDark],
    ];
    util.forEach(([text, fn, color], i) => {
      const b = new DemoButton(uw, 50, text, color, this.tweens, fn, 18);
      b.position.set(PAD + i * (uw + GAP), y);
      if (text === 'stress') this.stressButton = b;
      this.addChild(b);
    });
    y += 54;
    this.sfxVolText = label('', { size: 18, color: Color.textDim, stroke: false });
    this.musicVolText = label('', { size: 18, color: Color.textDim, stroke: false });
    this.sfxVolText.position.set(game.w * 0.25, y + 8);
    this.musicVolText.position.set(game.w * 0.75, y + 8);
    this.addChild(this.sfxVolText, this.musicVolText);
    this.updateVolText();
    y += 26;

    const modes: Array<['all' | 'fight', string]> = [['all', 'all ids'], ['fight', 'fight: cats and enemies']];
    const mw2 = (game.w - PAD * 2 - GAP) / 2;
    modes.forEach(([mode, text], i) => {
      const b = new DemoButton(mw2, 44, text, Color.neutralDark, this.tweens, () => this.setMode(mode), 20);
      b.position.set(PAD + i * (mw2 + GAP), y);
      this.modeButtons.push(b);
      this.addChild(b);
    });
    y += 50;

    this.gridTop = y + 4;
    this.cells = this.allCells();
    this.buildGrid();
    this.initGridEvents();
    this.addChild(this.gridBg, this.gridView, this.gridMask);
    this.setMode('all');
    this.layoutGrid();
    this.refreshHud();
  }

  override exit(): void {
    this.stopStress();
    audio.music('none', 0.2);
    // Leave the engine as the demo found it. Only undo our own mute: setMuted nests, and an ad overlay may hold one too.
    if (this.muted) audio.setMuted(false);
    this.muted = false;
    audio.setIntensity(0);
    if (this.sfxVol !== 1) audio.setSfxVolume(1);
    if (this.musicVol !== 1) audio.setMusicVolume(1);
  }

  override resize(): void {
    this.bg.clear();
    this.bg.rect(0, 0, game.w, game.h).fill(Color.bg);
    this.layoutGrid();
  }

  private section(text: string, y: number): number {
    const t = label(text, { size: 17, color: Color.textDim, stroke: false, anchorX: 0 });
    t.position.set(PAD, y + 8);
    this.addChild(t);
    return y + 22;
  }

  /** Every SFX in catalogue order. */
  private allCells(): Array<Cell | null> {
    return SFX_IDS.map((id) => ({ label: id, color: familyColor(id), play: () => audio.play(id) }));
  }

  private playCue(cue: CombatCue, volume = 1): void {
    audio.play(cue.id, { volume: cue.volume * volume, pitch: cue.pitch });
  }

  /**
   * The fight page. A row per cat: the pair (release, then the impact a moment later), the release, the impact, and the impact with its
   * crit layer on top. A row per enemy: its hit then its death, the hit, the death, and three hits in a row (to hear the variants rotate).
   */
  private fightCells(): Array<Cell | null> {
    const out: Array<Cell | null> = [];
    const cat = Color.dangerDark;
    for (const u of UNIT_IDS) {
      out.push(
        {
          label: `${u} pair`,
          color: darken(cat, 0.15),
          play: () => {
            this.playCue(attackSfx(u));
            this.tweens.call(FLIGHT, () => this.playCue(impactSfx(u)));
          },
        },
        { label: 'release', color: cat, play: () => this.playCue(attackSfx(u)) },
        { label: 'impact', color: cat, play: () => this.playCue(impactSfx(u)) },
        {
          label: 'crit',
          color: Color.berryDark,
          play: () => {
            this.playCue(impactSfx(u));
            this.playCue(critSfx(u));
          },
        },
      );
    }
    const foe = Color.mustardDark;
    const hit = (id: EnemyId): void => this.playCue(foeHitSfx(id));
    for (const e of ENEMY_IDS) {
      out.push(
        {
          label: `${e} pair`,
          color: darken(foe, 0.15),
          play: () => {
            hit(e);
            this.tweens.call(0.3, () => this.playCue(foeDieSfx(e)));
          },
        },
        { label: 'hit', color: foe, play: () => hit(e) },
        { label: 'die', color: foe, play: () => this.playCue(foeDieSfx(e)) },
        {
          label: 'x3 hits',
          color: Color.berryDark,
          play: () => {
            hit(e);
            this.tweens.call(0.09, () => hit(e));
            this.tweens.call(0.18, () => hit(e));
          },
        },
      );
    }
    return out;
  }

  private setMode(mode: 'all' | 'fight'): void {
    this.cells = mode === 'all' ? this.allCells() : this.fightCells();
    this.modeButtons.forEach((b, i) => b.setColor((i === 0) === (mode === 'all') ? Color.success : Color.neutralDark));
    this.buildGrid();
    this.setScroll(0);
  }

  /** (Re)draw the grid from `cells`: backgrounds first, labels on top. */
  private buildGrid(): void {
    for (const child of this.gridContent.removeChildren()) if (child !== this.gridFlash) child.destroy();
    const cw = (game.w - PAD * 2 - GAP * (COLS - 1)) / COLS;
    const g = new Graphics();
    this.cells.forEach((cell, i) => {
      if (!cell) return;
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = col * (cw + GAP);
      const y = row * (CELL_H + GAP);
      const c = cell.color;
      g.roundRect(x, y, cw, CELL_H, 12).fill(darken(c, 0.35)).stroke({ width: 3, color: Color.outline });
      g.roundRect(x, y, cw, CELL_H - 6, 12).fill(c);
      g.roundRect(x + 6, y + 4, cw - 12, 7, 4).fill({ color: lighten(c, 0.45), alpha: 0.5 });
      const t = label(cell.label, { size: 19 });
      t.position.set(x + cw / 2, y + (CELL_H - 6) / 2);
      fitWidth(t, cw - 12);
      this.gridContent.addChild(t);
    });
    this.gridContent.addChildAt(g, 0);
    this.gridContent.addChild(this.gridFlash);
    this.contentH = Math.ceil(this.cells.length / COLS) * (CELL_H + GAP) - GAP;
    this.gridFlash.clear();
    this.gridFlash.alpha = 0;
  }

  private initGridEvents(): void {
    this.gridView.addChild(this.gridContent);
    this.gridView.eventMode = 'static';
    this.gridView.on('pointerdown', this.onDown);
    this.gridView.on('pointermove', this.onMove);
    this.gridView.on('pointerup', this.onUp);
    this.gridView.on('pointerupoutside', this.onUpOutside);
    this.gridView.on('wheel', this.onWheel);
  }

  private layoutGrid(): void {
    if (this.gridTop === 0) return;
    this.gridH = Math.max(120, game.h - this.gridTop - 10);
    this.gridView.position.set(PAD, this.gridTop);
    this.gridView.hitArea = new Rectangle(0, 0, game.w - PAD * 2, this.gridH);
    this.gridMask.clear();
    this.gridMask.rect(PAD, this.gridTop, game.w - PAD * 2, this.gridH).fill(Color.white);
    this.gridView.mask = this.gridMask;
    this.gridBg.clear();
    this.gridBg.roundRect(PAD - 6, this.gridTop - 6, game.w - PAD * 2 + 12, this.gridH + 12, 16).fill({ color: Color.bgDeep, alpha: 0.8 });
    this.setScroll(this.scrollY);
  }

  private setScroll(y: number): void {
    const min = Math.min(0, this.gridH - this.contentH);
    this.scrollY = clamp(y, min, 0);
    this.gridContent.y = this.scrollY;
  }

  private readonly onDown = (e: FederatedPointerEvent): void => {
    this.dragging = true;
    this.dragMoved = false;
    this.downY = e.global.y;
    this.downScroll = this.scrollY;
  };

  private readonly onMove = (e: FederatedPointerEvent): void => {
    if (!this.dragging) return;
    const dy = (e.global.y - this.downY) / game.scale;
    if (Math.abs(dy) > 10) this.dragMoved = true;
    if (this.dragMoved) this.setScroll(this.downScroll + dy);
  };

  private readonly onUp = (e: FederatedPointerEvent): void => {
    const wasTap = this.dragging && !this.dragMoved;
    this.dragging = false;
    if (!wasTap) return;
    const p = this.gridContent.toLocal(e.global);
    const cw = (game.w - PAD * 2 - GAP * (COLS - 1)) / COLS;
    const col = Math.floor(p.x / (cw + GAP));
    const row = Math.floor(p.y / (CELL_H + GAP));
    if (col < 0 || col >= COLS || row < 0) return;
    const inCellX = p.x - col * (cw + GAP) <= cw;
    const inCellY = p.y - row * (CELL_H + GAP) <= CELL_H;
    const cell = this.cells[row * COLS + col];
    if (!cell || !inCellX || !inCellY) return;
    cell.play();
    this.flashCell(col, row, cw);
  };

  private readonly onUpOutside = (): void => {
    this.dragging = false;
  };

  private readonly onWheel = (e: FederatedWheelEvent): void => {
    this.setScroll(this.scrollY - e.deltaY * 0.6);
  };

  private flashCell(col: number, row: number, cw: number): void {
    const f = this.gridFlash;
    this.tweens.killOf(f);
    f.clear();
    f.roundRect(col * (cw + GAP), row * (CELL_H + GAP), cw, CELL_H - 6, 12).fill(Color.white);
    f.alpha = 0.55;
    this.tweens.to(f, { alpha: 0 }, { duration: 0.28, ease: Ease.quadOut });
  }

  private setTrack(id: MusicId): void {
    audio.music(id, 0.8);
    audio.setIntensity(this.intensity);
    this.musicButtons.forEach((b, i) => b.setColor(MUSIC[i] === id ? Color.success : Color.neutralDark));
  }

  private stepIntensity(d: number): void {
    this.intensity = clamp(Math.round((this.intensity + d) * 100) / 100, 0, 1);
    audio.setIntensity(this.intensity);
    this.drawIntensity();
  }

  private drawIntensity(): void {
    const w = game.w - PAD * 2 - (64 + GAP) * 2;
    this.intensityBar.clear();
    this.intensityBar.roundRect(0, 0, w, 36, 10).fill(Color.panelDark).stroke({ width: 3, color: Color.outline });
    if (this.intensity > 0) this.intensityBar.roundRect(3, 3, (w - 6) * this.intensity, 30, 8).fill(Color.primary);
    this.intensityText.text = `battle intensity ${this.intensity.toFixed(2)}`;
  }

  private stepVolume(which: 'sfx' | 'music', d: number): void {
    if (which === 'sfx') {
      this.sfxVol = clamp(Math.round((this.sfxVol + d) * 10) / 10, 0, 1);
      audio.setSfxVolume(this.sfxVol);
    } else {
      this.musicVol = clamp(Math.round((this.musicVol + d) * 10) / 10, 0, 1);
      audio.setMusicVolume(this.musicVol);
    }
    this.updateVolText();
  }

  private updateVolText(): void {
    this.sfxVolText.text = `sfx ${Math.round(this.sfxVol * 100)}%`;
    this.musicVolText.text = `music ${Math.round(this.musicVol * 100)}%`;
  }

  private toggleMute(): void {
    this.muted = !this.muted;
    audio.setMuted(this.muted);
  }

  /** Press once for a busy wave, again for the same wave at speed 3, a third time to stop. */
  private toggleStress(): void {
    if (this.stressTimer !== null && this.stressScale === 1) {
      this.stressScale = 3;
      this.stressButton.setText('x3');
      return;
    }
    if (this.stressTimer !== null) {
      this.stopStress();
      return;
    }
    this.stressScale = 1;
    this.nextHit = this.nextDie = this.nextShot = this.nextCoin = this.nextBoom = this.nextCrit = 0;
    this.stressLast = performance.now();
    // A wall-clock timer, not the frame loop: the sounds must keep their rate even when frames are slow.
    this.stressTimer = setInterval(() => {
      const now = performance.now();
      this.runStress(Math.min(0.2, (now - this.stressLast) / 1000));
      this.stressLast = now;
    }, 20);
    this.stressButton.setColor(Color.danger);
    this.stressButton.setText('x1');
  }

  private stopStress(): void {
    if (this.stressTimer === null) return;
    clearInterval(this.stressTimer);
    this.stressTimer = null;
    this.stressButton.setColor(Color.successDark);
    this.stressButton.setText('stress');
  }

  override update(dt: number): void {
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.25;
      this.refreshHud();
    }
  }

  /**
   * A battle's worth of overlapping sounds, straight into the engine (the director would thin them first): 16 weapon impacts a second,
   * each with its enemy's answer, 8 releases, 4 deaths, a crit a second, 5 coins and a blast every 2 s (all times the stress scale).
   * Cats and enemies are picked at random, which is the hardest case for the crowd control: nothing repeats.
   */
  private runStress(realDt: number): void {
    const dt = realDt * this.stressScale;
    this.nextHit -= dt;
    this.nextDie -= dt;
    this.nextShot -= dt;
    this.nextCoin -= dt;
    this.nextBoom -= dt;
    this.nextCrit -= dt;
    const unit = () => UNIT_IDS[Math.floor(Math.random() * UNIT_IDS.length)] as (typeof UNIT_IDS)[number];
    const enemy = () => ENEMY_IDS[Math.floor(Math.random() * ENEMY_IDS.length)] as EnemyId;
    while (this.nextHit <= 0) {
      this.playCue(impactSfx(unit()));
      this.playCue(foeHitSfx(enemy()));
      this.nextHit += 1 / 16;
    }
    while (this.nextDie <= 0) {
      this.playCue(foeDieSfx(enemy()));
      this.nextDie += 0.25;
    }
    while (this.nextShot <= 0) {
      this.playCue(attackSfx(unit()));
      this.nextShot += 1 / 8;
    }
    while (this.nextCrit <= 0) {
      const u = unit();
      this.playCue(impactSfx(u));
      this.playCue(critSfx(u));
      this.nextCrit += 1;
    }
    while (this.nextCoin <= 0) {
      audio.play('coin');
      this.nextCoin += 0.2;
    }
    while (this.nextBoom <= 0) {
      audio.play('explosion');
      this.nextBoom += 2;
    }
  }

  private refreshHud(): void {
    const s = audioStats();
    const m = s.music;
    const n = s.nodes;
    // While locked or hidden the requested track differs from the playing one: show both.
    const wanted = m && s.wantedTrack !== m.track ? ` (wants ${s.wantedTrack})` : '';
    const paused = m && m.track !== 'none' && !m.running ? ' paused' : '';
    // The menu pair rotates and a track can hand over to its successor: show the score that sounds when it is not the one asked for.
    const playing = m && m.playing !== m.track && m.playing !== 'none' ? ` [${m.playing}]` : '';
    this.hud.text =
      `${s.state}${s.muted ? ' (muted)' : ''} | baked ${s.baked}/${s.total} ${(s.bakedKB / 1024).toFixed(1)} MB | sfx live ${s.sfxActive} (peak ${s.sfxActivePeak})` +
      (m ? ` | music ${m.track}${playing}${wanted}${paused} voices ${m.liveVoices}/${m.liveVoicesMax} overlap ${m.peakOverlap}` : '') +
      ` | fight ${s.combatActive} (peak ${s.combatActivePeak}) cut ${s.sfxDropped.stolen} thinned ${s.sfxDropped.bucket + s.sfxDropped.cap}` +
      ` | nodes pool ${n.pooledVoices} src ${n.sfxSources} music ${n.musicLive}/${n.musicPeak}` +
      (s.musicLpfHz < 19000 ? ` | lpf ${s.musicLpfHz} Hz` : '');
    fitWidth(this.hud, game.w - PAD * 2);
  }
}
