/**
 * The header every card in the menus shares: an icon on a paper disc, the title beside it, an optional control (a tag or an
 * info button) at the far end, and a dashed separator under the row. One centre line runs through the disc, the title and the
 * control; the separator keeps the same distance below that row on every card and starts and ends at the same margins, so no
 * disc or button ever sits on the line and no card's header is taller than its neighbour's. Origin = top-left of the card.
 */
export const HEADER = {
  /** Margin from the card's edge to the disc, the control and both ends of the separator. */
  padX: 24,
  /** From the top of the card (or of its rim) to the top of the disc. */
  top: 12,
  /** Diameter of the disc, and of a round control that shares the row. */
  disc: 56,
  /** The icon in it: 68 % of the disc, centred. */
  icon: 38,
  /** Disc to title. */
  gap: 14,
  /** Bottom of the disc (and of the control) to the separator. */
  below: 12,
  /** Separator to the first thing of the body. */
  after: 12,
} as const;

export interface HeaderLayout {
  /** Centre line of the row. */
  cy: number;
  /** The disc's top-left corner and diameter (for drawPaper) and its centre (for the icon). */
  disc: { x: number; y: number; d: number; cx: number };
  icon: { x: number; y: number; size: number };
  /** Left edge and centre line of the title, and the width it may use before the control. */
  title: { x: number; y: number; maxW: number };
  /** Centre of a round control at the right end of the row; its diameter is the disc's. */
  control: { x: number; y: number; d: number };
  /** The separator. */
  sep: { y: number; x0: number; x1: number };
  /** Where the body may start. */
  contentTop: number;
  /** Horizontal span a decoration on the top edge (the tape) may use without touching the disc or the control. */
  tapeSpan: { min: number; max: number };
}

/** Height of the header block for a card without a rim; the old title row was 72 px, so a card that had one is this much taller than before. */
export const HEADER_H = HEADER.top + HEADER.disc + HEADER.below + HEADER.after;

/**
 * Place the header for a card `w` wide. `rim` is the width of a coloured backing round the paper (a featured card): the row sits
 * below it. `reserve` is the width the control at the end of the row needs (default: a round one the size of the disc).
 */
export function headerLayout(w: number, o: { rim?: number; reserve?: number; tape?: number } = {}): HeaderLayout {
  const { padX, disc, gap } = HEADER;
  const rim = o.rim ?? 0;
  const reserve = o.reserve ?? disc;
  const top = HEADER.top + rim;
  const cy = top + disc / 2;
  const sepY = top + disc + HEADER.below;
  const titleX = padX + disc + gap;
  const tape = o.tape ?? 84;
  return {
    cy,
    disc: { x: padX, y: top, d: disc, cx: padX + disc / 2 },
    icon: { x: padX + disc / 2, y: cy, size: HEADER.icon },
    title: { x: titleX, y: cy + 1, maxW: Math.max(0, w - padX - reserve - gap - titleX) },
    control: { x: w - padX - disc / 2, y: cy, d: disc },
    sep: { y: sepY, x0: padX, x1: w - padX },
    contentTop: sepY + HEADER.after,
    tapeSpan: { min: titleX + tape / 2, max: w - padX - reserve - 8 - tape / 2 },
  };
}
