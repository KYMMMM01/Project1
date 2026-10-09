/**
 * Dev mock UI: DOM overlays above the canvas (not PixiJS) for the fake rewarded ad, the fake
 * interstitial and the fake purchase sheet. Drawn as cut paper like the rest of the game (the stylesheet
 * and its tokens live in devOverlayStyle.ts; 'GameLatin'/'GameKR' come from index.html). Follows
 * docs/research/03 (U-01/02 press feel, U-05/06 popup open/close timings, 3.2 touch targets) and is never
 * smaller than 44 CSS px per button. The overlay traps pointer/keyboard events so nothing underneath can
 * be tapped, and removes itself, its style element, its listeners and its timers completely when it
 * closes. It also survives being ripped out of the DOM from outside: the pending promise then settles as
 * if the player closed it. Only the dev adapter imports this file, so it never reaches another platform's build.
 */
import { addStrings, hasString, t } from '@/core/i18n';
import { motion } from '@/ui/motion';
import { OVERLAY_CSS } from './devOverlayStyle';

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
  'platform.placement.pre_run_snack': '출발 간식',
  'platform.placement.revive': '계속하기',
  'platform.placement.relic_reroll': '장난감 다시 뽑기',
  'platform.placement.result_double': '결과 2배',
  'platform.placement.snack_box': '간식 상자',
  'platform.placement.daily_treat': '오늘의 간식',
  'platform.placement.free_chest': '무료 상자 건너뛰기',
  'platform.placement.patrol_double': '순찰 2배',
  'platform.placement.shop_refresh': '상점 새로고침',
  'platform.placement.sweep_ticket': '소탕권',
  'platform.placement.dungeon_entry': '골드 던전 입장',
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
  'platform.placement.pre_run_snack': 'Pre-run snack',
  'platform.placement.revive': 'Keep going',
  'platform.placement.relic_reroll': 'Toy reroll',
  'platform.placement.result_double': 'Double result',
  'platform.placement.snack_box': 'Snack box',
  'platform.placement.daily_treat': 'Daily treat',
  'platform.placement.free_chest': 'Skip chest wait',
  'platform.placement.patrol_double': 'Double patrol',
  'platform.placement.shop_refresh': 'Shop refresh',
  'platform.placement.sweep_ticket': 'Sweep ticket',
  'platform.placement.dungeon_entry': 'Gold Dungeon entry',
});

export const OVERLAY_ID = 'lp-overlay';

/** U-06: popup close is 140 ms; the root lingers that long (inert) so the fade can play. */
export const CLOSE_MS = 150;

interface OverlayHandle {
  root: HTMLElement;
  card: HTMLElement;
  signal: AbortSignal;
  /** Escape / Android back. Set by the overlay that wants it. */
  onEscape: (() => void) | null;
  /** The overlay vanished from the DOM without close() (something removed it): settle the promise. */
  onGone: (() => void) | null;
  /** setInterval that is cleared on close. */
  every(fn: () => void, ms: number): void;
  /** setTimeout that is cleared on close. */
  after(fn: () => void, ms: number): void;
  close(): void;
}

let active: OverlayHandle | null = null;

export function isOverlayOpen(): boolean {
  return active !== null && active.root.isConnected;
}

/** Overlay roots + stray overlay elements in the DOM (0 means fully cleaned up; a closing fade counts for 150 ms). */
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

function placementLabel(id: string): string {
  const key = 'platform.placement.' + id;
  return hasString(key) ? t(key) : id;
}

function openOverlay(variant: 'center' | 'sheet', label: string): OverlayHandle | null {
  if (typeof document === 'undefined') return null;
  if (active && !active.root.isConnected) active.close(); // a stale handle must not lock the game out
  if (active) return null;
  const ac = new AbortController();
  const timers = new Set<number>();
  // The player's own setting, not the OS flag (see `motion`): a still sheet says the same thing.
  const calm = motion.reduced;
  const root = el('div', calm ? 'lp-root lp-calm' : 'lp-root');
  root.id = OVERLAY_ID;
  root.dataset.lp = 'root';
  root.tabIndex = -1;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', label);
  const style = el('style');
  style.textContent = OVERLAY_CSS;
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

  const focusables = (): HTMLElement[] =>
    Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled):not([hidden])'));

  // Trap: every pointer/touch/mouse/keyboard event that lands on the overlay stops here. The overlay
  // covers the whole viewport, so nothing underneath ever becomes the event target.
  const trap = (e: Event): void => {
    e.stopPropagation();
    if (e.type === 'wheel' || e.type === 'touchmove' || e.type === 'contextmenu') e.preventDefault();
  };
  for (const type of TRAPPED) root.addEventListener(type, trap, { signal: ac.signal, passive: false });
  root.addEventListener(
    'keydown',
    (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        handle.onEscape?.();
      } else if (e.key === 'Tab') {
        // Keep keyboard focus inside the overlay.
        e.preventDefault();
        const list = focusables();
        if (list.length === 0) return;
        const i = list.indexOf(document.activeElement as HTMLElement);
        list[(i + (e.shiftKey ? list.length - 1 : 1)) % list.length]?.focus({ preventScroll: true });
      }
    },
    { signal: ac.signal },
  );
  root.focus({ preventScroll: true });

  const handle: OverlayHandle = {
    root,
    card,
    signal: ac.signal,
    onEscape: null,
    onGone: null,
    every(fn, ms) {
      timers.add(window.setInterval(fn, ms));
    },
    after(fn, ms) {
      timers.add(window.setTimeout(fn, ms));
    },
    close() {
      if (active !== handle) return;
      active = null; // free at once: the fade below must not block the next overlay
      ac.abort();
      for (const id of timers) {
        window.clearInterval(id);
        window.clearTimeout(id);
      }
      timers.clear();
      root.removeAttribute('id');
      if (calm || !root.isConnected) {
        root.remove(); // takes the <style> and every child with it
      } else {
        root.classList.add('lp-out'); // inert (pointer-events:none) while it fades
        window.setTimeout(() => root.remove(), CLOSE_MS);
      }
      try {
        prevFocus?.focus({ preventScroll: true });
      } catch {
        /* element may be gone */
      }
    },
  };
  active = handle;
  // Liveness: if something removes the overlay behind our back, settle instead of hanging.
  handle.every(() => {
    if (root.isConnected) return;
    const gone = handle.onGone;
    handle.close();
    gone?.();
  }, 250);
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
    const sub = el('p', 'lp-sub', t('platform.ad.rewardedSub', { placement: placementLabel(o.placement) }));
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
    // Two fixed slots (claim above, close below): a button never moves under a finger mid-press.
    actions.append(claim, close);
    ov.card.append(tag, title, sub, bar, wait, actions);

    let done = false;
    const finish = (r: 'claimed' | 'closed'): void => {
      ov.close();
      resolve(r);
    };
    close.addEventListener('click', () => finish('closed'), { signal: ov.signal });
    claim.addEventListener('click', () => finish('claimed'), { signal: ov.signal });
    // Escape = the close button; once the countdown is over the reward must be claimed explicitly.
    ov.onEscape = () => {
      if (!done) finish('closed');
    };
    ov.onGone = () => resolve('closed');

    const t0 = performance.now();
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
    ov.onGone = resolve;
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
    const tag = el('div', 'lp-tag', 'TEST');
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
    ov.card.append(grab, tag, sub, title, price, note, msg, actions);

    const finish = (r: 'paid' | 'cancelled' | 'failed' | 'crashed'): void => {
      ov.close();
      resolve(r);
    };
    cancel.addEventListener('click', () => finish('cancelled'), { signal: ov.signal });
    // Escape = cancel, unless the payment is already "in progress" (message showing).
    ov.onEscape = () => {
      if (!pay.disabled) finish('cancelled');
    };
    ov.onGone = () => resolve('cancelled');
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
  });
}
