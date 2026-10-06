import { Container, Graphics, Point } from 'pixi.js';
import { Scene } from '@/core/scene';
import { uiTweens } from '@/core/tween';
import { game } from '@/core/game';
import { debugExpose } from '@/core/debug';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { CardFrame, type CardSize } from '@/ui/CardFrame';
import { Divider, LoadingSpinner, Stars } from '@/ui/Decor';
import { IconButton } from '@/ui/IconButton';
import { ICON_NAMES, drawIcon, type IconName } from '@/ui/icons';
import { grid, hstack, toDesign } from '@/ui/layout';
import { Panel } from '@/ui/Panel';
import { popups } from '@/ui/Popup';
import { CooldownRing, ProgressBar } from '@/ui/ProgressBar';
import { ScrollView } from '@/ui/ScrollView';
import { vGradient } from '@/ui/shapes';
import { SegmentTabs, TabBar } from '@/ui/TabBar';
import { Tag } from '@/ui/Tag';
import { uiLabel } from '@/ui/text';
import { Color, type RarityId } from '@/ui/theme';
import { toast, type ToastKind } from '@/ui/Toast';
import { CurrencyPill, TopBar } from '@/ui/CurrencyPill';
import { Slider, Stepper, Toggle } from '@/ui/controls';
import { attachTooltip } from '@/ui/Tooltip';
import { alertDialog, confirmDialog } from '@/ui/dialogs';
import { showRewards } from '@/ui/RewardPopup';

interface PageDef {
  title: string;
  build: (host: Container) => void;
}

const RARITIES: RarityId[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

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

  private readonly pages: PageDef[] = [
    { title: 'Buttons', build: (h) => this.pageButtons(h) },
    { title: 'Panels / Popups', build: (h) => this.pagePopups(h) },
    { title: 'Bars / Controls', build: (h) => this.pageBars(h) },
    { title: 'Card frames', build: (h) => this.pageCards(h) },
    { title: 'Icons', build: (h) => this.pageIcons(h) },
    { title: 'Scroll list', build: (h) => this.pageScroll(h) },
    { title: 'Tab bar', build: (h) => this.pageTabs(h) },
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
      scrollTo: (y: number, animated: boolean) => this.scrollView?.scrollTo(y, animated),
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
      const top = this.top() + 90;
      if (size === 'small') {
        const row1 = RARITIES.map((r, i) => sample(r, 'small', i));
        row1.forEach((c) => c.scale.set(0.86));
        row1.forEach((c) => holder.addChild(c));
        const g = hstack(row1, { gap: 8, x: (game.w - (150 * 0.86 * 5 + 32)) / 2, y: top });
        const row2 = [...RARITIES].reverse().map((r, i) => sample(r, 'small', i + 2));
        row2.forEach((c) => c.scale.set(0.86));
        row2.forEach((c) => holder.addChild(c));
        hstack(row2, { gap: 8, x: (game.w - (150 * 0.86 * 5 + 32)) / 2, y: top + g.h + 30 });
      } else if (size === 'medium') {
        const cards = RARITIES.map((r, i) => sample(r, 'medium', i));
        cards.forEach((c) => holder.addChild(c));
        grid(cards, { cols: 3, gapX: 20, gapY: 28, x: (game.w - (220 * 3 + 40)) / 2, y: top });
      } else {
        const cards = [sample('legendary', 'large', 3), sample('mythic', 'large', 4)];
        cards.forEach((c) => holder.addChild(c));
        hstack(cards, { gap: 24, x: (game.w - (320 * 2 + 24)) / 2, y: top + 10 });
      }
    };
    fill('small');
    seg.onSelect((id) => fill(id as CardSize));
  }

  /* ------------------------------------------------------------ page 4 */

  private pageIcons(host: Container): void {
    const cols = 6;
    const cell = 112;
    const x0 = (game.w - cols * cell) / 2 + cell / 2;
    const y0 = this.top() + 56;
    ICON_NAMES.forEach((n, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const tile = new Graphics();
      tile.roundRect(-52, -52, 104, 104, 22).fill(vGradient(0x6a56b6, 0x4a3a8c)).stroke({ width: 4, color: Color.outline, alignment: 1 });
      const ic = drawIcon(n, 70);
      ic.position.y = -6;
      const cap = uiLabel(n.replace('_', ' '), { size: 20, color: 0xffffff, strokeWidth: 4, shadow: false });
      if (cap.width > 98) cap.scale.set(98 / cap.width);
      cap.position.y = 36;
      const c = new Container();
      c.addChild(tile, ic, cap);
      c.position.set(x0 + col * cell, y0 + row * (cell + 14));
      host.addChild(c);
      this.mark('icon_' + n, c);
    });
    const big = drawIcon('reroll', 220);
    big.position.set(game.w / 2, y0 + 7 * (cell + 14) + 130);
    host.addChild(big);
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
}
