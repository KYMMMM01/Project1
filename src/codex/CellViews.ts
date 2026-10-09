/**
 * The board-cell section: the kinds of ground a cat can stand on, in groups. Each card has its name on a torn label, a small picture of
 * the board with the cells marked (or the lane's loop) and the text with the numbers of cells.ts.
 */
import { Container } from 'pixi.js';
import { t } from '@/core/i18n';
import { Color, PaperLabel } from '@/ui';
import { cellBoard, type CellKind } from './boards';
import { BoardView } from './BoardView';
import { CELL_GROUPS } from './cells';
import { cellPage } from './cellText';
import { LaneView } from './LaneView';
import { HEAD_OVER, PAD, paragraph, sheet } from './parts';
import './strings';

const BOARD_W = 280;
const LANE_W = 520;
const GROUP_PAPER = { basic: Color.teal, special: Color.mustard, danger: Color.coral, toy: Color.violet, aura: Color.leaf, lane: Color.mustard } as const;

function card(kind: CellKind, w: number): { view: Container; h: number } {
  const page = cellPage(kind);
  const view = new Container();
  const art = kind === 'lane' ? new LaneView(LANE_W) : new BoardView(cellBoard(kind), BOARD_W);
  const inner = new Container();
  const top = HEAD_OVER + 28;
  art.position.set(w / 2, top + art.size.h / 2);
  const textY = top + art.size.h + 20;
  const textH = paragraph(inner, w - PAD * 2, page.text, 0);
  inner.position.set(PAD, textY);
  const h = textY + textH + PAD;
  const label = new PaperLabel({ text: page.name, size: 32, paper: Color.paperLight, padX: 28, padY: 8, seed: 17 });
  label.position.set(label.width / 2 + PAD, 0);
  view.addChild(sheet(w, h), art, inner, label);
  return { view, h };
}

/** Every cell kind in its group. `y` is where the list starts; returns the height used. */
export function buildCellList(content: Container, w: number, y: number): number {
  let at = y;
  for (const group of CELL_GROUPS) {
    const head = new PaperLabel({ text: t(`codex.cellgroup.${group.id}`), size: 30, paper: GROUP_PAPER[group.id], padX: 26, padY: 8, seed: 13 });
    head.position.set(head.width / 2 + 8, at + head.height / 2);
    content.addChild(head);
    at += head.height + 40;
    for (const kind of group.kinds) {
      const c = card(kind, w);
      c.view.position.set(0, at);
      content.addChild(c.view);
      at += c.h + 40;
    }
    at += 4;
  }
  return at - y;
}
