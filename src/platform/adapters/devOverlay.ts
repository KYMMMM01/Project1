/**
 * Dev mock UI: DOM overlays above the canvas (not PixiJS) for the fake rewarded ad, the fake
 * interstitial and the fake purchase sheet. Styled like the game (deep purple panels, yellow primary
 * button, rounded, 'GameLatin'/'GameKR' from index.html). Buttons are at least 44 CSS px tall.
 * The overlay traps pointer/keyboard events so nothing underneath can be tapped, and removes itself,
 * its style element, its listeners and its timers completely when it closes.
 * Only the dev adapter imports this file, so it never reaches another platform's build.
 */
import { addStrings, t } from '@/core/i18n';

addStrings('ko', {
  'platform.ad.title': '광고 (테스트)',
  'platform.ad.rewardedSub': '보상형 광고 · {placement}',
  'platform.ad.wait': '{s}초 뒤에 보상을 받을 수 있어요',
  'platform.ad.done': '시청 완료! 보상을 받아가세요',
  'platform.ad.claim': '보상 받기',
  'platform.ad.close': '닫기 (보상 없음)',
  'platform.ad.interstitialTitle': '전면 광고 (테스트)',
  'platform.ad.interstitialSub': '{placement}',
  'platform.ad.autoClose': '{s}초 뒤에 자동으로 닫혀요',
  'platform.iap.sheetTitle': '테스트 결제',
  'platform.iap.pay': '테스트 결제',
  'platform.iap.cancel': '취소',
  'platform.iap.note': '실제 결제는 일어나지 않아요',
  'platform.iap.failed': '결제에 실패했어요 (테스트)',
  'platform.iap.crash': '결제 직후 앱이 종료된 것으로 가정해요 (복구 테스트)',
});
addStrings('en', {
  'platform.ad.title': 'Ad (test)',
  'platform.ad.rewardedSub': 'Rewarded ad · {placement}',
  'platform.ad.wait': 'Reward available in {s}s',
  'platform.ad.done': 'Finished! Claim your reward',
  'platform.ad.claim': 'Claim reward',
  'platform.ad.close': 'Close (no reward)',
  'platform.ad.interstitialTitle': 'Interstitial (test)',
  'platform.ad.interstitialSub': '{placement}',
  'platform.ad.autoClose': 'Closes automatically in {s}s',
  'platform.iap.sheetTitle': 'Test purchase',
  'platform.iap.pay': 'Test purchase',
  'platform.iap.cancel': 'Cancel',
  'platform.iap.note': 'No real payment is made',
  'platform.iap.failed': 'Payment failed (test)',
  'platform.iap.crash': 'Pretending the app died right after payment (recovery test)',
});

export const OVERLAY_ID = 'lp-overlay';

const CSS = `
.lp-root{position:fixed;inset:0;z-index:2147483000;background:rgba(11,6,24,.74);touch-action:none;
  -webkit-user-select:none;user-select:none;outline:none;color:#fff;
  font-family:'GameLatin','GameKR',system-ui,sans-serif;pointer-events:auto}
.lp-frame{position:absolute;display:flex;overflow:hidden}
.lp-frame.center{align-items:center;justify-content:center}
.lp-frame.sheet{align-items:flex-end;justify-content:center}
.lp-card,.lp-sheet{box-sizing:border-box;background:#2b1d52;border:calc(var(--u)*6px) solid #140a2e;
  box-shadow:0 calc(var(--u)*10px) 0 #140a2e,inset 0 calc(var(--u)*6px) 0 rgba(255,255,255,.09);
  text-align:center}
.lp-card{width:86%;border-radius:calc(var(--u)*40px);padding:calc(var(--u)*44px) calc(var(--u)*36px) calc(var(--u)*40px)}
.lp-sheet{width:100%;border-bottom:0;border-radius:calc(var(--u)*44px) calc(var(--u)*44px) 0 0;
  padding:calc(var(--u)*20px) calc(var(--u)*40px) calc(var(--u)*48px);animation:lp-up .18s ease-out}
.lp-grab{width:calc(var(--u)*120px);height:calc(var(--u)*10px);border-radius:99px;background:#4d3a86;margin:0 auto calc(var(--u)*26px)}
.lp-tag{display:inline-block;padding:calc(var(--u)*4px) calc(var(--u)*20px);border-radius:99px;background:#140a2e;
  color:#ffcf5c;font-size:max(12px,calc(var(--u)*26px));letter-spacing:.06em;margin-bottom:calc(var(--u)*18px)}
.lp-title{margin:0;font-weight:400;font-size:max(20px,calc(var(--u)*56px));line-height:1.2;
  -webkit-text-stroke:calc(var(--u)*6px) #140a2e;paint-order:stroke fill;text-shadow:0 calc(var(--u)*4px) 0 #140a2e}
.lp-sub{margin:calc(var(--u)*12px) 0 0;color:#b9add6;font-size:max(14px,calc(var(--u)*30px))}
.lp-price{margin:calc(var(--u)*14px) 0 0;color:#ffd23f;font-size:max(22px,calc(var(--u)*64px));
  -webkit-text-stroke:calc(var(--u)*6px) #140a2e;paint-order:stroke fill}
.lp-note,.lp-wait,.lp-msg{margin:calc(var(--u)*18px) 0 0;color:#b9add6;font-size:max(14px,calc(var(--u)*28px));min-height:1.3em}
.lp-msg{color:#ff9ea6}
.lp-bar{height:calc(var(--u)*26px);min-height:10px;margin:calc(var(--u)*34px) 0 0;border-radius:99px;background:#140a2e;overflow:hidden;
  box-shadow:inset 0 calc(var(--u)*4px) 0 rgba(0,0,0,.35)}
.lp-bar>i{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(180deg,#ffe27a,#ffab2e)}
.lp-actions{display:flex;flex-direction:column;gap:calc(var(--u)*22px);margin-top:calc(var(--u)*34px)}
.lp-btn{box-sizing:border-box;width:100%;min-height:max(48px,calc(var(--u)*104px));border:0;border-radius:calc(var(--u)*34px);
  font:inherit;font-size:max(17px,calc(var(--u)*42px));color:#fff;cursor:pointer;padding:0 calc(var(--u)*24px);
  -webkit-text-stroke:calc(var(--u)*7px) var(--lp-stroke);paint-order:stroke fill;
  transition:transform .06s ease,box-shadow .06s ease;-webkit-tap-highlight-color:transparent}
.lp-btn:active:not(:disabled){transform:translateY(calc(var(--u)*6px))}
.lp-btn:disabled{filter:grayscale(.6) brightness(.8);cursor:default}
.lp-btn[hidden]{display:none}
.lp-primary{--lp-stroke:#8a3a00;background:linear-gradient(180deg,#ffe27a 0%,#ffb629 55%,#ff9410 100%);
  box-shadow:0 calc(var(--u)*8px) 0 #bf5a05,inset 0 calc(var(--u)*5px) 0 rgba(255,255,255,.55)}
.lp-primary:active:not(:disabled){box-shadow:0 calc(var(--u)*2px) 0 #bf5a05,inset 0 calc(var(--u)*5px) 0 rgba(255,255,255,.55)}
.lp-neutral{--lp-stroke:#231a45;background:linear-gradient(180deg,#b7acdf 0%,#8678b8 55%,#6a5d9c 100%);
  box-shadow:0 calc(var(--u)*8px) 0 #3b3166,inset 0 calc(var(--u)*5px) 0 rgba(255,255,255,.35)}
.lp-neutral:active:not(:disabled){box-shadow:0 calc(var(--u)*2px) 0 #3b3166,inset 0 calc(var(--u)*5px) 0 rgba(255,255,255,.35)}
@keyframes lp-up{from{transform:translateY(100%)}to{transform:none}}
@media (prefers-reduced-motion:reduce){.lp-sheet{animation:none}.lp-btn{transition:none}}
`;

interface OverlayHandle {
  root: HTMLElement;
  card: HTMLElement;
  signal: AbortSignal;
  /** setInterval that is cleared on close. */
  every(fn: () => void, ms: number): void;
  /** setTimeout that is cleared on close. */
  after(fn: () => void, ms: number): void;
  close(): void;
}

let active: OverlayHandle | null = null;

export function isOverlayOpen(): boolean {
  return typeof document !== 'undefined' && document.getElementById(OVERLAY_ID) !== null;
}

/** Number of overlay roots + stray overlay elements in the DOM (0 means fully cleaned up). */
export function overlayLeftovers(): number {
  return document.querySelectorAll('#' + OVERLAY_ID + ', .lp-root, [data-lp]').length;
}

const TRAPPED = [
  'pointerdown',
  'pointerup',
  'pointermove',
  'pointercancel',
  'mousedown',
  'mouseup',
  'mousemove',
  'click',
  'dblclick',
  'touchstart',
  'touchend',
  'touchmove',
  'touchcancel',
  'wheel',
  'contextmenu',
  'keydown',
  'keyup',
  'keypress',
] as const;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
  data?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (data) e.dataset.lp = data;
  return e;
}

function openOverlay(variant: 'center' | 'sheet', label: string): OverlayHandle | null {
  if (active || typeof document === 'undefined') return null;
  const ac = new AbortController();
  const timers = new Set<number>();
  const root = el('div', 'lp-root');
  root.id = OVERLAY_ID;
  root.dataset.lp = 'root';
  root.tabIndex = -1;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', label);
  const style = el('style');
  style.textContent = CSS;
  const frame = el('div', 'lp-frame ' + variant);
  const card = el('div', variant === 'sheet' ? 'lp-sheet' : 'lp-card');
  frame.appendChild(card);
  root.append(style, frame);

  // Match the game canvas so the card sits where the game is (letterboxed desktop windows included).
  const layout = (): void => {
    const c = document.querySelector('canvas');
    const r = c ? c.getBoundingClientRect() : null;
    const ok = r !== null && r.width > 40 && r.height > 40;
    const x = ok ? r.left : 0;
    const y = ok ? r.top : 0;
    const w = ok ? r.width : window.innerWidth;
    const h = ok ? r.height : window.innerHeight;
    frame.style.left = x + 'px';
    frame.style.top = y + 'px';
    frame.style.width = w + 'px';
    frame.style.height = h + 'px';
    // 720 design px across the frame; never smaller than 0.45 so text stays legible on a tiny window.
    root.style.setProperty('--u', String(Math.max(0.45, Math.min(1.3, w / 720))));
  };

  const prevFocus = document.activeElement as HTMLElement | null;
  document.body.appendChild(root);
  layout();
  window.addEventListener('resize', layout, { signal: ac.signal });
  window.visualViewport?.addEventListener('resize', layout, { signal: ac.signal });

  // Trap: every pointer/touch/mouse/keyboard event that lands on the overlay stops here. The overlay
  // covers the whole viewport, so nothing underneath ever becomes the event target.
  const trap = (e: Event): void => {
    e.stopPropagation();
    if (e.type === 'wheel' || e.type === 'touchmove' || e.type === 'contextmenu') e.preventDefault();
  };
  for (const type of TRAPPED) root.addEventListener(type, trap, { signal: ac.signal, passive: false });
  root.focus({ preventScroll: true });

  const handle: OverlayHandle = {
    root,
    card,
    signal: ac.signal,
    every(fn, ms) {
      timers.add(window.setInterval(fn, ms));
    },
    after(fn, ms) {
      timers.add(window.setTimeout(fn, ms));
    },
    close() {
      if (active !== handle) return;
      ac.abort();
      for (const id of timers) {
        window.clearInterval(id);
        window.clearTimeout(id);
      }
      timers.clear();
      root.remove(); // takes the <style> and every child with it
      active = null;
      try {
        prevFocus?.focus({ preventScroll: true });
      } catch {
        /* element may be gone */
      }
    },
  };
  active = handle;
  return handle;
}

/** Fake rewarded ad: a countdown bar, then "claim"; "close" is available during the countdown. */
export function showRewardedCard(o: { seconds: number; placement: string }): Promise<'claimed' | 'closed'> {
  return new Promise((resolve) => {
    const ov = openOverlay('center', t('platform.ad.title'));
    if (!ov) return resolve('closed');
    const total = Math.max(0.05, o.seconds) * 1000;
    const tag = el('div', 'lp-tag', 'AD');
    const title = el('h2', 'lp-title', t('platform.ad.title'));
    const sub = el('p', 'lp-sub', t('platform.ad.rewardedSub', { placement: o.placement }));
    const bar = el('div', 'lp-bar');
    bar.dataset.lp = 'bar';
    const fill = el('i');
    bar.appendChild(fill);
    const wait = el('p', 'lp-wait', t('platform.ad.wait', { s: Math.ceil(total / 1000) }));
    wait.dataset.lp = 'wait';
    const actions = el('div', 'lp-actions');
    const close = el('button', 'lp-btn lp-neutral', t('platform.ad.close'), 'close');
    const claim = el('button', 'lp-btn lp-primary', t('platform.ad.claim'), 'claim');
    close.type = 'button';
    claim.type = 'button';
    claim.hidden = true;
    actions.append(close, claim);
    ov.card.append(tag, title, sub, bar, wait, actions);

    const finish = (r: 'claimed' | 'closed'): void => {
      ov.close();
      resolve(r);
    };
    close.addEventListener('click', () => finish('closed'), { signal: ov.signal });
    claim.addEventListener('click', () => finish('claimed'), { signal: ov.signal });

    const t0 = performance.now();
    let done = false;
    const tick = (): void => {
      if (done) return;
      const elapsed = performance.now() - t0;
      const k = Math.min(1, elapsed / total);
      fill.style.width = (k * 100).toFixed(1) + '%';
      if (k >= 1) {
        done = true;
        wait.textContent = t('platform.ad.done');
        close.hidden = true;
        claim.hidden = false;
        claim.focus({ preventScroll: true });
      } else {
        wait.textContent = t('platform.ad.wait', { s: Math.ceil((total - elapsed) / 1000) });
      }
    };
    ov.every(tick, 50);
    tick();
  });
}

/** Fake interstitial: a countdown, then it closes by itself. */
export function showInterstitialCard(o: { seconds: number; reason: string }): Promise<void> {
  return new Promise((resolve) => {
    const ov = openOverlay('center', t('platform.ad.interstitialTitle'));
    if (!ov) return resolve();
    const total = Math.max(0.05, o.seconds) * 1000;
    const tag = el('div', 'lp-tag', 'AD');
    const title = el('h2', 'lp-title', t('platform.ad.interstitialTitle'));
    const sub = el('p', 'lp-sub', t('platform.ad.interstitialSub', { placement: o.reason }));
    const bar = el('div', 'lp-bar');
    bar.dataset.lp = 'bar';
    const fill = el('i');
    bar.appendChild(fill);
    const wait = el('p', 'lp-wait', t('platform.ad.autoClose', { s: Math.ceil(total / 1000) }));
    wait.dataset.lp = 'wait';
    ov.card.append(tag, title, sub, bar, wait);
    const t0 = performance.now();
    const tick = (): void => {
      const elapsed = performance.now() - t0;
      fill.style.width = (Math.min(1, elapsed / total) * 100).toFixed(1) + '%';
      wait.textContent = t('platform.ad.autoClose', { s: Math.max(0, Math.ceil((total - elapsed) / 1000)) });
      if (elapsed >= total) {
        ov.close();
        resolve();
      }
    };
    ov.every(tick, 50);
    tick();
  });
}

export type SheetMode = 'ok' | 'fail' | 'crash';

/** Fake purchase sheet (bottom sheet): product name, price, "test pay" and "cancel". */
export function showPurchaseSheet(o: {
  name: string;
  priceText: string;
  mode: SheetMode;
  /** How long the failure/crash message stays up before the sheet closes. */
  messageMs: number;
}): Promise<'paid' | 'cancelled' | 'failed' | 'crashed'> {
  return new Promise((resolve) => {
    const ov = openOverlay('sheet', t('platform.iap.sheetTitle'));
    if (!ov) return resolve('cancelled');
    const grab = el('div', 'lp-grab');
    const sub = el('p', 'lp-sub', t('platform.iap.sheetTitle'));
    const title = el('h2', 'lp-title', o.name);
    title.dataset.lp = 'name';
    const price = el('p', 'lp-price', o.priceText);
    price.dataset.lp = 'price';
    const note = el('p', 'lp-note', t('platform.iap.note'));
    const msg = el('p', 'lp-msg', '');
    msg.dataset.lp = 'msg';
    const actions = el('div', 'lp-actions');
    const pay = el('button', 'lp-btn lp-primary', t('platform.iap.pay'), 'pay');
    const cancel = el('button', 'lp-btn lp-neutral', t('platform.iap.cancel'), 'cancel');
    pay.type = 'button';
    cancel.type = 'button';
    actions.append(pay, cancel);
    ov.card.append(grab, sub, title, price, note, msg, actions);

    const finish = (r: 'paid' | 'cancelled' | 'failed' | 'crashed'): void => {
      ov.close();
      resolve(r);
    };
    cancel.addEventListener('click', () => finish('cancelled'), { signal: ov.signal });
    pay.addEventListener(
      'click',
      () => {
        if (o.mode === 'ok') return finish('paid');
        pay.disabled = true;
        cancel.disabled = true;
        msg.textContent = t(o.mode === 'fail' ? 'platform.iap.failed' : 'platform.iap.crash');
        ov.after(() => finish(o.mode === 'fail' ? 'failed' : 'crashed'), o.messageMs);
      },
      { signal: ov.signal },
    );
    pay.focus({ preventScroll: true });
  });
}
