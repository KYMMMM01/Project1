/**
 * The toy section: a filter by rarity and one card per toy: its icon on a mat in the rarity's colour, name, rarity, the toy's own effect
 * text (numbers from the data) and, for the toys whose effect depends on where a cat stands, a small board with the cells it reaches.
 */
import { Container } from 'pixi.js';
import { t } from '@/core/i18n';
import { mixColor } from '@/core/math';
import type { RelicId } from '@/game/api';
import type { CodexKey, GuideProgress } from '@/guide/progress';
import { Color, fitLabel, PaperLabel, paperSeed, paperShape, Rarity, rarityName, uiLabel } from '@/ui';
import { relicIcon } from '@/view/hud/kit';
import { toyBoard } from './boards';
import { BoardView } from './BoardView';
import { PAD } from './parts';
import { toyItem, toysFor, type ToyFilter, type ToyItem } from './toys';
import './strings';

const MAT = 136;
const MIN_H = MAT + PAD * 2;
const BOARD_W = 118;
const GAP = 14;

export const toyKey = (id: RelicId): CodexKey => `toy:${id}`;

export function toyFilterLabel(filter: ToyFilter): string {
  return filter === 'all' ? t('codex.toys.all') : rarityName(filter);
}

/** How many toys the player has met, of how many (for the list's caption). */
export function toysMet(progress: GuideProgress): { met: number; total: number } {
  const all = toysFor('all');
  return { met: all.filter((id) => progress.isMet(toyKey(id))).length, total: all.length };
}

function card(item: ToyItem, w: number, progress: GuideProgress): { view: Container; h: number } {
  const view = new Container();
  const met = progress.isMet(toyKey(item.id));
  const fresh = progress.isFresh(toyKey(item.id));
  const rar = Rarity[item.rarity];
  const board = toyBoard(item.id);
  const boardView = board ? new BoardView(board, BOARD_W, 'dot') : null;
  const x0 = PAD + MAT + 20;
  const room = w - x0 - PAD - (boardView ? boardView.size.w + GAP : 0);

  const name = uiLabel(item.name, { size: 32, anchorX: 0 });
  fitLabel(name, room - (fresh ? 120 : 0), 32);
  name.position.set(x0, PAD + 20);
  const tag = new PaperLabel({ text: rarityName(item.rarity), size: 24, paper: rar.color, ink: Color.inkDeep, padX: 14, padY: 4, seed: 4 });
  tag.position.set(x0 + tag.width / 2, PAD + 20 + 20 + tag.height / 2 + 4);
  const effect = uiLabel(item.effect, { size: 26, anchorX: 0, anchorY: 0, wrap: room, align: 'left', lineHeight: 36 });
  effect.position.set(x0, tag.y + tag.height / 2 + 10);
  let bottom = effect.y + effect.height;
  const unmet = met ? null : new PaperLabel({ text: t('codex.unmet'), size: 24, paper: 'kraft', padX: 16, padY: 4, seed: 9 });
  if (unmet) {
    unmet.position.set(x0 + unmet.width / 2, bottom + 14 + unmet.height / 2);
    bottom += 14 + unmet.height;
  }
  const h = Math.max(MIN_H, bottom + PAD, boardView ? boardView.size.h + PAD * 2 : 0);

  const paper = paperShape({ w, h, radius: 28, fill: Color.paperLight, seed: paperSeed(), grain: false });
  paper.position.set(w / 2, h / 2);
  const mat = paperShape({ w: MAT, h: MAT, radius: 22, fill: mixColor(rar.color, Color.paperLight, 0.55), edge: rar.dark, seed: paperSeed(), grain: false });
  mat.position.set(PAD + MAT / 2, PAD + MAT / 2);
  const icon = relicIcon(item.id, MAT - 28, item.rarity);
  icon.position.set(PAD + MAT / 2, PAD + MAT / 2);
  icon.alpha = met ? 1 : 0.5;
  view.addChild(paper, mat, icon, name, tag, effect);
  if (unmet) view.addChild(unmet);
  if (boardView) {
    boardView.position.set(w - PAD - boardView.size.w / 2, PAD + boardView.size.h / 2);
    view.addChild(boardView);
  }
  if (fresh) {
    const sticker = new PaperLabel({ text: t('codex.new'), size: 24, paper: Color.berry, padX: 14, padY: 4, seed: 7 });
    // Right-aligned in the text column, which ends where the diagram begins.
    sticker.position.set(x0 + room - sticker.width / 2, PAD + 18);
    sticker.rotation = 0.1;
    view.addChild(sticker);
  }
  return { view, h };
}

/** The toys of a rarity as cards. `y` is where the list starts; returns the height used. */
export function buildToyList(content: Container, w: number, y: number, filter: ToyFilter, progress: GuideProgress): number {
  let at = y;
  for (const id of toysFor(filter)) {
    const c = card(toyItem(id), w, progress);
    c.view.position.set(0, at);
    content.addChild(c.view);
    at += c.h + 14;
  }
  return at - y;
}
