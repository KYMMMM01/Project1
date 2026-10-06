import { Container, FederatedPointerEvent, Graphics, Point, type Text } from 'pixi.js';
import { Scene } from '@/core/scene';
import { uiTweens } from '@/core/tween';
import { game } from '@/core/game';
import { debugExpose } from '@/core/debug';
import { addStrings, getLang, setLang, t, type Lang } from '@/core/i18n';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { CardFrame, type CardSize } from '@/ui/CardFrame';
import { ClassChip } from '@/ui/ClassChip';
import { Divider, LoadingSpinner, Stars } from '@/ui/Decor';
import { IconButton } from '@/ui/IconButton';
import { ICON_NAMES, drawIcon, type IconName } from '@/ui/icons';
import { toDesign } from '@/ui/layout';
import { motion } from '@/ui/motion';
import { OddsTable } from '@/ui/OddsTable';
import { drawDashedLine, drawDashedRect, drawFloor, drawPaintFill, drawPaper, drawSpeechBubble, PaperLabel, paperShape, tapeStrip, type TapePattern } from '@/ui/paper';
import { Panel, type PanelOpts } from '@/ui/Panel';
import { popups } from '@/ui/Popup';
import { uiPrefs } from '@/ui/prefs';
import { RarityPips } from '@/ui/RarityPips';
import { ScreenScaffold } from '@/ui/ScreenScaffold';
import { CooldownRing, ProgressBar } from '@/ui/ProgressBar';
import { ScrollView } from '@/ui/ScrollView';
import { SegmentTabs, TabBar } from '@/ui/TabBar';
import { Tag } from '@/ui/Tag';
import { artLabel, uiLabel } from '@/ui/text';
import { ButtonPalettes, Color, RARITY_ORDER, type ButtonStyleId, type RarityId, type TapeName } from '@/ui/theme';
import { toast, type ToastKind } from '@/ui/Toast';
import { CurrencyPill, TopBar } from '@/ui/CurrencyPill';
import { Slider, Stepper, Toggle } from '@/ui/controls';
import { attachTooltip } from '@/ui/Tooltip';
import { alertDialog, confirmDialog } from '@/ui/dialogs';
import { showRewards } from '@/ui/RewardPopup';

// The game's own tables register the same keys; the gallery carries copies so it never depends on them.
addStrings('ko', {
  'rarity.common': '꼬마',
  'rarity.rare': '동네',
  'rarity.epic': '골목대장',
  'rarity.legendary': '대왕',
  'rarity.mythic': '수호신',
  'class.warrior.name': '전사',
  'class.ranger.name': '사수',
  'class.mage.name': '마법',
  'class.trickster.name': '재주',
});
addStrings('en', {
  'rarity.common': 'Kitten',
  'rarity.rare': 'Street',
  'rarity.epic': 'Alley Boss',
  'rarity.legendary': 'King',
  'rarity.mythic': 'Guardian',
  'class.warrior.name': 'Warrior',
  'class.ranger.name': 'Ranger',
  'class.mage.name': 'Mage',
  'class.trickster.name': 'Trickster',
});

interface PageDef {
  title: string;
  build: (host: Container) => void;
}

const RARITIES: RarityId[] = [...RARITY_ORDER];
const ODDS: readonly (readonly [RarityId, number])[] = [
  ['common', 0.6],
  ['rare', 0.28],
  ['epic', 0.09],
  ['legendary', 0.027],
  ['mythic', 0.003],
];
const PALETTES: readonly (readonly [ButtonStyleId, string])[] = [
  ['primary', '플레이'],
  ['success', '받기'],
  ['info', '정보'],
  ['danger', '삭제'],
  ['neutral', '나중에'],
  ['purple', '소환'],
  ['mustard', '상점'],
  ['kraft', '닫기'],
];
/** Width of a gallery sheet and the margin that centres it. */
const SHEET_W = 668;

/** Gallery of every UI component: ?demo=ui&page=N. */
export default class UiDemo extends Scene {
  private readonly bg = new Graphics();
  private readonly host = new Container();
  private readonly nav = new Container();
  private readonly named = new Map<string, Container>();
  private pageIndex = 0;
  private readonly navTitle = new PaperLabel({ text: '', size: 30, paper: Color.paperLight, padX: 30, padY: 8, minWidth: 360 });
  private tapCount = 0;
  private pageBar: TabBar | null = null;
  private scrollView: ScrollView | null = null;
  private cardSize: CardSize = 'small';
  private refillCards: (() => void) | null = null;
  private scaffold: ScreenScaffold | null = null;

  private readonly pages: PageDef[] = [
    { title: 'Buttons', build: (h) => this.pageButtons(h) },
    { title: 'States / Icons', build: (h) => this.pageStates(h) },
    { title: 'Panels / Popups', build: (h) => this.pagePopups(h) },
    { title: 'Bars / Controls', build: (h) => this.pageBars(h) },
    { title: 'Paper kit', build: (h) => this.pagePaper(h) },
    { title: 'Bubbles / Tags', build: (h) => this.pageBubbles(h) },
    { title: 'Card frames', build: (h) => this.pageCards(h) },
    { title: 'Icons', build: (h) => this.pageIcons(h) },
    { title: 'Scroll list', build: (h) => this.pageScroll(h) },
    { title: 'Tab bar', build: (h) => this.pageTabs(h) },
    { title: 'Odds / Classes', build: (h) => this.pageOdds(h) },
    { title: 'Battle sample', build: (h) => this.pageBattle(h) },
  ];

  override enter(): void {
    const q = new URLSearchParams(location.search).get('page');
    this.pageIndex = Math.max(0, Math.min(this.pages.length - 1, Number(q ?? 0) || 0));
    this.addChild(this.bg, this.host, this.nav);
    this.buildNav();
    this.show(this.pageIndex);
    debugExpose('ui', {
      show: (i: number) => this.show(i),
      /** Design-space centre of a named element, for synthetic taps. */
      where: (name: string) => this.where(name),
      /** The named element itself, for inspecting internals from scripts. */
      node: (name: string) => this.named.get(name) ?? null,
      confirm: () => this.openConfirm(false),
      danger: () => this.openConfirm(true),
      alert: () => this.openAlert(),
      rewards: (double: boolean) => this.openRewards(double),
      toast: (kind: ToastKind, text?: string) => toast(text ?? `Toast ${kind}`, kind),
      popups,
      scrollInfo: () => (this.scrollView ? { y: this.scrollView.scrollY, max: this.scrollView.maxScrollY, dragging: this.scrollView.isDragging } : null),
      tabs: () => this.pageBar,
      /** Live UI tweens: must return to its idle baseline after a page is torn down. */
      tweenCount: () => uiTweens.count,
      uiTweens,
      motion,
      scrollTo: (y: number, animated: boolean) => this.scrollView?.scrollTo(y, animated),
      scaffold: () => this.openScaffold(),
      closeScaffold: () => this.closeScaffold(),
      scaffoldInfo: () => {
        const sc = this.scaffold;
        if (!sc) return null;
        return { body: sc.bodyRect, contentWidth: sc.contentWidth, maxScroll: sc.scroller?.maxScrollY ?? 0, scrollY: sc.scroller?.scrollY ?? 0 };
      },
      colorAssist: (v: boolean) => {
        uiPrefs.colorAssist = v;
        this.refillCards?.();
      },
      lang: (l: Lang) => {
        setLang(l);
        this.show(this.pageIndex);
      },
    });
  }

  override resize(w: number, h: number): void {
    this.bg.clear();
    drawFloor(this.bg, w, h);
    this.nav.position.set(0, game.safeTop);
    this.pageBar?.layout(w, h);
  }

  show(i: number): void {
    this.pageIndex = i;
    this.named.clear();
    this.pageBar = null;
    this.scrollView = null;
    this.refillCards = null;
    for (const c of this.host.removeChildren()) c.destroy({ children: true });
    this.navTitle.setText(`${i + 1}/${this.pages.length}  ${this.pages[i]?.title ?? ''}`);
    this.pages[i]?.build(this.host);
  }

  private where(name: string): { x: number; y: number } | null {
    const c = this.named.get(name);
    if (!c) return null;
    const p = toDesign(c.getGlobalPosition(new Point()));
    return { x: p.x, y: p.y };
  }

  private buildNav(): void {
    const prev = new IconButton({ icon: 'back', style: 'neutral', size: 64 });
    const next = new IconButton({ icon: 'play', style: 'info', size: 64 });
    prev.position.set(52, 52);
    next.position.set(game.w - 52, 52);
    prev.onTap(() => this.show((this.pageIndex + this.pages.length - 1) % this.pages.length));
    next.onTap(() => this.show((this.pageIndex + 1) % this.pages.length));
    this.navTitle.position.set(game.w / 2, 50);
    this.nav.addChild(this.navTitle, prev, next);
  }

  private top(): number {
    return game.safeTop + 112;
  }

  /** A caption on a sheet: soft ink, small. */
  private note(parent: Container, text: string, x: number, y: number): Text {
    const tx = uiLabel(text, { size: 20, color: Color.inkSoft });
    tx.position.set(x, y);
    parent.addChild(tx);
    return tx;
  }

  /** A caption lying directly on the wooden floor: light text with a brown stroke. */
  private floorNote(host: Container, text: string, x: number, y: number): void {
    const tx = artLabel(text, { size: 22 });
    tx.position.set(x, y);
    host.addChild(tx);
  }

  private mark(key: string, c: Container): void {
    this.named.set(key, c);
  }

  /** A cream sheet with a coloured title label; its `content` origin is the sheet's top-left. */
  private sheet(host: Container, title: string | undefined, y: number, h: number, extra: Partial<PanelOpts> = {}): Panel {
    const p = new Panel({ width: SHEET_W, height: h, title, ribbon: 'info', ...extra });
    p.position.set(game.w / 2, y + h / 2);
    host.addChild(p);
    return p;
  }

  private put<T extends Container>(parent: Container, node: T, x: number, y: number): T {
    node.position.set(x, y);
    parent.addChild(node);
    return node;
  }

  /* ------------------------------------------------------------ page 0 */

  private pageButtons(host: Container): void {
    let y = this.top() + 44;
    const pal = this.sheet(host, 'Palettes', y, 292);
    PALETTES.forEach(([style, label], i) => {
      const b = new Button({ label, style, width: 144, height: 84, fontSize: 32 });
      this.mark(style, b);
      this.put(pal.content, b, 91 + (i % 4) * 162, 84 + Math.floor(i / 4) * 112);
    });
    this.note(pal.content, 'coral = main, teal = info, cream = quiet, berry = careful', SHEET_W / 2, 262);
    y += 292 + 62;

    const cta = this.sheet(host, 'Call to action', y, 300, { tape: false });
    const big = new Button({ label: '출동', sublabel: 'Wave 12', style: 'primary', width: 470, height: 130, fontSize: 56, icon: 'play', tape: 'pink' });
    big.startPulse();
    this.mark('cta', big);
    this.put(cta.content, big, SHEET_W / 2, 94);
    const shineLoop = (): void => {
      if (big.destroyed) return;
      big.shine();
      this.tweens.call(2.4, shineLoop);
    };
    this.tweens.call(0.6, shineLoop);
    const ad = new Button({ label: 'Claim x2', sublabel: 'Watch ad', style: 'success', width: 316, height: 108, icon: 'ad' });
    const buy = new Button({ label: 'Buy', sublabel: '1,200', sublabelIcon: 'coin', style: 'info', width: 290, height: 108 });
    this.put(cta.content, ad, 25 + 158, 232);
    this.put(cta.content, buy, SHEET_W - 25 - 145, 232);
    y += 300 + 62;

    const fit = this.sheet(host, 'Long labels', y, 168);
    const fitA = new Button({ label: 'An extremely long English label', style: 'info', width: 300, height: 88, fontSize: 34 });
    const fitB = new Button({ label: '아주아주 긴 한국어 버튼 이름입니다', style: 'mustard', width: 300, height: 88, fontSize: 34 });
    this.put(fit.content, fitA, 25 + 150, 92);
    this.put(fit.content, fitB, SHEET_W - 25 - 150, 92);
    this.note(fit.content, 'shrinks to 70 %, then cuts with an ellipsis', SHEET_W / 2, 150);
  }

  /* ------------------------------------------------------------ page 1 */

  /** Hold a button down for the gallery: the same pointerdown the finger would send. */
  private hold(b: Button): void {
    b.emit('pointerdown', new FederatedPointerEvent(game.app.renderer.events.rootBoundary));
  }

  private pageStates(host: Container): void {
    let y = this.top() + 44;
    const st = this.sheet(host, 'States', y, 346);
    const cell = (i: number): { x: number; y: number } => ({ x: 120 + (i % 3) * 214, y: 76 + Math.floor(i / 3) * 140 });
    const normal = new Button({ label: 'Normal', style: 'primary', width: 196, height: 88, fontSize: 32 });
    const pressed = new Button({ label: 'Pressed', style: 'primary', width: 196, height: 88, fontSize: 32 });
    this.hold(pressed);
    const dis = new Button({ label: 'Locked', style: 'primary', width: 196, height: 88, enabled: false, fontSize: 32 });
    dis.onDisabledTap(() => toast('5레벨에 열려요', 'warning'));
    this.mark('disabled', dis);
    const busy = new Button({ label: 'Loading', style: 'info', width: 196, height: 88, fontSize: 32 });
    busy.setBusy(true);
    const badge = new Button({ label: 'Quests', style: 'neutral', width: 196, height: 88, badge: 3, fontSize: 32 });
    const fire = new Button({ label: 'Summon', style: 'danger', width: 196, height: 88, fireOnDown: true, fontSize: 32 });
    const counter = uiLabel('Taps: 0', { size: 22, color: Color.inkSoft });
    fire.onTap(() => {
      this.tapCount++;
      counter.text = `Taps: ${this.tapCount}`;
    });
    this.mark('fire', fire);
    const items: [Button, string][] = [
      [normal, 'normal'],
      [pressed, 'pressed (held)'],
      [dis, 'disabled: tap me'],
      [busy, 'busy'],
      [badge, 'badge'],
      [fire, 'fires on press'],
    ];
    items.forEach(([b, cap], i) => {
      const c = cell(i);
      this.put(st.content, b, c.x, c.y);
      this.note(st.content, cap, c.x, c.y + 70);
    });
    counter.position.set(cell(5).x, cell(5).y + 100);
    st.content.addChild(counter);
    y += 346 + 62;

    const ib = this.sheet(host, 'Icon buttons', y, 380);
    const glyphs: IconName[] = ['close', 'settings', 'sound_on', 'plus', 'info', 'home'];
    const styles: ButtonStyleId[] = ['neutral', 'info', 'primary', 'success', 'neutral', 'kraft'];
    glyphs.forEach((n, i) => {
      const b = new IconButton({ icon: n, style: styles[i] ?? 'neutral', size: 92, shape: 'round' });
      this.mark('ib_' + n, b);
      this.put(ib.content, b, 66 + i * 107, 84);
    });
    glyphs.forEach((n, i) => {
      const b = new IconButton({ icon: n, style: styles[(i + 3) % 6] ?? 'neutral', size: 88, shape: 'square' });
      this.put(ib.content, b, 66 + i * 107, 196);
    });
    const small: IconName[] = ['pause', 'fast_forward', 'question', 'check', 'back', 'minus'];
    small.forEach((n, i) => {
      const b = new IconButton({ icon: n, style: i % 2 ? 'success' : 'neutral', size: 64, shape: i < 3 ? 'round' : 'square' });
      this.put(ib.content, b, 66 + i * 107, 292);
    });
    this.note(ib.content, 'round / square / small, every one a paper cut-out', SHEET_W / 2, 348);
  }

  /* ------------------------------------------------------------ page 2 */

  private pagePopups(host: Container): void {
    const y0 = this.top() + 52;
    const makePanel = (variant: 'default' | 'light' | 'inset' | 'gold' | 'kraft', extra: Partial<PanelOpts>, cx: number, cy: number, note: string): void => {
      const p = new Panel({ width: 316, height: 180, variant, ribbon: 'info', ...extra });
      p.position.set(cx, cy);
      const tx = uiLabel(variant, { size: 30, color: p.textColor });
      tx.position.set(158, 80);
      const sub = uiLabel(note, { size: 20, color: p.dimTextColor });
      sub.position.set(158, 122);
      p.content.addChild(tx, sub);
      host.addChild(p);
    };
    makePanel('default', { title: 'Title', tape: 'sky', onClose: () => toast('Close pressed', 'info'), torn: 'bottom' }, 190, y0 + 110, 'torn edge, tape, close');
    makePanel('light', {}, 530, y0 + 100, 'plain ivory sheet');
    makePanel('inset', {}, 190, y0 + 330, 'recessed well');
    makePanel('gold', { title: 'Premium', ribbon: 'mustard' }, 530, y0 + 340, 'mustard backing');
    makePanel('kraft', { tape: 'yellow' }, 190, y0 + 560, 'kraft paper');
    makePanel('default', { torn: ['top', 'bottom'] }, 530, y0 + 560, 'torn both ends');

    const y = y0 + 700;
    const act = this.sheet(host, 'Popups and toasts', y, 340);
    const mk = (label: string, style: ButtonStyleId, fn: () => void, key: string, x: number, yy: number): void => {
      const b = new Button({ label, style, width: 196, height: 84, fontSize: 32 });
      b.onTap(fn);
      this.mark(key, b);
      this.put(act.content, b, x, yy);
    };
    mk('Confirm', 'success', () => this.openConfirm(false), 'confirm', 118, 70);
    mk('Delete?', 'danger', () => this.openConfirm(true), 'danger', 334, 70);
    mk('Alert', 'info', () => this.openAlert(), 'alert', 550, 70);
    mk('Rewards', 'primary', () => this.openRewards(false), 'rewards', 118, 168);
    mk('Rewards x2', 'purple', () => this.openRewards(true), 'rewards2', 334, 168);
    mk('Queue 3', 'neutral', () => this.queueThree(), 'queue', 550, 168);
    const kinds: ToastKind[] = ['info', 'success', 'warning', 'error'];
    const toastStyle: Record<ToastKind, ButtonStyleId> = { info: 'info', success: 'success', warning: 'mustard', error: 'danger' };
    kinds.forEach((k, i) => {
      const b = new Button({ label: k, style: toastStyle[k], width: 148, height: 72, fontSize: 26 });
      b.onTap(() => toast(k === 'error' ? '보석이 모자라요!' : k === 'warning' ? '3마리 더 잡으면 열려요' : k === 'success' ? 'Saved!' : '새 업데이트가 있어요', k));
      this.mark('toast_' + k, b);
      this.put(act.content, b, 90 + i * 163, 258);
    });
    this.note(act.content, 'tap to open', SHEET_W / 2, 310);
  }

  private openConfirm(danger: boolean): void {
    void confirmDialog({
      title: danger ? '냥이를 보낼까요?' : '소환할까요?',
      message: danger ? '모찌를 보내면 되돌릴 수 없어요. 코인 120개를 받아요.' : '생선 300개로 새 냥이를 소환해요.',
      confirmLabel: danger ? '보내기' : '소환',
      cancelLabel: '취소',
      danger,
    }).then((ok) => toast(ok ? 'Confirmed' : 'Cancelled', ok ? 'success' : 'info'));
  }

  private openAlert(): void {
    void alertDialog({ title: '알림', message: '서버 점검이 곧 시작돼요. 잠시 후 다시 접속해 주세요.', okLabel: '확인' });
  }

  private openRewards(double: boolean): void {
    void showRewards({
      title: '보상',
      subtitle: '20웨이브 클리어',
      rewards: [
        { icon: 'coin', amount: 1250, label: 'Coins', rarity: 'common' },
        { icon: 'gem', amount: 40, label: 'Gems', rarity: 'rare' },
        { icon: 'fish', amount: 300, label: 'Fish', rarity: 'epic' },
      ],
      claimLabel: '받기',
      doubleLabel: double ? '2배 받기' : undefined,
    }).then((c) => toast(`Chose: ${c}`, 'success'));
  }

  private queueThree(): void {
    for (let i = 1; i <= 3; i++) {
      void alertDialog({ title: `Popup ${i}`, message: `Queued popup number ${i} of 3. Close it to see the next one.`, okLabel: 'Next' });
    }
  }

  /* ------------------------------------------------------------ page 3 */

  private pageBars(host: Container): void {
    let y = this.top() + 44;
    const cur = this.sheet(host, 'Currency', y, 236);
    const topBar = new TopBar(
      [new CurrencyPill({ icon: 'energy', amount: 18, plus: true }), new CurrencyPill({ icon: 'coin', amount: 12450, plus: true }), new CurrencyPill({ icon: 'gem', amount: 320, plus: true })],
      { margin: 24, gap: 14 },
    );
    topBar.layout(SHEET_W);
    topBar.position.y = 30 - game.safeTop;
    cur.content.addChild(topBar);
    const coinPill = topBar.pills[1] as CurrencyPill;
    this.mark('coinpill', coinPill);
    const add = new Button({ label: '+5,000', style: 'success', width: 190, height: 70, fontSize: 30 });
    const spend = new Button({ label: 'Spend all', style: 'danger', width: 190, height: 70, fontSize: 30 });
    add.onTap(() => coinPill.setAmount(coinPill.amount + 5000));
    spend.onTap(() => (coinPill.amount > 0 ? coinPill.setAmount(0) : coinPill.shakeInsufficient()));
    this.put(cur.content, add, 200, 170);
    this.put(cur.content, spend, 468, 170);
    y += 236 + 62;

    const bars = this.sheet(host, 'Bars', y, 392);
    const xp = new ProgressBar({ width: 580, height: 40, color: 'gold', value: 0.7, format: (v) => `${Math.round(v * 100)}%` });
    this.mark('xp', xp);
    const seg = new ProgressBar({ width: 580, height: 40, color: 'green', value: 0.6, ticks: 5, icon: 'heart', label: '3/5' });
    const teal = new ProgressBar({ width: 580, height: 40, color: 'blue', value: 0.45, label: '준비해요  3초' });
    const boss = new ProgressBar({ width: 580, height: 44, color: 'red', value: 1, ghost: true, format: (v) => `${Math.round(v * 12000).toLocaleString('en-US')} / 12,000` });
    this.mark('boss', boss);
    this.put(bars.content, xp, SHEET_W / 2 + 14, 62);
    this.put(bars.content, seg, SHEET_W / 2 + 14, 132);
    this.put(bars.content, teal, SHEET_W / 2 + 14, 202);
    this.put(bars.content, boss, SHEET_W / 2 + 14, 272);
    const hit = new Button({ label: 'Hit boss', style: 'danger', width: 190, height: 66, fontSize: 28, fireOnDown: true });
    hit.onTap(() => boss.setValue(boss.value <= 0.1 ? 1 : boss.value - 0.22));
    this.mark('hit', hit);
    this.put(bars.content, hit, 560, 346);
    const ring = new CooldownRing({ radius: 46, thickness: 14, color: Color.teal, icon: 'swords' });
    const runRing = (): void => {
      if (ring.destroyed) return;
      ring.run(4, () => this.tweens.call(0.4, runRing));
    };
    runRing();
    this.put(bars.content, ring, 80, 340);
    const ring2 = new CooldownRing({ radius: 46, thickness: 14, color: Color.coral, label: '7' });
    ring2.setProgress(0.62);
    this.put(bars.content, ring2, 214, 340);
    y += 392 + 62;

    const ctl = this.sheet(host, 'Controls', y, 322);
    const tg1 = this.put(ctl.content, new Toggle({ value: true }), 96, 72);
    const tg2 = this.put(ctl.content, new Toggle({ value: false }), 236, 72);
    this.mark('toggle', tg1);
    this.mark('toggle_off', tg2);
    const slider = this.put(ctl.content, new Slider({ width: 340, value: 0.65 }), 480, 72);
    this.mark('slider', slider);
    this.put(ctl.content, new Stepper({ value: 3, min: 1, max: 9, width: 300 }), 190, 172);
    const stars = this.put(ctl.content, new Stars({ size: 84 }), 520, 180);
    void stars.setEarned(2, false);
    const replay = new Button({ label: 'Stars', style: 'mustard', width: 150, height: 60, fontSize: 26 });
    replay.onTap(() => {
      void stars.setEarned(0, false).then(() => stars.setEarned(3));
    });
    this.mark('stars_btn', replay);
    this.put(ctl.content, replay, 190, 252);
    this.note(ctl.content, 'toggle on / off, slider, stepper, rating stars', SHEET_W / 2, 296);
  }

  /* ------------------------------------------------------------ page 4 */

  private pagePaper(host: Container): void {
    let y = this.top() + 44;
    const shapes = this.sheet(host, 'Paper shapes', y, 350);
    const fills = [ButtonPalettes.neutral.base, Color.kraft, Color.teal, Color.coral, Color.mustard, Color.leaf];
    fills.forEach((f, i) => {
      const kind = i % 3 === 0 ? 'rect' : i % 3 === 1 ? 'pill' : 'circle';
      const piece = paperShape({ w: kind === 'circle' ? 96 : 150, h: kind === 'circle' ? 96 : 84, kind, fill: f, seed: 40 + i, grain: i === 0 });
      this.put(shapes.content, piece, 112 + (i % 3) * 222, 78 + Math.floor(i / 3) * 124);
    });
    const torn: [string, 'top' | 'bottom' | 'left' | 'right'][] = [['top', 'top'], ['bottom', 'bottom'], ['left', 'left'], ['right', 'right']];
    torn.forEach(([label, side], i) => {
      const piece = paperShape({ w: 128, h: 64, fill: Color.kraft, torn: side, seed: 70 + i, radius: 12, grain: false });
      this.put(shapes.content, piece, 86 + i * 165, 290);
      const tx = uiLabel(label, { size: 20, color: Color.ink });
      tx.position.set(86 + i * 165, 290);
      shapes.content.addChild(tx);
    });
    y += 350 + 56;

    const tape = this.sheet(host, 'Washi tape', y, 322);
    const names: TapeName[] = ['pink', 'sky', 'yellow', 'green'];
    const patterns: TapePattern[] = ['dots', 'gingham', 'stripes', 'plain'];
    names.forEach((n, r) => {
      patterns.forEach((p, c) => {
        const strip = tapeStrip({ name: n, pattern: p, w: 112, h: 36, angle: (r + c) % 2 === 0 ? -5 : 4, seed: r * 4 + c });
        this.put(tape.content, strip, 96 + c * 160, 60 + r * 58);
      });
    });
    this.note(tape.content, 'dots, gingham, stripes, plain', SHEET_W / 2, 296);
    y += 322 + 56;

    const lines = this.sheet(host, 'Lines and labels', y, 244);
    const g = new Graphics();
    drawDashedRect(g, 24, 28, 280, 108, { radius: 24, color: Color.teal });
    drawDashedLine(g, 340, 46, 640, 46, { color: Color.teal });
    drawDashedLine(g, 340, 76, 640, 76, { color: Color.coral, dash: 6, gap: 9, width: 3 });
    drawPaintFill(g, 340, 96, 250, 24, Color.mustard);
    drawPaintFill(g, 340, 128, 150, 24, Color.teal);
    lines.content.addChild(g);
    this.put(lines.content, new PaperLabel({ text: '준비해요', size: 30, paper: Color.kraft }), 120, 188);
    this.put(lines.content, new PaperLabel({ text: 'Torn label', size: 30, paper: 'primary', tape: 'sky' }), 340, 188);
    this.put(lines.content, new PaperLabel({ text: '낮은 곳', size: 30, paper: 'info', torn: 'bottom' }), 540, 188);
  }

  /* ------------------------------------------------------------ page 5 */

  private pageBubbles(host: Container): void {
    let y = this.top() + 44;
    const bub = this.sheet(host, 'Speech bubbles', y, 258);
    const bubble = new Graphics();
    drawSpeechBubble(bubble, 24, 24, 400, 96, { tail: { side: 'bottom', x: 90, len: 24, half: 14 } });
    drawSpeechBubble(bubble, 450, 36, 190, 70, { radius: 20, tail: { side: 'top', x: 150, len: 22, half: 12 } });
    drawSpeechBubble(bubble, 24, 160, 616, 54, { radius: 18, tail: { side: 'top', x: 500, len: 18, half: 11 } });
    bub.content.addChild(bubble);
    const bt = uiLabel('소환 등급을 올리면 좋은 고양이가 더 잘 나와요.', { size: 22, wrap: 360, lineHeight: 30 });
    bt.position.set(224, 72);
    const bt2 = uiLabel('hello!', { size: 24 });
    bt2.position.set(545, 71);
    const bt3 = uiLabel('Only here does the kit draw a dark line.', { size: 22 });
    bt3.position.set(332, 187);
    bub.content.addChild(bt, bt2, bt3);
    y += 258 + 62;

    const bits = this.sheet(host, 'Tags and badges', y, 252);
    const tags = [
      new Tag({ text: 'NEW', style: 'danger', shape: 'pill' }),
      new Tag({ text: 'BEST VALUE', style: 'primary', shape: 'flag' }),
      new Tag({ text: 'x2', style: 'success', shape: 'burst', tilt: -0.12 }),
      new Tag({ text: '-30%', style: 'mustard', shape: 'burst', tilt: 0.1 }),
    ];
    const tx = [70, 230, 410, 570];
    tags.forEach((tg, i) => this.put(bits.content, tg, tx[i] ?? 0, 92));
    const badgeIcons: IconName[] = ['mission', 'gift', 'cards', 'shop'];
    [true, 3, 28, 340].forEach((v, i) => {
      const c = new Container();
      const badge = new Badge({ value: v });
      badge.position.set(30, -28);
      c.addChild(drawIcon(badgeIcons[i] as IconName, 60), badge);
      this.put(bits.content, c, 80 + i * 110, 200);
    });
    this.put(bits.content, new Divider({ width: 560, label: 'Divider' }), SHEET_W / 2, 150);
    this.put(bits.content, new LoadingSpinner({ size: 56 }), 590, 214);
    y += 252 + 62;

    const sel = this.sheet(host, 'Selected and recommended', y, 190);
    const chosen = new Button({ label: 'Best pick', style: 'neutral', width: 250, height: 96, tape: 'yellow' });
    const plain = new Button({ label: 'Plain', style: 'neutral', width: 250, height: 96 });
    this.put(sel.content, plain, 170, 92);
    this.put(sel.content, chosen, 500, 92);
    this.note(sel.content, 'tape marks the chosen or recommended piece', SHEET_W / 2, 158);
  }

  /* ------------------------------------------------------------ page 6 */

  private pageCards(host: Container): void {
    const holder = new Container();
    host.addChild(holder);
    const seg = new SegmentTabs({
      tabs: [
        { id: 'small', label: 'Small' },
        { id: 'medium', label: 'Medium' },
        { id: 'large', label: 'Large' },
      ],
      width: 560,
    });
    seg.position.set(game.w / 2, this.top() + 20);
    host.addChild(seg);
    this.mark('seg', seg);
    const sample = (r: RarityId, size: CardSize, i: number): CardFrame => {
      const portrait = new Container();
      portrait.addChild(drawIcon((['paw', 'fish', 'shield', 'crown', 'star'] as IconName[])[i % 5] as IconName, 140));
      return new CardFrame({
        rarity: r,
        size,
        portrait,
        name: ['모찌', 'Mochi', '닌자', 'Lord Paw', '수호신'][i % 5],
        levelText: 'Lv.' + (i * 3 + 2),
        owned: [1, 4, 10, 6, 12][i % 5],
        needed: [2, 5, 10, 12, 12][i % 5],
        newTag: i === 1 || i === 4 ? 'NEW' : undefined,
      });
    };
    const fill = (size: CardSize): void => {
      for (const c of holder.removeChildren()) c.destroy({ children: true });
      const top = this.top() + 84;
      const lay = (cards: CardFrame[], cols: number, cw: number, ch: number, scale: number, y0: number): void => {
        cards.forEach((c, i) => {
          c.scale.set(scale);
          const col = i % cols;
          const row = Math.floor(i / cols);
          const rowN = Math.min(cols, cards.length - row * cols);
          c.position.set(game.w / 2 + (col - (rowN - 1) / 2) * cw, y0 + ch / 2 + row * ch);
          holder.addChild(c);
        });
      };
      if (size === 'small') {
        lay(RARITIES.map((r, i) => sample(r, 'small', i)), 3, 236, 316, 1.5, top + 16);
      } else if (size === 'medium') {
        lay(RARITIES.map((r, i) => sample(r, 'medium', i)), 3, 232, 330, 0.96, top + 6);
      } else {
        lay([sample('legendary', 'large', 3), sample('mythic', 'large', 4)], 2, 340, 470, 0.98, top + 20);
      }
      this.cardSize = size;
    };
    this.refillCards = (): void => fill(this.cardSize);
    fill('small');
    seg.onSelect((id) => fill(id as CardSize));
    this.floorNote(host, 'colour assist spells the rarity out', game.w / 2 - 80, game.h - 150 - game.safeBottom);
    const assist = new Toggle({ value: uiPrefs.colorAssist });
    assist.position.set(game.w / 2 + 200, game.h - 150 - game.safeBottom);
    assist.onChange((v) => {
      uiPrefs.colorAssist = v;
      this.refillCards?.();
    });
    this.mark('assist', assist);
    host.addChild(assist);
  }

  /* ------------------------------------------------------------ page 7 */

  private pageIcons(host: Container): void {
    const cols = 7;
    const cell = 100;
    const x0 = (game.w - cols * cell) / 2 + cell / 2;
    const y0 = this.top() + 44;
    ICON_NAMES.forEach((n, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const tile = paperShape({ w: 90, h: 92, fill: Color.paperLight, radius: 18, seed: 100 + i, grain: false });
      const ic = drawIcon(n, 56);
      ic.position.y = -10;
      const cap = uiLabel(n.replace(/_/g, ' '), { size: 20, color: Color.inkSoft });
      if (cap.width > 84) cap.scale.set(84 / cap.width);
      cap.position.y = 30;
      const c = new Container();
      c.addChild(tile, ic, cap);
      c.position.set(x0 + col * cell, y0 + row * (cell + 2));
      host.addChild(c);
      this.mark('icon_' + n, c);
    });
    const rows = Math.ceil(ICON_NAMES.length / cols);
    const bigY = y0 + rows * (cell + 2) + 70;
    for (const [i, n] of (['purr', 'laser', 'class_mage'] as const).entries()) {
      const big = paperShape({ w: 180, h: 150, fill: Color.paper, radius: 24, seed: 300 + i });
      big.position.set(game.w / 2 + (i - 1) * 216, bigY);
      const ic = drawIcon(n, 112);
      big.addChild(ic);
      host.addChild(big);
    }
  }

  /* ------------------------------------------------------------ page 8 */

  private pageScroll(host: Container): void {
    const top = this.top();
    const h = game.h - top - 40 - game.safeBottom;
    const well = new Graphics();
    drawPaper(well, 14, top - 8, { w: 692, h: h + 16, radius: 28, fill: Color.paperDim, shadow: 6, seed: 7 });
    const view = new ScrollView({ width: 680, height: h, padding: 8 });
    view.position.set(20, top);
    host.addChild(well, view);
    this.mark('scroll', view);
    this.scrollView = view;
    for (let i = 0; i < 30; i++) {
      const row = new Container();
      const card = new Graphics();
      drawPaper(card, 0, 0, { w: 640, h: 104, radius: 22, fill: i % 2 ? Color.paper : Color.paperLight, seed: 200 + i, shadow: 4, grain: false });
      const icon = drawIcon((['paw', 'fish', 'coin', 'gem', 'heart', 'star'] as IconName[])[i % 6] as IconName, 64);
      icon.position.set(60, 52);
      const tx = uiLabel(`Item ${i + 1}`, { size: 34, anchorX: 0 });
      tx.position.set(114, 38);
      const s = uiLabel(i % 3 === 0 ? 'Rare cat' : i % 3 === 1 ? '고양이 간식' : 'Wave reward', { size: 22, color: Color.inkSoft, anchorX: 0 });
      s.position.set(114, 74);
      const b = new Button({ label: 'Go', style: i % 4 === 0 ? 'success' : 'primary', width: 130, height: 68, fontSize: 30 });
      b.position.set(556, 48);
      b.onTap(() => toast(`Row ${i + 1} tapped`, 'info'));
      if (i === 0) this.mark('row0btn', b);
      row.addChild(card, icon, tx, s, b);
      row.position.set(8, i * 116);
      view.content.addChild(row);
    }
    view.refresh();
  }

  /* ------------------------------------------------------------ page 9 */

  private pageTabs(host: Container): void {
    const body = artLabel('battle', { size: 56 });
    body.position.set(game.w / 2, game.h * 0.62);
    host.addChild(body);
    const seg = new SegmentTabs({
      tabs: [
        { id: 'a', label: 'Daily' },
        { id: 'b', label: 'Weekly', badge: 2 },
        { id: 'c', label: 'Event' },
      ],
      width: 600,
    });
    seg.position.set(game.w / 2, this.top() + 30);
    host.addChild(seg);
    const holdMe = new IconButton({ icon: 'info', style: 'info', size: 88 });
    holdMe.position.set(game.w / 2, this.top() + 250);
    attachTooltip(holdMe, { title: '꾹 눌러 보세요', text: '아무 버튼이나 꾹 누르면 설명이 나와요. 화면 끝에서는 말풍선이 방향을 바꿔요.' });
    this.mark('tipbtn', holdMe);
    this.floorNote(host, 'hold the (i) button', game.w / 2, this.top() + 322);
    const edge = new IconButton({ icon: 'question', style: 'purple', size: 88 });
    edge.position.set(60, this.top() + 250);
    attachTooltip(edge, { text: '화면 가장자리에서도 꼬리는 나를 가리켜요.' });
    host.addChild(holdMe, edge);

    const bar = new TabBar({
      tabs: [
        { id: 'shop', label: 'Shop', icon: 'shop', badge: true },
        { id: 'cards', label: 'Cards', icon: 'cards' },
        { id: 'battle', label: 'Battle', icon: 'swords' },
        { id: 'quests', label: 'Quests', icon: 'mission', locked: true },
        { id: 'rank', label: 'Rank', icon: 'trophy', badge: 12 },
      ],
      selected: 'battle',
    });
    bar.onSelect((id) => {
      body.text = id;
    });
    bar.onLockedTap(() => toast('3판을 깨면 열려요', 'warning'));
    host.addChild(bar);
    this.mark('tabbar', bar);
    this.pageBar = bar;
  }

  /* ------------------------------------------------------------ page 10 */

  private pageOdds(host: Container): void {
    let y = this.top() + 44;
    const top = this.sheet(host, 'Pips and classes', y, 384);
    const pips = new RarityPips({ owned: [true, true, false, false, false], size: 30 });
    this.put(top.content, pips, 190, 70);
    this.mark('pips', pips);
    const next = new Button({ label: 'Next', style: 'info', width: 170, height: 72, fontSize: 30 });
    next.onTap(() => {
      const flags = pips.owned.slice();
      const i = flags.indexOf(false);
      if (i < 0) pips.set([false, false, false, false, false], false);
      else {
        flags[i] = true;
        pips.set(flags);
      }
    });
    this.mark('pips_next', next);
    this.put(top.content, next, 500, 70);
    const classes: [IconName, string, boolean[], number][] = [
      ['class_warrior', 'warrior', [true, true, true, false, false], 1],
      ['class_ranger', 'ranger', [true, false, false, false, false], 0],
      ['class_mage', 'mage', [true, true, true, true, false], 2],
      ['class_trickster', 'trickster', [true, true, true, true, true], 3],
    ];
    classes.forEach(([icon, id, owned, tier], i) => {
      const chip = new ClassChip({ icon, owned, tier });
      chip.onTap(() => chip.setTier((chip.tier + 1) % 4));
      attachTooltip(chip, () => ({ title: t('class.' + id + '.name'), text: `Synergy tier ${chip.tier} / 3` }));
      if (i === 1) chip.setSelected(true);
      this.mark('chip' + i, chip);
      this.put(top.content, chip, 150 + (i % 2) * 370, 176 + Math.floor(i / 2) * 106);
    });
    this.note(top.content, 'tap = next tier, hold = tooltip, tape = selected', SHEET_W / 2, 354);
    y += 384 + 62;

    const rows = ODDS.map(([rarity, value]) => ({ rarity, value }));
    const table = new OddsTable({ width: 620, rows, footnote: '10회 안에 골목대장 이상이 반드시 나와요. 등급이 나오면 보장 횟수는 처음부터 다시 세요.' });
    const oddsSheet = this.sheet(host, 'Odds', y, table.tableHeight + 48);
    this.put(oddsSheet.content, table, 24, 24);
    this.mark('odds', table);
    y += table.tableHeight + 48 + 36;

    const replay = new Button({ label: 'Reveal', style: 'primary', width: 200, height: 84, fontSize: 32 });
    const full = new Button({ label: 'Full screen', style: 'mustard', width: 260, height: 84, fontSize: 32 });
    const lang = new Button({ label: getLang() === 'ko' ? 'EN' : 'KO', style: 'neutral', width: 120, height: 84, fontSize: 32 });
    replay.onTap(() => table.setRows(rows, true));
    full.onTap(() => this.openScaffold());
    lang.onTap(() => {
      const nextLang: Lang = getLang() === 'ko' ? 'en' : 'ko';
      setLang(nextLang);
      lang.setLabel(nextLang === 'ko' ? 'EN' : 'KO');
      this.show(this.pageIndex);
    });
    this.mark('reveal', replay);
    this.mark('full', full);
    this.mark('lang', lang);
    this.put(host, replay, 150, y + 44);
    this.put(host, full, 400, y + 44);
    this.put(host, lang, 600, y + 44);
  }

  /* ------------------------------------------------------------ page 11 */

  /** The approved battle mock, rebuilt from kit parts only (no cats): the page to hold next to uistyle_paper.png. */
  private pageBattle(host: Container): void {
    const sy = this.top() - 8;
    const cx = game.w / 2;
    const pause = this.put(host, new IconButton({ icon: 'pause', style: 'neutral', size: 92 }), 64, sy + 50);
    this.mark('pause', pause);
    this.put(host, paperShape({ w: 470, h: 58, radius: 10, fill: Color.paper, torn: ['right'], seed: 31 }), 352, sy + 48);
    this.put(host, drawIcon('skull', 84), 168, sy + 46);
    this.put(host, uiLabel('0/60', { size: 40 }), 370, sy + 48);
    this.put(host, new IconButton({ icon: 'play', style: 'info', size: 92 }), game.w - 64, sy + 50);
    this.put(host, new PaperLabel({ text: '준비해요', size: 26, paper: Color.paper, padX: 22, padY: 7 }), 100, sy + 116);
    this.put(host, new ProgressBar({ width: 290, height: 38, color: 'blue', value: 0.55, label: '3초' }), 176, sy + 164);
    const reserve = this.put(host, paperShape({ w: 112, h: 76, radius: 16, fill: Color.paper, seed: 33 }), 400, sy + 158);
    this.put(reserve, drawIcon('energy', 52), -22, -2);
    this.put(reserve, uiLabel('x12', { size: 26 }), 28, 12);

    const top = sy + 214;
    const bh = 548;
    const board = new Graphics();
    drawPaper(board, cx - 332, top, { w: 664, h: bh, radius: 36, fill: Color.paperLight, seed: 35 });
    drawDashedRect(board, cx - 332 + 14, top + 14, 664 - 28, bh - 28, { radius: 26, color: Color.teal, width: 4 });
    host.addChild(board);
    const sprites: Record<string, IconName> = { '0,0': 'class_ranger', '4,0': 'class_warrior', '2,1': 'class_mage', '1,3': 'class_ranger' };
    for (let r = 0; r < 4; r++) {
      for (let col = 0; col < 5; col++) {
        const x = cx + (col - 2) * 122;
        const y = top + 38 + 55 + r * 125;
        this.put(host, paperShape({ w: 108, h: 112, radius: 20, fill: Color.paperDim, seed: 40 + r * 5 + col, grain: false, shadow: false, wobble: 0.7 }), x, y);
        const icon = sprites[col + ',' + r];
        if (icon) this.put(host, drawIcon(icon, 74), x, y - 4);
      }
    }
    this.put(host, tapeStrip({ name: 'sky', w: 120, h: 30, angle: 0, pattern: 'dots', seed: 8 }), cx, top + 2);

    const trayTop = game.h - game.safeBottom - 408;
    this.put(host, paperShape({ w: game.w + 60, h: 460, radius: 0, fill: Color.paper, torn: 'top', seed: 52 }), cx, trayTop + 230);
    const chips: [IconName, boolean[], number][] = [
      ['class_warrior', [true, true, true, false, false], 1],
      ['class_ranger', [true, true, false, false, false], 0],
      ['class_mage', [true, true, true, true, false], 2],
      ['class_trickster', [true, false, false, false, false], 0],
    ];
    const tapes: TapeName[] = ['pink', 'sky', 'yellow', 'green'];
    chips.forEach(([icon, owned, tier], i) => {
      const x = 94 + i * 177;
      this.put(host, new ClassChip({ icon, owned, tier }), x, trayTop + 62);
      this.put(host, tapeStrip({ name: tapes[i] ?? 'pink', w: 52, h: 20, angle: i % 2 === 0 ? -18 : 16, pattern: i % 2 === 0 ? 'dots' : 'gingham', seed: 60 + i }), x - 50, trayTop + 22);
    });
    this.put(host, new CurrencyPill({ icon: 'fish', amount: 16, width: 280 }), 170, trayTop + 150);
    this.put(host, new CurrencyPill({ icon: 'heart', amount: 0, width: 280 }), 470, trayTop + 150);
    const pct = this.put(host, new IconButton({ icon: 'info', style: 'info', size: 92 }), 650, trayTop + 150);
    this.mark('pct', pct);
    const tip = new Graphics();
    drawSpeechBubble(tip, 28, trayTop + 196, 470, 96, { tail: { side: 'bottom', x: 96, len: 22, half: 13 } });
    host.addChild(tip);
    this.put(host, uiLabel('소환 등급을 올리면 좋은 고양이가 더 잘 나와요.', { size: 22, wrap: 410, lineHeight: 30 }), 263, trayTop + 244);
    this.put(host, new Button({ label: 'Lv.1', sublabel: '60', sublabelIcon: 'fish', icon: 'arrow_up', style: 'neutral', width: 196, height: 112, fontSize: 40 }), 118, trayTop + 350);
    const summon = this.put(host, new Button({ label: '소환', sublabel: '36', sublabelIcon: 'fish', style: 'primary', width: 360, height: 128, fontSize: 60, tape: 'pink' }), 396, trayTop + 346);
    this.mark('summon', summon);
    this.put(host, new IconButton({ icon: 'target', style: 'info', size: 118 }), 640, trayTop + 346);
  }

  /** A full screen with inline rewarded-ad card, odds and an action bar: the replacement for stacked popups. */
  private openScaffold(): void {
    if (this.scaffold) return;
    const sc = new ScreenScaffold({ title: 'Free Gems', onBack: () => this.closeScaffold(), actionBarHeight: 148 });
    const w = sc.contentWidth;
    const card = new Panel({ width: w, height: 230, variant: 'gold' });
    card.position.set(w / 2, 115);
    const icon = drawIcon('gem', 120);
    icon.position.set(110, 100);
    const head = uiLabel('Watch a short ad', { size: 36, anchorX: 0 });
    head.position.set(200, 52);
    const sub = uiLabel('+30 gems, once an hour', { size: 26, color: Color.inkSoft, anchorX: 0 });
    sub.position.set(200, 94);
    const watch = new Button({ label: 'Watch', sublabel: '+30', sublabelIcon: 'gem', icon: 'ad', style: 'success', width: 300, height: 92, fontSize: 36 });
    watch.position.set(w - 190, 160);
    watch.onTap(() => {
      watch.setBusy(true);
      this.tweens.call(1.2, () => {
        if (!watch.destroyed) watch.setBusy(false);
      });
    });
    card.content.addChild(icon, head, sub, watch);
    const odds = new OddsTable({
      width: w,
      rows: ODDS.map(([rarity, value]) => ({ rarity, value })),
      footnote: 'Pity: an Alley Boss or better is guaranteed within 10 draws.',
    });
    odds.position.set(0, 260);
    sc.content.addChild(card, odds);
    for (let i = 0; i < 12; i++) {
      const row = new Container();
      const rowBg = new Graphics();
      drawPaper(rowBg, 0, 0, { w, h: 90, radius: 22, fill: i % 2 ? Color.paper : Color.paperLight, seed: 500 + i, shadow: 4, grain: false });
      const lbl = uiLabel(`Daily offer ${i + 1}`, { size: 30, anchorX: 0 });
      lbl.position.set(28, 45);
      row.addChild(rowBg, lbl);
      row.position.set(0, 260 + odds.tableHeight + 24 + i * 106);
      sc.content.addChild(row);
    }
    sc.refresh();
    const claim = new Button({ label: 'Claim all', style: 'primary', width: 380, height: 112, fontSize: 42, tape: 'sky' });
    claim.onTap(() => toast('Claimed', 'success'));
    sc.actionBar.addChild(claim);
    const gems = new CurrencyPill({ icon: 'gem', amount: 320, width: 190 });
    sc.addTitleAction(gems);
    this.addChild(sc);
    this.scaffold = sc;
    void sc.show();
  }

  private closeScaffold(): void {
    const sc = this.scaffold;
    if (!sc) return;
    this.scaffold = null;
    void sc.hide().then(() => sc.destroy({ children: true }));
  }
}
