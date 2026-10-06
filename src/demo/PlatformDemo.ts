import { Container, Graphics, Rectangle, type Text } from 'pixi.js';
import { Scene } from '@/core/scene';
import { game } from '@/core/game';
import { debugExpose } from '@/core/debug';
import { label } from '@/ui/text';
import { Color } from '@/ui/theme';
import {
  AD_PLACEMENT_IDS,
  GLOBAL_AD_RULES,
  PLATFORM_ID,
  ads,
  analytics,
  getBootResult,
  getPauseState,
  iap,
  initPlatform,
  platform,
  submitScore,
  type IapProductDef,
  type RewardedOutcome,
} from '@/platform';

/**
 * Platform QA scene: ?demo=platform  (add &adfast=1 for 0.3 s ads, &adfail=1, &iapfail=1, &iapcrash=1,
 * &skip=1 to start past the first-run guards, &keep=1 to keep the saved ad counters).
 * Every button is a plain Graphics + label (no UI kit). Helpers are exposed on window.__dbg.platform.
 */

/** Prices follow GDD 8.3; the KRW amounts are VAT included, multiples of 11 (pricing.ts). */
const PRODUCTS: IapProductDef[] = [
  {
    id: 'starter_pack',
    type: 'nonConsumable',
    name: { ko: '스타터 팩', en: 'Starter Pack' },
    price: { ko: '₩3,300', en: '$2.99' },
    prices: { toss: { currency: 'KRW', amount: 3300 } },
  },
  {
    id: 'butler_pass',
    type: 'nonConsumable',
    name: { ko: '집사 패스', en: 'Butler Pass' },
    price: { ko: '₩9,900', en: '$7.99' },
    prices: { toss: { currency: 'KRW', amount: 9900 } },
  },
  {
    id: 'gems_680',
    type: 'consumable',
    name: { ko: '보석 680개', en: '680 Gems' },
    price: { ko: '₩5,500', en: '$4.99' },
    prices: { toss: { currency: 'KRW', amount: 5500 } },
  },
];

type Kind = 'primary' | 'neutral' | 'success' | 'info' | 'danger';
const FACE: Record<Kind, { face: number; lip: number }> = {
  primary: { face: Color.primary, lip: Color.primaryDark },
  neutral: { face: Color.neutral, lip: Color.neutralDark },
  success: { face: Color.success, lip: Color.successDark },
  info: { face: Color.info, lip: Color.infoDark },
  danger: { face: Color.danger, lip: Color.dangerDark },
};

type Item = [id: string, title: string, kind: Kind, onTap: () => void | Promise<void>, sub?: string];

const LEFT = 30;
const WIDTH = 660;
const ROW_H = 96; // touch targets stay >= 96 design units (research 03 section 3.2)
const GAP = 12;
const LOG_LINES = 5;
const LOG_LINE_H = 29;
const SCORE_BOARD = 'demo_board';

interface Btn {
  id: string;
  view: Container;
  face: Graphics;
  title: Text;
  sub: Text | null;
  w: number;
  h: number;
  cx: number;
  cy: number;
  kind: Kind;
}

export default class PlatformDemo extends Scene {
  private readonly bg = new Graphics();
  private readonly buttons = new Map<string, Btn>();
  /** Placement buttons in AD_PLACEMENT_IDS order, so the poll below never looks anything up. */
  private readonly placementButtons: Btn[] = [];
  private readonly offerFlags = new Uint8Array(AD_PLACEMENT_IDS.length);
  private stateText!: Text;
  private logTextNode!: Text;
  private readonly logs: string[] = [];
  private readonly granted: Array<{ productId: string; orderId: string; replay: boolean; source: string }> = [];
  private readonly revoked: Array<{ productId: string; orderId: string; wasGranted: boolean }> = [];
  private readonly rewards: Record<string, number> = {};
  private taps = 0;
  private dirty = true;
  private alive = true;
  private score = 100;
  private readonly t0 = performance.now();
  private sysPaused = false;

  override async enter(): Promise<void> {
    this.addChild(this.bg);
    await initPlatform();

    const q = new URLSearchParams(location.search);
    if (!q.has('keep')) ads.resetCounters();
    if (q.has('skip')) ads.qaSetProgress({ sessions: 2, runsBegun: 2, runsCompleted: 3 });

    const issues = iap.registerProducts(PRODUCTS);
    // The game's one grant function. It must be idempotent on orderId; the demo keeps a list instead.
    iap.setGrantHandler((productId, orderId, ctx) => {
      this.granted.push({ productId, orderId, replay: ctx.replay, source: ctx.source });
      if (productId === 'butler_pass') ads.setAdFree(true);
      this.log(`GRANT ${productId} #${orderId.slice(-6)} (${ctx.source}${ctx.replay ? ', replay' : ''})`);
    });
    iap.setRevokeHandler((productId, orderId, ctx) => {
      this.revoked.push({ productId, orderId, wasGranted: ctx.wasGranted });
      if (productId === 'butler_pass') ads.setAdFree(false);
      this.log(`REVOKE ${productId} #${orderId.slice(-6)} (granted here: ${ctx.wasGranted})`);
    });

    this.buildUi();
    this.refresh();
    this.exposeDebug();
    this.log(`ready: adapter=${platform.id} boot=${getBootResult()} priceIssues=${issues.length}`);
  }

  override exit(): void {
    this.alive = false;
    // The handlers capture this scene: unhook them before it is destroyed.
    iap.setGrantHandler(null);
    iap.setRevokeHandler(null);
    ads.setAdFree(false);
    debugExpose('platform', undefined);
  }

  override resize(w: number, h: number): void {
    this.bg.clear().rect(0, 0, w, h).fill(Color.bg);
    this.bg.rect(0, 0, w, 150).fill({ color: Color.panelDark, alpha: 0.6 });
  }

  override update(): void {
    // Poll the offer flags without allocating; rebuild the texts only when one flipped or an action ran.
    for (let i = 0; i < AD_PLACEMENT_IDS.length; i++) {
      const on = ads.canOffer(AD_PLACEMENT_IDS[i] as string) ? 1 : 0;
      if (this.offerFlags[i] !== on) {
        this.offerFlags[i] = on;
        this.dirty = true;
      }
    }
    if (this.dirty) this.refresh();
  }

  // ----- UI ---------------------------------------------------------------------------------

  private text(s: string, size: number, x: number, y: number, color: number = Color.text, anchorX = 0.5): Text {
    const t = label(s, { size, color, stroke: false, shadow: false, anchorX, anchorY: 0.5, align: anchorX === 0 ? 'left' : 'center' });
    t.position.set(x, y);
    this.addChild(t);
    return t;
  }

  private button(id: string, x: number, y: number, w: number, h: number, item: Item): Btn {
    const [, title, kind, onTap, sub] = item;
    const view = new Container();
    view.position.set(x, y);
    const face = new Graphics();
    view.addChild(face);
    const t = label(title, { size: sub !== undefined ? 26 : 28, stroke: Color.outline, strokeWidth: 4, shadow: false });
    t.position.set(w / 2, sub !== undefined ? h * 0.36 : h / 2);
    view.addChild(t);
    let s: Text | null = null;
    if (sub !== undefined) {
      s = label(sub, { size: 22, color: Color.white, stroke: false, shadow: false });
      s.alpha = 0.85;
      s.position.set(w / 2, h * 0.72);
      view.addChild(s);
    }
    view.eventMode = 'static';
    view.cursor = 'pointer';
    view.hitArea = new Rectangle(0, 0, w, h);
    const btn: Btn = { id, view, face, title: t, sub: s, w, h, cx: x + w / 2, cy: y + h / 2, kind };
    this.drawFace(btn, false);
    view.on('pointerdown', () => this.drawFace(btn, true));
    view.on('pointerup', () => this.drawFace(btn, false));
    view.on('pointerupoutside', () => this.drawFace(btn, false));
    view.on('pointertap', () => {
      this.taps++;
      void Promise.resolve(onTap()).catch((e: unknown) => this.log('ERR ' + String(e)));
    });
    this.addChild(view);
    this.buttons.set(id, btn);
    return btn;
  }

  /** One row of equal-width buttons starting at y; returns the y of the next row. */
  private row(y: number, items: Item[]): number {
    const w = (WIDTH - (items.length - 1) * GAP) / items.length;
    items.forEach((item, i) => this.button(item[0], LEFT + i * (w + GAP), y, w, ROW_H, item));
    return y + ROW_H + GAP;
  }

  private drawFace(b: Btn, pressed: boolean): void {
    const c = FACE[b.kind];
    const dy = pressed ? 4 : 0;
    b.face
      .clear()
      .roundRect(0, 6, b.w, b.h - 6, 20)
      .fill(c.lip)
      .roundRect(0, dy, b.w, b.h - 6, 20)
      .fill(c.face)
      .stroke({ width: 4, color: Color.outline });
    b.title.y = (b.sub ? b.h * 0.36 : b.h / 2 - 3) + dy;
    if (b.sub) b.sub.y = b.h * 0.72 + dy - 3;
  }

  private buildUi(): void {
    const top = game.safeTop;
    this.text('Platform demo', 44, game.w / 2, top + 40, Color.primary);
    this.stateText = this.text('', 22, game.w / 2, top + 88, Color.textDim);
    this.text(`build=${PLATFORM_ID}  ?adfast ?adfail ?iapfail ?iapcrash ?skip ?keep`, 20, game.w / 2, top + 118, Color.textDim);

    let y = top + 150;
    this.text('RUN', 22, LEFT, y + 8, Color.textDim, 0);
    y = this.row(y + 28, [
      ['begin_run', 'Begin run', 'info', () => this.act('beginRun', () => ads.beginRun())],
      ['end_win', 'End: win', 'success', () => this.act('endRun(victory)', () => ads.endRun('victory'))],
      ['end_lose', 'End: defeat', 'danger', () => this.act('endRun(defeat)', () => ads.endRun('defeat'))],
      ['toggle_adfree', 'Ad-free: off', 'neutral', () => this.toggleAdFree()],
    ]);
    y = this.row(y, [
      ['reset', 'Reset ads', 'neutral', () => this.act('resetCounters', () => ads.resetCounters())],
      [
        'skip',
        'Skip FTUE',
        'neutral',
        () => this.act('qaSetProgress', () => ads.qaSetProgress({ sessions: 2, runsBegun: 2, runsCompleted: 3 })),
      ],
      ['sys_pause', 'Sys pause', 'neutral', () => this.sysPause(true)],
      ['sys_resume', 'Sys resume', 'neutral', () => this.sysPause(false)],
    ]);

    this.text('REWARDED PLACEMENTS', 22, LEFT, y + 8, Color.textDim, 0);
    y += 28;
    for (let i = 0; i < AD_PLACEMENT_IDS.length; i += 3) {
      const ids = AD_PLACEMENT_IDS.slice(i, i + 3);
      y = this.row(
        y,
        ids.map((p): Item => [`rw:${p}`, p, 'primary', () => this.rewarded(p), '']),
      );
    }
    for (const p of AD_PLACEMENT_IDS) {
      const b = this.buttons.get(`rw:${p}`);
      if (b) this.placementButtons.push(b);
    }

    this.text('INTERSTITIAL / ORDERS / IAP', 22, LEFT, y + 8, Color.textDim, 0);
    y += 28;
    y = this.row(y, [
      ['interstitial', 'Interstitial', 'info', () => this.interstitial()],
      ['why', 'Why blocked?', 'neutral', () => this.why()],
      ['score', 'Submit score', 'neutral', () => this.submit()],
    ]);
    y = this.row(y, [
      ['restore', 'Restore', 'neutral', () => this.restore()],
      ['refund', 'Refund last', 'neutral', () => this.refund()],
      ['new_device', 'New device', 'neutral', () => this.newDevice()],
    ]);
    y = this.row(
      y,
      PRODUCTS.map((p): Item => [`buy:${p.id}`, p.id, 'success', () => this.buy(p.id), '']),
    );

    this.text('LOG', 22, LEFT, y + 6, Color.textDim, 0);
    this.logTextNode = label('', {
      size: 21,
      stroke: false,
      shadow: false,
      align: 'left',
      anchorX: 0,
      anchorY: 0,
      lineHeight: LOG_LINE_H,
      wrap: WIDTH,
    });
    this.logTextNode.position.set(LEFT, y + 24);
    this.addChild(this.logTextNode);
  }

  // ----- actions ----------------------------------------------------------------------------

  private async rewarded(p: string): Promise<void> {
    const before = this.snapshotFlags();
    const outcome: RewardedOutcome = await ads.showRewarded(p);
    if (outcome === 'rewarded') this.rewards[p] = (this.rewards[p] ?? 0) + 1; // the caller grants, not AdService
    this.log(`${p} -> ${outcome}  (was ${before})`);
    this.dirty = true;
  }

  private async interstitial(): Promise<void> {
    const shown = await ads.showInterstitial('demo_break');
    this.log(`interstitial -> ${shown ? 'shown' : 'not shown'}`);
    this.dirty = true;
  }

  private why(): void {
    const v = ads.canShowInterstitial();
    this.log('interstitial policy: ' + (v.ok ? 'OK' : 'blocked: ' + v.why));
  }

  private async submit(): Promise<void> {
    this.score += 25;
    await submitScore(SCORE_BOARD, this.score);
    this.log(`submitScore(${SCORE_BOARD}, ${this.score}) -> ${platform.capabilities.leaderboard ? 'sent' : 'no board here'}`);
  }

  private async buy(id: string): Promise<void> {
    const outcome = await iap.purchase(id);
    this.log(`buy ${id} -> ${outcome}`);
    this.dirty = true;
  }

  private async restore(): Promise<void> {
    const r = await iap.restorePurchases();
    this.log(`restore -> ok=${r.ok} granted=${r.granted} revoked=${r.revoked}${r.reason ? ' ' + r.reason : ''}`);
    this.dirty = true;
  }

  private async refund(): Promise<void> {
    const id = (await platform.debug?.['refundLast']?.()) as string | undefined;
    this.log(id ? `store refunded #${id.slice(-6)}` : 'nothing to refund');
    if (id) await this.restore();
  }

  /** Forget the order ledger and reload: the boot restore must re-grant what the store lists as completed. */
  private async newDevice(): Promise<void> {
    await platform.storage.remove('platform.iap.ledger.v1');
    location.reload();
  }

  private act(name: string, fn: () => void): void {
    fn();
    this.log(name);
    this.dirty = true;
  }

  private toggleAdFree(): void {
    ads.setAdFree(!ads.adFree);
    this.log(`ad-free ${ads.adFree ? 'ON' : 'OFF'}`);
    this.dirty = true;
  }

  private sysPause(paused: boolean): void {
    const trigger = platform.debug?.[paused ? 'triggerPause' : 'triggerResume'];
    if (trigger) trigger();
    this.sysPaused = paused;
    this.log(paused ? 'platform onPause' : 'platform onResume');
    this.dirty = true;
  }

  // ----- status -----------------------------------------------------------------------------

  private snapshotFlags(): string {
    const p = getPauseState();
    return `paused=${p.pausedDepth} muted=${p.mutedDepth} visible=${game.visible}`;
  }

  private refresh(): void {
    if (!this.alive) return;
    this.dirty = false;
    const c = ads.counters;
    const p = getPauseState();
    this.stateText.text =
      `adFree ${ads.adFree ? 'ON' : 'off'} · runs ${c.runsBegun}/${c.runsCompleted} · sess ${c.sessions} · ` +
      `ads ${c.adsToday}/${GLOBAL_AD_RULES.maxRewardedPerDay} · paused ${p.pausedDepth} muted ${p.mutedDepth}`;
    const adFreeBtn = this.buttons.get('toggle_adfree');
    if (adFreeBtn) adFreeBtn.title.text = ads.adFree ? 'Ad-free: ON' : 'Ad-free: off';
    for (let i = 0; i < AD_PLACEMENT_IDS.length; i++) {
      const b = this.placementButtons[i];
      if (!b?.sub) continue;
      const st = ads.status(AD_PLACEMENT_IDS[i] as string);
      const rem = st.remaining === Infinity ? '∞' : String(st.remaining);
      b.sub.text = `left ${rem} · ${st.reason}`;
      b.view.alpha = st.canOffer ? 1 : 0.55;
    }
    for (const prod of PRODUCTS) {
      const b = this.buttons.get(`buy:${prod.id}`);
      if (!b?.sub) continue;
      b.sub.text = iap.isAvailable(prod.id) ? iap.priceText(prod.id) : 'unavailable';
      b.view.alpha = iap.isAvailable(prod.id) ? 1 : 0.55;
    }
    this.logTextNode.text = this.logs.join('\n');
  }

  private log(s: string): void {
    if (!this.alive) return;
    const sec = ((performance.now() - this.t0) / 1000).toFixed(1).padStart(5, ' ');
    this.logs.push(`${sec}s ${s}`);
    while (this.logs.length > LOG_LINES) this.logs.shift();
    this.logTextNode.text = this.logs.join('\n');
  }

  private exposeDebug(): void {
    debugExpose('platform', {
      demo: this,
      ads,
      iap,
      analytics,
      platform,
      /** Design-space centre + size of a button, for synthetic taps. */
      rect: (id: string) => {
        const b = this.buttons.get(id);
        return b ? { x: b.cx, y: b.cy, w: b.w, h: b.h } : null;
      },
      ids: () => [...this.buttons.keys()],
      log: () => this.logs.slice(),
      granted: () => this.granted.slice(),
      revoked: () => this.revoked.slice(),
      rewards: () => ({ ...this.rewards }),
      taps: () => this.taps,
      /** Everything the Aside runner needs to prove "paused and muted behind the overlay". */
      state: () => ({
        ...getPauseState(),
        gameVisible: game.visible,
        tickerStarted: game.app.ticker.started,
        adFree: ads.adFree,
        modalBusy: ads.busy,
        sysPaused: this.sysPaused,
        // Only the dev adapter has an overlay: elsewhere these read undefined.
        overlayOpen: platform.debug?.['overlayOpen']?.(),
        overlayLeftovers: platform.debug?.['overlayLeftovers']?.(),
        counters: ads.counters,
        ledger: iap.ledgerSnapshot(),
      }),
      status: (p: string) => ads.status(p),
    });
  }
}
