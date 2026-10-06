/**
 * Input shield: a transparent full-viewport DOM layer that swallows taps while an ad or a purchase
 * sheet is open (research C-7.1 #7). Vendor SDKs draw their own overlay once the ad is up, but not
 * during the request, and a failed request never draws one: without this the game underneath stays
 * tappable. One element, created on demand, removed on release.
 */
const SHIELD_Z = 2147482999; // just below the dev mock overlay (devOverlay.ts)

let shield: HTMLDivElement | null = null;

export function setInputShield(on: boolean): void {
  if (typeof document === 'undefined') return;
  if (!on) {
    shield?.remove();
    shield = null;
    return;
  }
  if (shield?.isConnected) return;
  const el = document.createElement('div');
  el.dataset.lp = 'shield';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = `position:fixed;inset:0;z-index:${SHIELD_Z};background:transparent;touch-action:none;`;
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  document.body.appendChild(el);
  shield = el;
}
