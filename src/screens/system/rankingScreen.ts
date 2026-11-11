/**
 * The ranking screen (platform/ranking.ts): the endless mode's top 100, of all time and of this week, as the server last folded them (every
 * 10 minutes), with the player's own place on top. Signed out it still shows the boards, with the sign-in button where the place would be.
 */
import { Container } from 'pixi.js';
import { game } from '@/core/game';
import { t } from '@/core/i18n';
import { account, ranking, type BoardKey, type BoardView, type MyPlace } from '@/platform';
import { Button, Color, fitLabel, ScreenScaffold, SegmentTabs, uiLabel } from '@/ui';
import { formSheet, LABEL_OVERHANG, type FormRow } from './settingsForm';
import { signInFlow } from './accountFlow';
import { changeNameFlow } from './nameDialog';
import './strings';

const SIDE = 28;
const ROW_H = 76;
const SEG_H = 80;
const GAP = 28;
/** The podium: gold, silver, bronze for the first three places. */
const PODIUM = [Color.mustard, Color.inkSoft, Color.coral] as const;

let current: ScreenScaffold | null = null;

export function openRanking(): void {
  if (current) return;
  const scaffold = new ScreenScaffold({ title: t('rt.sys.rank'), onBack: () => close(), scroll: true });
  current = scaffold;
  game.popupLayer.addChild(scaffold);
  let closed = false;
  let board: BoardKey = 'endless';
  let view: BoardView | null | 'loading' = 'loading';
  let mine: MyPlace | null = null;
  /** The player's ranking name, null until read (or signed out). */
  let name: string | null = null;
  /** Answers that come back after the player switched boards are dropped. */
  let ask = 0;

  const line = (row: Container, w: number, rank: string, name: string, score: string, tint: number, me = false): void => {
    const r = uiLabel(rank, { size: 30, color: tint, anchorX: 0.5 });
    r.position.set(SIDE + 34, ROW_H / 2);
    const s = uiLabel(score, { size: 28, anchorX: 1, align: 'right' });
    s.position.set(w - SIDE, ROW_H / 2);
    const n = uiLabel(name, { size: 28, color: me ? Color.teal : Color.ink, anchorX: 0, align: 'left' });
    fitLabel(n, w - SIDE * 2 - 110 - Math.ceil(s.width) - 24, 28);
    n.position.set(SIDE + 86, ROW_H / 2);
    row.addChild(r, n, s);
  };

  const note = (text: string): FormRow => ({
    height: 120,
    draw: (row, w) => {
      const l = uiLabel(text, { size: 26, color: Color.inkSoft, wrap: w - SIDE * 2, align: 'center' });
      l.position.set(w / 2, 60);
      row.addChild(l);
    },
  });

  const build = (): void => {
    if (closed) return;
    for (const c of scaffold.content.removeChildren()) c.destroy({ children: true });
    const w = scaffold.contentWidth;
    let y = 10;
    const seg = new SegmentTabs({
      width: w,
      height: SEG_H,
      selected: board,
      tabs: [
        { id: 'endless', label: t('rt.sys.rank.all') },
        { id: 'week', label: t('rt.sys.rank.week') },
      ],
    });
    seg.position.set(w / 2, y + SEG_H / 2);
    seg.onSelect((id) => {
      board = id as BoardKey;
      void load();
    });
    scaffold.content.addChild(seg);
    y += SEG_H + GAP + LABEL_OVERHANG;

    const status = account.state().status;
    // Signed in: the ranking name first, with its change button.
    const nameRow: FormRow = {
      height: ROW_H + 16,
      draw: (row, rw) => {
        const b = new Button({ label: t('rt.sys.name.edit'), style: 'neutral', width: 170, height: 68, fontSize: 28 });
        b.position.set(rw - SIDE - 85, (ROW_H + 16) / 2);
        b.onTap(() =>
          void changeNameFlow(name ?? undefined).then((n) => {
            if (n) void load();
          }),
        );
        const head = uiLabel(t('rt.sys.name'), { size: 24, color: Color.inkSoft, anchorX: 0, align: 'left' });
        head.position.set(SIDE, 26);
        const n = uiLabel(name ?? t('rt.sys.rank.loading'), { size: 30, color: name ? Color.teal : Color.inkSoft, anchorX: 0, align: 'left' });
        fitLabel(n, rw - SIDE * 3 - 170, 30);
        n.position.set(SIDE, 62);
        row.addChild(head, n, b);
      },
    };
    const placeRows: FormRow[] = status === 'wait'
      ? [note(t('rt.sys.acct.wait'))]
      : status !== 'on'
      ? [
          note(t('rt.sys.rank.signIn')),
          {
            height: 96 + 30,
            draw: (row, rw) => {
              const b = new Button({ label: t('rt.sys.acct.signIn'), style: 'neutral', width: rw - SIDE * 2, height: 96, fontSize: 32 });
              b.onTap(() => void signInFlow());
              b.position.set(rw / 2, 56);
              row.addChild(b);
            },
          },
        ]
      : view === 'loading'
        ? [note(t('rt.sys.rank.loading'))]
        : mine
          ? [{ height: ROW_H, draw: (row, rw) => line(row, rw, String(mine!.rank), mine!.name, t('rt.sys.rank.waves', { n: mine!.score }), Color.teal, true) }]
          : [note(t('rt.sys.rank.none'))];
    const mineRows = status === 'on' ? [nameRow, ...placeRows] : placeRows;
    const top = formSheet(w, t('rt.sys.rank.mine'), mineRows, 'mustard');
    top.view.position.set(0, y);
    scaffold.content.addChild(top.view);
    y += top.height + GAP + LABEL_OVERHANG;

    const me = account.state();
    const uid = me.status === 'on' ? me.uid : '';
    const rows: FormRow[] =
      view === 'loading'
        ? [note(t('rt.sys.rank.loading'))]
        : view === null
          ? [note(t('rt.sys.rank.failed'))]
          : view.top.length === 0
            ? [note(t('rt.sys.rank.empty'))]
            : view.top.map((r, i) => ({
                height: ROW_H,
                draw: (row: Container, rw: number) =>
                  line(row, rw, String(i + 1), r.name, t('rt.sys.rank.waves', { n: r.score }), PODIUM[i] ?? Color.inkSoft, r.uid === uid),
              }));
    const title = view && view !== 'loading' && view.total > 0 ? t('rt.sys.rank.total', { n: view.total }) : t('rt.sys.rank.top');
    const list = formSheet(w, title, rows);
    list.view.position.set(0, y);
    scaffold.content.addChild(list.view);
    y += list.height + GAP;

    const foot = uiLabel(t('rt.sys.rank.note'), { size: 24, color: Color.inkSoft, wrap: w - SIDE * 2, align: 'center' });
    foot.position.set(w / 2, y + 24);
    scaffold.content.addChild(foot);
    scaffold.refresh();
  };

  const load = async (): Promise<void> => {
    const n = ++ask;
    view = 'loading';
    mine = null;
    build();
    const [v, m, nm] = await Promise.all([ranking.board(board), ranking.mine(board), ranking.myName()]);
    if (closed || n !== ask) return;
    view = v;
    mine = m;
    name = nm;
    build();
  };

  const offAccount = account.onChange(() => queueMicrotask(() => void load()));

  const close = (): void => {
    if (closed) return;
    closed = true;
    offAccount();
    current = null;
    void scaffold.hide(true).then(() => scaffold.destroy({ children: true }));
  };

  void load();
  void scaffold.show(true);
}
