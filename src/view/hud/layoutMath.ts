/**
 * Where everything of the HUD sits, as pure rectangles. The scene hands over a BattleLayout (top area,
 * bottom panel, safe insets) and the HUD relays itself from these numbers on every 'layout' event.
 */
import { FIELD_H } from '@/game/geometry';
import type { BattleLayout } from '../context';
import { pawBox, pawRotation } from './handMath';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Design width the whole HUD is authored for. */
export const HUD_W = 720;
export const SIDE = 16;

/** Everything of the top block sits on one grid: an 8 px pad, the round buttons' paper, then rows 2 and 3 with 8 px between every pair. */
const TOP_PAD = 8;
/** The pause, speed and skip papers (their touch targets are 88). */
export const FACE = 72;
const ROW_GAP = 8;
/** Row 2's wave label and row 3's countdown bar: one column of one width, one left edge. */
export const LABEL_H = 34;
export const BAR_H = 34;
export const COLUMN_W = 228;
/** Space kept between neighbours of the top block that sit side by side. */
const SIDE_GAP = 12;
/** The skull sticker (63 x 69 as drawn, see GaugeStrip) hangs this far off the strip's left end, and half its height above and below the strip's centre. */
export const SKULL_REACH = 30;
export const SKULL_HALF = 35;
/** The enemy gauge strip's height; the skull is taller and is centred on it. */
const GAUGE_PAPER = 58;

/** The next-wave cards: up to four on a 62 px pitch, left edge on the column's right edge plus a gap. */
export const CARD_W = 56;
export const CARD_H = LABEL_H + ROW_GAP + BAR_H;
export const CARD_GAP = 6;
export const PREVIEW_MAX = 4;
/** The toy shelf: icons on a 40 px pitch, so five fit without touching. */
export const TOY_SIZE = 40;
export const TOY_MAX = 5;
const SHELF_GAP = 8;

export interface TopRects {
  /** The reserved strip (y from safeTop). */
  area: Rect;
  /** Centres of the round buttons' papers (both on the first row's centre line). */
  pause: Point;
  speed: Point;
  gauge: Rect;
  /** Row 2, left: the phase label's paper. */
  wave: Rect;
  /** Row 3, left: the countdown bar (a centre-origin bar of this size sits in it). */
  timer: Rect;
  /** Rows 2 and 3, right of the column: the next-wave cards (first card's left edge on this rect's left edge). */
  preview: Rect;
  /** The toy shelf, same height as the cards. */
  toys: Rect;
  /** Boss / elite strip: takes over the preview and toy area while one is alive. */
  boss: Rect;
  /** Centre line of rows 2 and 3 together (cards, toys, boss strip). */
  midY: number;
}

export function topRects(l: BattleLayout): TopRects {
  const y0 = l.safeTop;
  const row1Y = y0 + TOP_PAD + FACE / 2;
  const row2Y = y0 + TOP_PAD + FACE + ROW_GAP;
  const row3Y = row2Y + LABEL_H + ROW_GAP;
  const blockH = LABEL_H + ROW_GAP + BAR_H;
  const pause = { x: SIDE + FACE / 2, y: row1Y };
  const speed = { x: HUD_W - SIDE - FACE / 2, y: row1Y };
  const gaugeX = pause.x + FACE / 2 + SIDE_GAP + SKULL_REACH;
  const previewX = SIDE + COLUMN_W + SHELF_GAP;
  const previewW = PREVIEW_MAX * CARD_W + (PREVIEW_MAX - 1) * CARD_GAP;
  const toysX = previewX + previewW + SHELF_GAP;
  // The boss strip's sticker hangs about 30 px off its left end, which the column keeps clear.
  const bossX = previewX + 38;
  return {
    area: { x: 0, y: y0, w: HUD_W, h: l.topH },
    pause,
    speed,
    gauge: { x: gaugeX, y: row1Y - GAUGE_PAPER / 2, w: speed.x - FACE / 2 - SIDE_GAP - gaugeX, h: GAUGE_PAPER },
    wave: { x: SIDE, y: row2Y, w: COLUMN_W, h: LABEL_H },
    timer: { x: SIDE, y: row3Y, w: COLUMN_W, h: BAR_H },
    preview: { x: previewX, y: row2Y, w: previewW, h: blockH },
    toys: { x: toysX, y: row2Y, w: HUD_W - SIDE - toysX, h: blockH },
    boss: { x: bossX, y: row2Y, w: HUD_W - SIDE - bossX, h: blockH },
    midY: row2Y + blockH / 2,
  };
}

/** Centre x of card `i` of `n` (the first card's left edge is the preview rect's; they never touch, and a row of four stays inside it). */
export function cardCentre(r: TopRects, i: number): number {
  return r.preview.x + CARD_W / 2 + i * (CARD_W + CARD_GAP);
}

/** What the next-wave row shows: up to four cards, the last one a "+N" card when there are more kinds than fit. */
export function previewShown(kinds: number): { cards: number; more: number } {
  if (kinds <= PREVIEW_MAX) return { cards: kinds, more: 0 };
  return { cards: PREVIEW_MAX - 1, more: kinds - (PREVIEW_MAX - 1) };
}

/** What the toy shelf shows: up to five icons, the last slot a "+N" when there are more toys than fit. */
export function toysShown(toys: number): { icons: number; more: number } {
  if (toys <= TOY_MAX) return { icons: toys, more: 0 };
  return { icons: TOY_MAX - 1, more: toys - (TOY_MAX - 1) };
}

/** Centre x of shelf slot `i` (a slot is as wide as its icon; the shelf is one row of them with no gap, left edge on the shelf's). */
export function toyCentre(r: TopRects, i: number): number {
  return r.toys.x + TOY_SIZE / 2 + i * TOY_SIZE;
}

/** The tutorial's skip button: the Korean label ("건너뛰기", four glyphs at 24 px) on its paper. Its touch target is 88 px tall, its paper 76 (the speed button's size). */
export const SKIP_W = 124;
export const SKIP_H = 88;
export const SKIP_FACE = FACE;
/** Clear space kept between the skip button and the strip, and between it and the speed button. */
const SKIP_GAP = 12;

/**
 * Where the skip button lies in the top row: at the right end, in the slot the speed button will take, and one button's
 * width further in once the speed button has arrived. It never leaves the row, so nothing of the second row is covered.
 */
export function skipRect(r: TopRects, speedShown: boolean): Rect {
  const right = speedShown ? r.speed.x - 44 - SKIP_GAP : HUD_W - SIDE;
  return { x: right - SKIP_W, y: r.speed.y - SKIP_H / 2, w: SKIP_W, h: SKIP_H };
}

/** Width of the enemy strip: all of it, or what the skip button leaves (the strip's left end stays where it is). */
export function gaugeWidth(r: TopRects, skip: Rect | null): number {
  return skip ? Math.min(r.gauge.w, skip.x - SKIP_GAP - r.gauge.x) : r.gauge.w;
}

export interface BottomRects {
  /** Whole panel including the home-indicator inset, down to the screen edge. */
  panel: Rect;
  /** Y of the panel's top edge. */
  top: number;
  /** Offsets from the panel's top edge. */
  chipsY: number;
  currencyY: number;
  utilY: number;
  summonY: number;
  /** Selection sheet: it replaces the chips, currency and utility rows. */
  sheet: Rect;
  /** Sell strip along the top edge while a unit is dragged. */
  sell: Rect;
}

/** The SUMMON button (300 x 140) is the anchor: every other row is stacked upwards from it. */
export function bottomRects(l: BattleLayout): BottomRects {
  const top = l.h - l.safeBottom - l.bottomH;
  const summonY = l.bottomH - 98;
  const utilY = summonY - 126;
  const currencyY = utilY - 86;
  const chipsY = currencyY - 88;
  return {
    panel: { x: 0, y: top, w: HUD_W, h: l.h - top },
    top,
    chipsY,
    currencyY,
    utilY,
    summonY,
    sheet: { x: 12, y: 6, w: HUD_W - 24, h: summonY - 84 },
    sell: sellRect(l, top),
  };
}

/** How far above the panel the strip may reach on tall screens. */
const SELL_REACH = 120;

/**
 * The field part turns on "sell" below its own bottom edge, so the strip starts there: on tall
 * screens it reaches up into the gap above the panel, and the finger meets it as soon as it leaves the field.
 */
function sellRect(l: BattleLayout, panelTop: number): Rect {
  const fieldBottom = l.fieldY + FIELD_H;
  const y = Math.max(-SELL_REACH, Math.min(0, fieldBottom - panelTop));
  return { x: 0, y, w: HUD_W, h: 112 - y };
}

/** Largest scale (<= 1) at which content of `w x h` fits a screen with a margin. Used by popups that must survive 720 x 1280. */
export function fitScale(contentW: number, contentH: number, screenW: number, screenH: number, margin = 24): number {
  return Math.min(1, (screenW - margin) / contentW, (screenH - margin * 2) / contentH);
}

// ───────────────────────── the selection sheet ─────────────────────────

/**
 * The selection sheet on one content box: the dashed line runs `frame` px inside the paper's edge and everything keeps `pad` px of paper from
 * it, so every part (photo, close button, header rows, build well, buttons) lies in a box `edge` px in on all four sides. Coordinates are the sheet's own.
 */
export const SHEET = {
  frame: 8,
  pad: 8,
  edge: 16,
  /** Gap between the header, the well and the buttons. */
  gap: 8,
  photo: 85,
  close: 60,
  /** The well that says what the cat becomes (BuildPlanView), and a button's face and the lip the kit hangs under it. */
  well: 60,
  button: 72,
  lip: 4,
  /** Widths of Molt, Awaken and Sell (a cat that pays purr says both amounts on Sell; Awaken carries its reason) and the gap between them. */
  molt: 186,
  awaken: 214,
  sell: 240,
  buttonGap: 10,
  /** Row centres of the header measured from the content box's top: the name (34 px type, glyphs about 30 tall; the pills are 34 tall), the stats (26 px, about 26) and the skill line (24 px, about 22), which ends where the photo does. */
  nameY: 16,
  statsY: 46,
  skillY: 72,
  /** The "i" sticker of a cut skill line: its radius (the laser button's "i" plate is the same 44 px), the side of its touch slot and the gap to the line it heads. */
  info: 22,
  infoSlot: 76,
  infoGap: 8,
} as const;

export interface SheetBoxes {
  /** The dashed line's rectangle. */
  frame: Rect;
  content: Rect;
  photo: Rect;
  close: Rect;
  well: Rect;
  /** Centre line of the button faces. */
  buttonY: number;
  /** Where the header's text starts, and the most it may reach (left of the close button). */
  textX: number;
  textRight: number;
}

export function sheetBoxes(w: number, h: number): SheetBoxes {
  const { frame, edge, gap, photo, close, well, button, lip } = SHEET;
  const content = { x: edge, y: edge, w: w - edge * 2, h: h - edge * 2 };
  const buttonTop = content.y + content.h - lip - button;
  return {
    frame: { x: frame, y: frame, w: w - frame * 2, h: h - frame * 2 },
    content,
    photo: { x: edge, y: edge, w: photo, h: photo },
    close: { x: w - edge - close, y: edge, w: close, h: close },
    well: { x: edge, y: buttonTop - gap - well, w: content.w, h: well },
    buttonY: buttonTop + button / 2,
    textX: edge + photo + 12,
    textRight: w - edge - close - gap,
  };
}

/**
 * The "i" sticker that opens a cut skill line in full. It heads the line, on the photo's lower right corner: the far side of the sheet from the
 * close button (it used to end the line, a 26 px mark right under that button, and a miss closed the sheet). `slot` is what answers a touch:
 * a square round the sticker that stops where the build well starts. The photo opens the same text, so the target is the photo and the sticker together.
 */
export function sheetSkillInfo(w: number, h: number): { centre: Point; r: number; slot: Rect; lineX: number } {
  const b = sheetBoxes(w, h);
  const r = SHEET.info;
  const centre = { x: b.photo.x + b.photo.w - 7, y: SHEET.edge + SHEET.skillY };
  const top = centre.y - SHEET.infoSlot / 2;
  return {
    centre,
    r,
    slot: { x: centre.x - SHEET.infoSlot / 2, y: top, w: SHEET.infoSlot, h: Math.min(SHEET.infoSlot, b.well.y - top) },
    lineX: centre.x + r + SHEET.infoGap,
  };
}

// ───────────────────────── the laser button ─────────────────────────

/**
 * The laser button on one centre: a face (the kit draws an icon-only glyph at 62 % of it), a moat of paper, then the timer ring (the kit's
 * CooldownRing paints a paper disc inside its ring, and that disc is the moat). Nothing reaches beyond the ring; the "i" mark sits clear of it
 * on the lower right and the seconds under it. Every number here is measured from the one centre.
 */
/** The button's centre in the action row: on the summon button's centre line (the call button above clears the ring by 18 px). */
export const LASER_X = 615;
export const LASER_FACE = 88;
export const LASER_RING = 58;
export const LASER_RING_TH = 8;
export const LASER_GLYPH = Math.round(LASER_FACE * 0.62);
/** Paper between the face's edge and the ring's inner edge. */
export const LASER_MOAT = LASER_RING - LASER_RING_TH - LASER_FACE / 2;
/** The "i" plate's radius with its edge (44 px face, 3 px edge: measured 22.75), its centre's offset from the laser's centre, and the seconds' centre under the ring. */
export const INFO_R = 23;
export const LASER_INFO = { x: 70, y: 64 } as const;
export const LASER_SECONDS_Y = LASER_RING + 2 + 15;
/** The lesson's window round the ring: this much clear of it, so the dashed line stays off the "i" mark. */
export const LASER_SPOT = 8;

/** The laser button's face and glyph radii (design px, scaled with its pop-in) and centre, from its ring's rectangle: what the paw's rim spots are cut from. */
export function laserFace(ring: Rect): { centre: Point; faceR: number; glyphR: number } {
  const k = ring.w / (2 * LASER_RING);
  return { centre: { x: ring.x + ring.w / 2, y: ring.y + ring.h / 2 }, faceR: (LASER_FACE / 2) * k, glyphR: (LASER_GLYPH / 2) * k };
}

/**
 * The tutorial's spotlight window round `r`: `margin` on every side about the control's own centre (so the insets left and right, top and bottom
 * are equal), the half sizes rounded up to `grid` (a button that breathes does not change the window on every beat) and held inside the screen.
 */
export function spotWindow(r: Rect, margin: number, grid: number, screen: { w: number; h: number }): Rect {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const up = (v: number): number => Math.ceil(v / grid - 1e-9) * grid;
  const hw = Math.min(up(r.w / 2 + margin), cx, screen.w - cx);
  const hh = Math.min(up(r.h / 2 + margin), cy, screen.h - cy);
  return { x: cx - hw, y: cy - hh, w: hw * 2, h: hh * 2 };
}

/** Corner radius of a spotlight window: a circle when the window is round (a button), else the usual cut-out corner. */
export function spotRadius(w: Rect, corner: number): number {
  return Math.abs(w.w - w.h) <= 12 ? Math.min(w.w, w.h) / 2 : corner;
}

// ───────────────────────── the pick of three ─────────────────────────

/** The pick sheet in its own coordinates: three photo cards in a row under the sub line, each with a class line and a "merges into" pair of lines below. */
export const PICK = {
  w: 690,
  /** Height of the sheet: the text under the cards ends 62 px lower than it did before the paw's band was added over them. */
  h: 726,
  /** Card width (a card is 220 x 292 scaled by `scale`) and the gap between cards. */
  scale: 0.92,
  gap: 14,
  /** Centre line of the cards (the band over them holds the paw), and the sub line above them (centre y, half height, width of the widest text). */
  cardY: 392,
  subY: 84,
  subHalf: 34,
  subW: 610,
  /** Half height of a photo frame (292 x scale / 2): the text of a card starts under it. */
  frameHalf: 134,
  /** How far its fingertip sits inside the frame's top edge. */
  tipInside: 29,
  /** Without the paw there is no band over the cards: they sit this far under the sub line, and the sheet is as much shorter as they moved up. */
  plainGap: 20,
} as const;

/** Centre line of the cards and height of the sheet: the lesson's sheet has a band for the paw, a plain pick does not. */
export function pickSheet(guide: boolean): { cardY: number; h: number } {
  if (guide) return { cardY: PICK.cardY, h: PICK.h };
  const cardY = PICK.subY + PICK.subHalf + PICK.plainGap + PICK.frameHalf;
  return { cardY, h: PICK.h - (PICK.cardY - cardY) };
}

/** Centre x of card `i` of `n`. */
export function pickCardX(i: number, n: number): number {
  return PICK.w / 2 + (i - (n - 1) / 2) * (220 * PICK.scale + PICK.gap);
}

/**
 * Where the tutorial's paw points at card `i` of `n`: the fingertip on the photo's top edge, the arm coming down from the band between the
 * sub line and the cards, leaning away from the sheet's middle on the outer cards. Returns the fingertip, the turn of the paw and the
 * rectangle the whole paw covers, so a test can say that no card's name, class or "merges into" line and no part of the sub line is under it.
 */
export function pickHand(i: number, n: number): { tip: Point; rotation: number; body: Rect } {
  const tip = { x: pickCardX(i, n), y: PICK.cardY - PICK.frameHalf + PICK.tipInside };
  const rotation = pawRotation(i * 2 + 1 > n ? 'upperLeft' : 'upperRight', 0.44);
  return { tip, rotation, body: pawBox(tip, rotation) };
}
