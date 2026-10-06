import { Container, Graphics, Point } from 'pixi.js';
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
import { grid, hstack, toDesign } from '@/ui/layout';
import { motion } from '@/ui/motion';
import { OddsTable } from '@/ui/OddsTable';
import { Panel } from '@/ui/Panel';
import { popups } from '@/ui/Popup';
import { uiPrefs } from '@/ui/prefs';
import { RarityPips } from '@/ui/RarityPips';
import { ScreenScaffold } from '@/ui/ScreenScaffold';
import { CooldownRing, ProgressBar } from '@/ui/ProgressBar';
import { ScrollView } from '@/ui/ScrollView';
import { vGradient } from '@/ui/shapes';
import { SegmentTabs, TabBar } from '@/ui/TabBar';
import { Tag } from '@/ui/Tag';
import { uiLabel } from '@/ui/text';
import { Color, RARITY_ORDER, type RarityId } from '@/ui/theme';
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

/** Gallery of every UI component: ?demo=ui&page=N. */
export default class UiDemo extends Scene {
  private readonly bg = new Graphics();
  private readonly host = new Container();
  private readonly nav = new Container();
  private readonly named = new Map<string, Container>();
  private pageIndex = 0;
  private navTitle = uiLabel('', { size: 32 });
  private tapCount = 0;
  private pageBar: TabBar | null = null;
  private scrollView: ScrollView | null = null;
  private cardSize: CardSize = 'small';
  private refillCards: (() => void) | null = null;
  private scaffold: ScreenScaffold | null = null;

  private readonly pages: PageDef[] = [
    { title: 'Buttons', build: (h) => this.pageButtons(h) },
    { title: 'Panels / Popups', build: (h) => this.pagePopups(h) },
    { title: 'Bars / Controls', build: (h) => this.pageBars(h) },
    { title: 'Card frames', build: (h) => this.pageCards(h) },
    { title: 'Icons', build: (h) => this.pageIcons(h) },
    { title: 'Scroll list', build: (h) => this.pageScroll(h) },
    { title: 'Tab bar', build: (h) => this.pageTabs(h) },
    { title: 'Odds / Classes', build: (h) => this.pageOdds(h) },
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
    this.bg.clear().rect(0, 0, w, h).fill(vGradient(0x33206a, 0x150d2c));
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
    this.navTitle.text = `${i + 1}/${this.pages.length}  ${this.pages[i]?.title ?? ''}`;
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

  private caption(host: Container, text: string, x: number, y: number): void {
    const t = uiLabel(text, { size: 22, color: Color.textDim, stroke: Color.outline, strokeWidth: 4, shadow: false });
    t.position.set(x, y);
    host.addChild(t);
  }

  private mark(key: string, c: Container): void {
    this.named.set(key, c);
  }

  /* ------------------------------------------------------------ page 0 */

  private pageButtons(host: Container): void {
    let y = this.top();
    this.caption(host, 'six styles', game.w / 2, y);
    y += 24;
    const styles = [
      ['primary', '플레이'],
      ['success', 'Claim'],
      ['info', 'Info'],
      ['danger', 'Delete'],
      ['neutral', 'Later'],
      ['purple', 'Summon'],
    ] as const;
    const btns = styles.map(([s, l]) => {
      const b = new Button({ label: l, style: s, width: 210, height: 96 });
      this.mark(s, b);
      return b;
    });
    btns.forEach((b) => host.addChild(b));
    const g = grid(btns, { cols: 3, gapX: 22, gapY: 20, x: (game.w - (210 * 3 + 44)) / 2, y });
    y += g.h + 26;

    this.caption(host, 'call to action (pulse + shine), sublabel, price', game.w / 2, y);
    y += 24;
    const cta = new Button({ label: 'START RUN', sublabel: 'Wave 12', style: 'primary', width: 470, height: 130, fontSize: 52, icon: 'play' });
    cta.startPulse();
    this.mark('cta', cta);
    cta.position.set(game.w / 2, y + 65);
    host.addChild(cta);
    const shineLoop = (): void => {
      if (cta.destroyed) return;
      cta.shine();
      this.tweens.call(2.4, shineLoop);
    };
    this.tweens.call(0.6, shineLoop);
    y += 156;

    const ad = new Button({ label: 'Claim x2', sublabel: 'Watch ad', style: 'success', width: 330, height: 116, icon: 'ad' });
    const buy = new Button({ label: 'Buy', sublabel: '1,200', sublabelIcon: 'coin', style: 'info', width: 290, height: 116 });
    host.addChild(ad, buy);
    hstack([ad, buy], { gap: 24, x: (game.w - 644) / 2, y });
    y += 144;

    this.caption(host, 'states: disabled (tap me) / busy / badge / fire-on-down', game.w / 2, y);
    y += 24;
    const dis = new Button({ label: 'Locked', style: 'primary', width: 164, height: 96, enabled: false, fontSize: 32 });
    dis.onDisabledTap(() => toast('Reach level 5 to unlock', 'warning'));
    this.mark('disabled', dis);
    const busy = new Button({ label: 'Loading', style: 'info', width: 164, height: 96, fontSize: 32 });
    busy.setBusy(true);
    const badge = new Button({ label: 'Quests', style: 'purple', width: 164, height: 96, badge: 3, fontSize: 32 });
    const counter = uiLabel('Taps: 0', { size: 30 });
    const fire = new Button({ label: 'Summon', style: 'danger', width: 164, height: 96, fireOnDown: true, fontSize: 32 });
    fire.onTap(() => {
      this.tapCount++;
      counter.text = `Taps: ${this.tapCount}`;
    });
    this.mark('fire', fire);
    host.addChild(dis, busy, badge, fire);
    hstack([dis, busy, badge, fire], { gap: 14, x: (game.w - (164 * 4 + 42)) / 2, y });
    counter.position.set(game.w / 2, y + 120);
    host.addChild(counter);
    y += 150;

    this.caption(host, 'icon buttons: round / square / small', game.w / 2, y);
    y += 24;
    const icons: IconName[] = ['close', 'settings', 'sound_on', 'plus', 'info', 'home'];
    const ibs: IconButton[] = icons.map((n, i) => {
      const ib = new IconButton({ icon: n, style: styles[i]?.[0] ?? 'info', size: 88, shape: i % 2 === 0 ? 'round' : 'square' });
      this.mark('ib_' + n, ib);
      return ib;
    });
    ibs.forEach((b) => host.addChild(b));
    hstack(ibs, { gap: 18, x: (game.w - (88 * 6 + 90)) / 2, y });
    y += 124;
    const small = (['pause', 'fast_forward', 'question', 'check'] as IconName[]).map((n, i) => new IconButton({ icon: n, style: i % 2 ? 'success' : 'neutral', size: 64, shape: i < 2 ? 'round' : 'square' }));
    small.forEach((b) => host.addChild(b));
    hstack(small, { gap: 20, x: (game.w - (64 * 4 + 60)) / 2, y });
    y += 86;
    this.caption(host, 'long labels shrink to fit (never below 70%), then truncate', game.w / 2, y);
    y += 22;
    const fitA = new Button({ label: 'An extremely long English label', style: 'info', width: 330, height: 88, fontSize: 34 });
    const fitB = new Button({ label: '아주아주 긴 한국어 버튼 이름입니다', style: 'purple', width: 330, height: 88, fontSize: 34 });
    host.addChild(fitA, fitB);
    hstack([fitA, fitB], { gap: 20, x: (game.w - 680) / 2, y });
  }

  /* ------------------------------------------------------------ page 1 */

  private pagePopups(host: Container): void {
    const y0 = this.top() + 56;
    const makePanel = (variant: 'default' | 'light' | 'inset' | 'gold', title: string | undefined, cx: number, cy: number): void => {
      const p = new Panel({ width: 320, height: 250, variant, title, onClose: variant === 'default' ? () => toast('Close pressed', 'info') : undefined });
      p.position.set(cx, cy);
      const t = uiLabel(variant, { size: 30, color: p.textColor, stroke: variant === 'light' ? false : Color.outline, shadow: false });
      t.position.set(160, 135);
      const sub = uiLabel('panel variant', { size: 22, color: p.dimTextColor, stroke: false });
      sub.position.set(160, 175);
      p.content.addChild(t, sub);
      host.addChild(p);
    };
    makePanel('default', 'Title', 190, y0 + 135);
    makePanel('light', undefined, 530, y0 + 125);
    makePanel('inset', undefined, 190, y0 + 435);
    makePanel('gold', 'Premium', 530, y0 + 445);

    let y = y0 + 640;
    this.caption(host, 'dialogs and popups (tap to open)', game.w / 2, y);
    y += 24;
    const mk = (label: string, style: 'primary' | 'success' | 'info' | 'danger' | 'purple' | 'neutral', fn: () => void, key: string): Button => {
      const b = new Button({ label, style, width: 210, height: 92, fontSize: 34 });
      b.onTap(fn);
      this.mark(key, b);
      host.addChild(b);
      return b;
    };
    const row1 = [
      mk('Confirm', 'success', () => this.openConfirm(false), 'confirm'),
      mk('Delete?', 'danger', () => this.openConfirm(true), 'danger'),
      mk('Alert', 'info', () => this.openAlert(), 'alert'),
    ];
    grid(row1, { cols: 3, gapX: 22, x: (game.w - (210 * 3 + 44)) / 2, y });
    y += 112;
    const row2 = [
      mk('Rewards', 'primary', () => this.openRewards(false), 'rewards'),
      mk('Rewards x2', 'purple', () => this.openRewards(true), 'rewards2'),
      mk('Queue 3', 'neutral', () => this.queueThree(), 'queue'),
    ];
    grid(row2, { cols: 3, gapX: 22, x: (game.w - (210 * 3 + 44)) / 2, y });
    y += 130;
    this.caption(host, 'toasts', game.w / 2, y);
    y += 24;
    const kinds: ToastKind[] = ['info', 'success', 'warning', 'error'];
    const toasts = kinds.map((k) => {
      const b = new Button({ label: k, style: k === 'info' ? 'info' : k === 'success' ? 'success' : k === 'warning' ? 'primary' : 'danger', width: 160, height: 84, fontSize: 28 });
      b.onTap(() => toast(k === 'error' ? 'Not enough gems!' : k === 'warning' ? '3 more kills to unlock' : k === 'success' ? 'Saved!' : '새 업데이트가 있어요', k));
      this.mark('toast_' + k, b);
      host.addChild(b);
      return b;
    });
    hstack(toasts, { gap: 18, x: (game.w - (160 * 4 + 54)) / 2, y });
  }

  private openConfirm(danger: boolean): void {
    void confirmDialog({
      title: danger ? 'Release cat?' : 'Summon',
      message: danger ? 'Selling Mochi cannot be undone. You will get 120 coins.' : 'Spend 300 fish to summon a new cat?',
      confirmLabel: danger ? 'Sell' : 'Summon',
      cancelLabel: 'Cancel',
      danger,
    }).then((ok) => toast(ok ? 'Confirmed' : 'Cancelled', ok ? 'success' : 'info'));
  }

  private openAlert(): void {
    void alertDialog({ title: 'Notice', message: '서버 점검이 곧 시작돼요. 잠시 후 다시 접속해 주세요.', okLabel: 'OK' });
  }

  private openRewards(double: boolean): void {
    void showRewards({
      title: 'Rewards',
      subtitle: 'Wave 20 cleared',
      rewards: [
        { icon: 'coin', amount: 1250, label: 'Coins', rarity: 'common' },
        { icon: 'gem', amount: 40, label: 'Gems', rarity: 'rare' },
        { icon: 'fish', amount: 300, label: 'Fish', rarity: 'epic' },
      ],
      claimLabel: 'Claim',
      doubleLabel: double ? 'Claim x2' : undefined,
    }).then((c) => toast(`Chose: ${c}`, 'success'));
  }

  private queueThree(): void {
    for (let i = 1; i <= 3; i++) {
      void alertDialog({ title: `Popup ${i}`, message: `Queued popup number ${i} of 3. Close it to see the next one.`, okLabel: 'Next' });
    }
  }

  /* ------------------------------------------------------------ page 2 */

  private pageBars(host: Container): void {
    let y = this.top() - 4;
    const topBar = new TopBar([
      new CurrencyPill({ icon: 'energy', amount: 18, plus: true }),
      new CurrencyPill({ icon: 'coin', amount: 12450, plus: true }),
      new CurrencyPill({ icon: 'gem', amount: 320, plus: true }),
    ]);
    topBar.position.y = y - game.safeTop - 8;
    host.addChild(topBar);
    const coinPill = topBar.pills[1] as CurrencyPill;
    this.mark('coinpill', coinPill);
    const add = new Button({ label: '+5,000', style: 'success', width: 190, height: 70, fontSize: 30 });
    add.position.set(110, y + 128);
    add.onTap(() => coinPill.setAmount(coinPill.amount + 5000));
    const spend = new Button({ label: 'Spend all', style: 'danger', width: 190, height: 70, fontSize: 30 });
    spend.position.set(320, y + 128);
    spend.onTap(() => (coinPill.amount > 0 ? coinPill.setAmount(0) : coinPill.shakeInsufficient()));
    host.addChild(add, spend);
    y += 188;

    const xp = new ProgressBar({ width: 620, height: 40, color: 'gold', value: 0.7, format: (v) => `${Math.round(v * 100)}%`, shine: true });
    xp.position.set(game.w / 2, y);
    this.mark('xp', xp);
    const seg = new ProgressBar({ width: 620, height: 40, color: 'green', value: 0.6, ticks: 5, icon: 'heart', label: '3/5' });
    seg.position.set(game.w / 2, y + 66);
    const boss = new ProgressBar({ width: 620, height: 44, color: 'red', value: 1, ghost: true, format: (v) => `${Math.round(v * 12000).toLocaleString('en-US')} / 12,000` });
    boss.position.set(game.w / 2, y + 136);
    this.mark('boss', boss);
    host.addChild(xp, seg, boss);
    const hit = new Button({ label: 'Hit boss', style: 'danger', width: 190, height: 66, fontSize: 28, fireOnDown: true });
    hit.position.set(540, y + 216);
    hit.onTap(() => boss.setValue(boss.value <= 0.1 ? 1 : boss.value - 0.22));
    this.mark('hit', hit);
    const ring = new CooldownRing({ radius: 46, thickness: 14, color: 0x4da6ff, icon: 'swords' });
    ring.position.set(150, y + 228);
    const runRing = (): void => {
      if (ring.destroyed) return;
      ring.run(4, () => this.tweens.call(0.4, runRing));
    };
    runRing();
    host.addChild(ring, hit);
    const ring2 = new CooldownRing({ radius: 46, thickness: 14, color: 0xff7a3a, label: '7', trackColor: 0x2d1f5c });
    ring2.position.set(290, y + 228);
    ring2.setProgress(0.62);
    host.addChild(ring2);
    y += 330;

    const tg1 = new Toggle({ value: true });
    const tg2 = new Toggle({ value: false });
    const slider = new Slider({ width: 380, value: 0.65 });
    this.mark('slider', slider);
    tg1.position.set(96, y);
    tg2.position.set(236, y);
    slider.position.set(510, y);
    host.addChild(tg1, tg2, slider);
    y += 112;

    const stepper = new Stepper({ value: 3, min: 1, max: 9, width: 300 });
    stepper.position.set(190, y);
    host.addChild(stepper);
    const stars = new Stars({ size: 84 });
    stars.position.set(535, y + 14);
    host.addChild(stars);
    const replay = new Button({ label: 'Stars', style: 'primary', width: 150, height: 60, fontSize: 26 });
    replay.position.set(190, y + 86);
    replay.onTap(() => {
      void stars.setEarned(0, false).then(() => stars.setEarned(3));
    });
    this.mark('stars_btn', replay);
    host.addChild(replay);
    void stars.setEarned(2, false);
    y += 196;

    const tags = [
      new Tag({ text: 'NEW', style: 'danger', shape: 'pill' }),
      new Tag({ text: 'BEST VALUE', style: 'primary', shape: 'flag' }),
      new Tag({ text: 'x2', style: 'success', shape: 'burst', tilt: -0.12 }),
      new Tag({ text: '-30%', style: 'purple', shape: 'burst', tilt: 0.1 }),
    ];
    tags.forEach((t) => host.addChild(t));
    hstack(tags, { gap: 34, x: 40, y: y - 40 });
    y += 120;

    const badgeIcons: IconName[] = ['mission', 'gift', 'cards', 'shop'];
    [true, 3, 28, 340].forEach((v, i) => {
      const c = new Container();
      c.addChild(drawIcon(badgeIcons[i] as IconName, 60), new Badge({ value: v }));
      (c.children[1] as Badge).position.set(30, -28);
      c.position.set(66 + i * 96, y);
      host.addChild(c);
    });
    const div = new Divider({ width: 280, label: 'Divider' });
    div.position.set(570, y - 14);
    const spin = new LoadingSpinner({ size: 64 });
    spin.position.set(570, y + 50);
    host.addChild(div, spin);
  }

  /* ------------------------------------------------------------ page 3 */

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
      const ic = drawIcon((['paw', 'fish', 'shield', 'crown', 'star'] as IconName[])[i % 5] as IconName, 140);
      portrait.addChild(ic);
      return new CardFrame({
        rarity: r,
        size,
        portrait,
        name: ['Mochi', '모찌', 'Ninja', 'Lord Paw', 'Mythic'][i % 5],
        levelText: 'Lv.' + (i * 3 + 2),
        owned: [1, 4, 10, 6, 12][i % 5],
        needed: [2, 5, 10, 12, 12][i % 5],
        newTag: i === 1 || i === 4 ? 'NEW' : undefined,
      });
    };
    const fill = (size: CardSize): void => {
      for (const c of holder.removeChildren()) c.destroy({ children: true });
      const top = this.top() + 84;
      if (size === 'small') {
        const place = (order: RarityId[], offset: number, y: number): number => {
          const row = order.map((r, i) => sample(r, 'small', i + offset));
          row.forEach((c) => {
            c.scale.set(0.8);
            holder.addChild(c);
          });
          return hstack(row, { gap: 4, x: (game.w - 5 * 133 - 16) / 2, y }).h;
        };
        const h1 = place(RARITIES, 0, top);
        place([...RARITIES].reverse(), 2, top + h1 + 10);
      } else if (size === 'medium') {
        const cards = RARITIES.map((r, i) => sample(r, 'medium', i));
        cards.forEach((c) => {
          c.scale.set(0.9);
          holder.addChild(c);
        });
        grid(cards, { cols: 3, gapX: 6, gapY: 6, x: (game.w - 3 * 218 - 12) / 2, y: top });
      } else {
        const cards = [sample('legendary', 'large', 3), sample('mythic', 'large', 4)];
        cards.forEach((c) => {
          c.scale.set(0.94);
          holder.addChild(c);
        });
        hstack(cards, { gap: 2, x: (game.w - 2 * 331 - 2) / 2, y: top + 10 });
      }
      this.cardSize = size;
    };
    this.refillCards = (): void => fill(this.cardSize);
    fill('small');
    seg.onSelect((id) => fill(id as CardSize));
    this.caption(host, 'colour assist (spells the rarity out)', game.w / 2 - 60, game.h - 150 - game.safeBottom);
    const assist = new Toggle({ value: uiPrefs.colorAssist });
    assist.position.set(game.w / 2 + 190, game.h - 150 - game.safeBottom);
    assist.onChange((v) => {
      uiPrefs.colorAssist = v;
      this.refillCards?.();
    });
    this.mark('assist', assist);
    host.addChild(assist);
  }

  /* ------------------------------------------------------------ page 4 */

  private pageIcons(host: Container): void {
    const cols = 7;
    const cell = 100;
    const x0 = (game.w - cols * cell) / 2 + cell / 2;
    const y0 = this.top() + 44;
    ICON_NAMES.forEach((n, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const tile = new Graphics();
      tile.roundRect(-46, -46, 92, 92, 20).fill(vGradient(0x6a56b6, 0x4a3a8c)).stroke({ width: 4, color: Color.outline, alignment: 1 });
      const ic = drawIcon(n, 60);
      ic.position.y = -8;
      const cap = uiLabel(n.replace(/_/g, ' '), { size: 20, color: 0xffffff, strokeWidth: 4, shadow: false });
      if (cap.width > 88) cap.scale.set(88 / cap.width);
      cap.position.y = 32;
      const c = new Container();
      c.addChild(tile, ic, cap);
      c.position.set(x0 + col * cell, y0 + row * (cell + 4));
      host.addChild(c);
      this.mark('icon_' + n, c);
    });
    const rows = Math.ceil(ICON_NAMES.length / cols);
    const bigY = y0 + rows * (cell + 4) + 80;
    for (const [i, n] of (['purr', 'laser', 'class_mage'] as const).entries()) {
      const big = drawIcon(n, 150);
      big.position.set(game.w / 2 + (i - 1) * 200, bigY);
      host.addChild(big);
    }
  }

  /* ------------------------------------------------------------ page 5 */

  private pageScroll(host: Container): void {
    const top = this.top();
    const view = new ScrollView({ width: 680, height: game.h - top - 40 - game.safeBottom, padding: 8 });
    view.position.set(20, top);
    const frame = new Graphics();
    frame.roundRect(14, top - 6, 692, view.viewHeight + 12, 28).fill({ color: 0x000000, alpha: 0.28 });
    host.addChild(frame, view);
    this.mark('scroll', view);
    this.scrollView = view;
    for (let i = 0; i < 30; i++) {
      const row = new Container();
      const bgR = new Graphics();
      bgR.roundRect(0, 0, 660, 104, 24).fill(vGradient(i % 2 ? 0x45357f : 0x3b2c6e, i % 2 ? 0x2f2358 : 0x2a1f52)).stroke({ width: 4, color: Color.outline, alignment: 1 });
      const icon = drawIcon((['paw', 'fish', 'coin', 'gem', 'heart', 'star'] as IconName[])[i % 6] as IconName, 64);
      icon.position.set(60, 52);
      const t = uiLabel(`Item ${i + 1}`, { size: 34, anchorX: 0 });
      t.position.set(114, 38);
      const s = uiLabel(i % 3 === 0 ? 'Rare cat' : i % 3 === 1 ? '고양이 간식' : 'Wave reward', { size: 22, color: Color.textDim, stroke: false, anchorX: 0 });
      s.position.set(114, 74);
      const b = new Button({ label: 'Go', style: i % 4 === 0 ? 'success' : 'primary', width: 130, height: 68, fontSize: 30 });
      b.position.set(580, 48);
      b.onTap(() => toast(`Row ${i + 1} tapped`, 'info'));
      if (i === 0) this.mark('row0btn', b);
      row.addChild(bgR, icon, t, s, b);
      row.position.set(0, i * 116);
      view.content.addChild(row);
    }
    view.refresh();
  }

  /* ------------------------------------------------------------ page 6 */

  private pageTabs(host: Container): void {
    const body = uiLabel('battle', { size: 56 });
    body.position.set(game.w / 2, game.h * 0.36);
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
    holdMe.position.set(game.w / 2, this.top() + 200);
    attachTooltip(holdMe, { title: 'Hold tooltip', text: 'Press and hold any element to read more about it. The bubble flips when near the screen edge.' });
    this.mark('tipbtn', holdMe);
    const cap = uiLabel('hold the (i) button', { size: 22, color: Color.textDim, stroke: false });
    cap.position.set(game.w / 2, this.top() + 270);
    host.addChild(holdMe, cap);
    const edge = new IconButton({ icon: 'question', style: 'purple', size: 88 });
    edge.position.set(60, this.top() + 200);
    attachTooltip(edge, { text: 'Near the left edge: the arrow still points at me.' });
    host.addChild(edge);

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
    bar.onLockedTap(() => toast('Clear run 3 to unlock', 'warning'));
    host.addChild(bar);
    this.mark('tabbar', bar);
    this.pageBar = bar;
  }

  /* ------------------------------------------------------------ page 7 */

  private pageOdds(host: Container): void {
    let y = this.top() + 2;
    this.caption(host, 'RarityPips: lit = owned, hollow = missing', game.w / 2, y);
    y += 50;
    const pips = new RarityPips({ owned: [true, true, false, false, false], size: 30 });
    pips.position.set(game.w / 2 - 110, y);
    this.mark('pips', pips);
    const next = new Button({ label: 'Next', style: 'info', width: 170, height: 76, fontSize: 30 });
    next.position.set(game.w / 2 + 190, y - 2);
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
    host.addChild(pips, next);
    y += 62;

    this.caption(host, 'ClassChip: tap = next synergy tier, hold = tooltip', game.w / 2, y);
    y += 58;
    const classes: [IconName, string, boolean[], number][] = [
      ['class_warrior', 'warrior', [true, true, true, false, false], 1],
      ['class_ranger', 'ranger', [true, false, false, false, false], 0],
      ['class_mage', 'mage', [true, true, true, true, false], 2],
      ['class_trickster', 'trickster', [true, true, true, true, true], 3],
    ];
    const chips = classes.map(([icon, id, owned, tier], i) => {
      const chip = new ClassChip({ icon, owned, tier });
      chip.onTap(() => chip.setTier((chip.tier + 1) % 4));
      attachTooltip(chip, () => ({ title: t('class.' + id + '.name'), text: `Synergy tier ${chip.tier} / 3` }));
      this.mark('chip' + i, chip);
      host.addChild(chip);
      return chip;
    });
    grid(chips, { cols: 2, gapX: 28, gapY: 18, x: (game.w - (168 * 2 + 28)) / 2, y: y - 38 });
    y += 178;

    this.caption(host, 'OddsTable with a pity footnote', game.w / 2, y);
    y += 24;
    const rows = ODDS.map(([rarity, value]) => ({ rarity, value }));
    const table = new OddsTable({
      width: 660,
      rows,
      footnote: '10회 안에 골목대장 이상이 반드시 나와요. 등급이 나오면 보장 횟수는 처음부터 다시 세요.',
    });
    table.position.set((game.w - 660) / 2, y);
    this.mark('odds', table);
    host.addChild(table);
    y += table.tableHeight + 36;

    const replay = new Button({ label: 'Reveal', style: 'primary', width: 200, height: 84, fontSize: 32 });
    const full = new Button({ label: 'Full screen', style: 'purple', width: 260, height: 84, fontSize: 32 });
    const lang = new Button({ label: getLang() === 'ko' ? 'EN' : 'KO', style: 'neutral', width: 120, height: 84, fontSize: 32 });
    replay.onTap(() => table.setRows(rows, true));
    full.onTap(() => this.openScaffold());
    lang.onTap(() => {
      const next: Lang = getLang() === 'ko' ? 'en' : 'ko';
      setLang(next);
      lang.setLabel(next === 'ko' ? 'EN' : 'KO');
      this.show(this.pageIndex);
    });
    this.mark('reveal', replay);
    this.mark('full', full);
    this.mark('lang', lang);
    host.addChild(replay, full, lang);
    hstack([replay, full, lang], { gap: 22, x: (game.w - (200 + 260 + 120 + 44)) / 2, y: y });
    y += 124;
    this.caption(host, 'wrapped labels: Korean breaks at spaces, English at words', game.w / 2, y);
    const ko = uiLabel('이 문장은 어절 단위로 줄바꿈되어야 해요. 긴 설명도 읽기 편하게 이어져요.', { size: 28, wrap: 320, lineHeight: 40, stroke: Color.outline, strokeWidth: 4, shadow: false });
    const en = uiLabel('Wrapped English text breaks between words, never in the middle of one.', { size: 28, wrap: 320, lineHeight: 40, stroke: Color.outline, strokeWidth: 4, shadow: false });
    ko.position.set(190, y + 40 + ko.height / 2);
    en.position.set(530, y + 40 + en.height / 2);
    host.addChild(ko, en);
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
    const sub = uiLabel('+30 gems, once an hour', { size: 26, color: 0xcabfee, anchorX: 0, stroke: Color.outline, shadow: false });
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
      rowBg.roundRect(0, 0, w, 90, 22).fill(vGradient(i % 2 ? 0x45357f : 0x3b2c6e, 0x2a1f52)).stroke({ width: 4, color: Color.outline, alignment: 1 });
      const lbl = uiLabel(`Daily offer ${i + 1}`, { size: 30, anchorX: 0 });
      lbl.position.set(28, 45);
      row.addChild(rowBg, lbl);
      row.position.set(0, 260 + odds.tableHeight + 24 + i * 106);
      sc.content.addChild(row);
    }
    sc.refresh();
    const claim = new Button({ label: 'Claim all', style: 'primary', width: 380, height: 112, fontSize: 42 });
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
