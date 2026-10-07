import { Container, Graphics, type Text } from 'pixi.js';
import { t } from '@/core/i18n';
import { damp } from '@/core/math';
import { Color, drawDashedRect, drawPaper, motion, paperSeed, uiLabel } from '@/ui';
import { LASER_VULNERABLE } from '@/game';
import { FIELD_W, LANE_WIDTH, PATH_BOTTOM, PATH_LEFT, PATH_RADIUS, PATH_RIGHT, PATH_TOP } from '@/game/geometry';
import { aimingFor } from '../aim';
import type { FieldEnv } from './env';

const HALF = LANE_WIDTH / 2;
/** How long the long caption stays on the dot before it shrinks to the compact "bonus and seconds" tag. */
const CAPTION_SECONDS = 2.6;
const TAG_GAP = 78;

/** The lane lit as the valid area: a pale paper band along the enemy loop with a dashed teal edge on each side. */
function buildLane(): Container {
  const root = new Container();
  const band = new Graphics();
  band.roundRect(PATH_LEFT, PATH_TOP, PATH_RIGHT - PATH_LEFT, PATH_BOTTOM - PATH_TOP, PATH_RADIUS).stroke({ width: LANE_WIDTH, color: Color.paperLight, join: 'round' });
  const edges = new Graphics();
  const dash = { color: Color.tealDark, width: 5, dash: 18, gap: 12 } as const;
  drawDashedRect(edges, PATH_LEFT - HALF, PATH_TOP - HALF, PATH_RIGHT - PATH_LEFT + LANE_WIDTH, PATH_BOTTOM - PATH_TOP + LANE_WIDTH, { ...dash, radius: PATH_RADIUS + HALF });
  drawDashedRect(edges, PATH_LEFT + HALF, PATH_TOP + HALF, PATH_RIGHT - PATH_LEFT - LANE_WIDTH, PATH_BOTTOM - PATH_TOP - LANE_WIDTH, { ...dash, radius: 8 });
  root.addChild(band, edges);
  root.eventMode = 'none';
  return root;
}

/**
 * What the player sees of the laser besides the dot: while the dot is about to be placed (the button was pressed) or is on, the
 * lane lights up as the area it may go on; while it is on, a paper tag follows the dot saying what it does with the real
 * number ("cats hit enemies near here first, damage +15%") and then, in short, the bonus and the seconds left.
 */
export class LaserView {
  private readonly lane = buildLane();
  private readonly tag = new Container();
  private readonly plate = new Graphics();
  private readonly head: Text;
  private readonly body: Text;
  private laneK = 0;
  private active = false;
  private since = 0;
  private shownSecs = -1;
  private shownFull = true;
  private tagK = 0;
  private x = 0;
  private y = 0;

  constructor(
    private readonly env: FieldEnv,
    laneLayer: Container,
    tagLayer: Container,
  ) {
    this.lane.alpha = 0;
    this.lane.visible = false;
    this.head = uiLabel('', { size: 24 });
    this.body = uiLabel('', { size: 26, color: Color.coralDark });
    this.tag.addChild(this.plate, this.head, this.body);
    this.tag.visible = false;
    this.tag.eventMode = 'none';
    laneLayer.addChild(this.lane);
    tagLayer.addChild(this.tag);
  }

  update(dt: number, time: number): void {
    const l = this.env.battle.laser;
    const aiming = !l.active && l.cooldown <= 0 && aimingFor() > 0;
    // Brightest while the dot is about to be placed, calmer while it is on (the lane is then where it can be moved).
    const want = aiming ? 1 : l.active ? 0.5 : 0;
    this.laneK = damp(this.laneK, want, 0.08, dt);
    this.lane.visible = this.laneK > 0.01;
    if (this.lane.visible) {
      const pulse = motion.reduced ? 0 : 0.14 * Math.sin(time * 5);
      this.lane.alpha = Math.min(1, this.laneK * (aiming ? 0.62 + pulse : 0.38 + pulse * 0.5));
    }

    if (l.active && !this.active) {
      this.active = true;
      this.since = 0;
      this.shownSecs = -1;
      this.tagK = 0;
    } else if (!l.active) this.active = false;
    this.tagK = damp(this.tagK, l.active ? 1 : 0, 0.05, dt);
    this.tag.visible = this.tagK > 0.02;
    if (!this.tag.visible) return;
    if (l.active) {
      this.since += dt;
      this.x = l.x;
      this.y = l.y;
      this.fill(Math.ceil(l.timeLeft), this.since < CAPTION_SECONDS);
    }
    const full = this.shownFull;
    const w = this.plate.width;
    const h = full ? 92 : 52;
    const px = Math.min(FIELD_W - w / 2 - 8, Math.max(w / 2 + 8, this.x));
    const below = this.y < h + TAG_GAP + 10;
    this.tag.position.set(px, below ? this.y + TAG_GAP : this.y - TAG_GAP - (full ? 18 : 0));
    this.tag.scale.set(motion.reduced ? 1 : Math.min(1.1, this.tagK * (1 + 0.25 * (1 - this.tagK))));
    this.tag.alpha = Math.min(1, this.tagK * 1.5);
  }

  /** Re-set the tag's words when the seconds or the long / short form change (once a second at most). */
  private fill(secs: number, full: boolean): void {
    if (secs === this.shownSecs && full === this.shownFull) return;
    this.shownSecs = secs;
    this.shownFull = full;
    const pct = Math.round(LASER_VULNERABLE * 100);
    const s = String(Math.max(0, secs));
    this.body.text = t(full ? 'view.laser.bonus' : 'view.laser.compact', { n: pct, s });
    this.head.visible = full;
    if (full) this.head.text = t('view.laser.mark');
    const w = Math.max(this.body.width, full ? this.head.width : 0) + 40;
    const h = full ? 92 : 52;
    this.plate.clear();
    drawPaper(this.plate, -w / 2, -h / 2, { w, h, radius: 20, fill: Color.paperLight, edge: Color.coral, edgeWidth: 3.5, edgeAlpha: 1, seed: paperSeed(), shadow: 4, grain: false });
    this.head.position.set(0, -h / 2 + 26);
    this.body.position.set(0, full ? h / 2 - 28 : 0);
  }

  destroy(): void {
    this.lane.destroy({ children: true });
    this.tag.destroy({ children: true });
  }
}
