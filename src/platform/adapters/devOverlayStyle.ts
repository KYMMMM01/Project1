/**
 * Look of the dev ad and purchase sheets (behaviour: devOverlay.ts). They are cut paper like the rest of the
 * game, drawn with CSS alone: a cream sheet with a slightly irregular cut edge and a flat warm-brown shadow
 * (a 0-blur drop-shadow, so it follows the cut), washi tape at the top, dark ink without outline, a kraft
 * track with a flat painted fill, coral and kraft paper buttons that press onto their shadow, a paper tag.
 * Nothing is glossy: gradients only draw tape patterns, paper grain and a highlighter, never a lighting ramp.
 * `.lp-calm` (the player's own "reduce motion" setting) removes every animation; the sheets read the same still.
 */

/**
 * PAPER TOKENS. Hand-copied from src/ui/theme.ts (Color, Dim, TapeColors): a stylesheet cannot read the kit, and
 * the `@/ui` barrel would drag PixiJS into the platform chunk. tests/platform.overlayStyle.test.ts fails when a
 * value drifts from the kit, so change the kit first and copy the new value here.
 */
export const PAPER = {
  /** Color.ink: text on paper. */
  ink: '#4a3222',
  /** Color.inkSoft: secondary text on cream. */
  inkSoft: '#7d5e45',
  /** Color.inkDeep: labels on coral, teal and mustard paper. */
  inkDeep: '#3b2418',
  /** Color.paper: the cream sheet. */
  paper: '#fbf3e2',
  /** Color.kraft: the secondary button. */
  kraft: '#d9b88a',
  /** Color.kraftDark: the grain flecks. */
  kraftDark: '#b48f62',
  /** Color.track: the strip the bar is painted into. */
  track: '#d3bb94',
  /** Color.shadow: the flat shadow under every piece of paper. */
  shadow: '#6a4527',
  /** Color.coral: the main action. */
  coral: '#f0796b',
  /** Color.teal: the painted bar and the tag. */
  teal: '#5fb9c4',
  /** Color.tealDark: the keyboard focus line. */
  tealDark: '#3e9aa6',
  /** Color.mustard: the price highlighter. */
  mustard: '#f0bc43',
  /** Color.berryDark: the failure line. */
  berryDark: '#a83f56',
  /** Color.pressTint: what a pressed paper is multiplied by. */
  pressTint: '#ece0d0',
  /** Dim.backdrop: the warm brown behind a sheet (alpha DIM_ALPHA). */
  dimBase: '#3a2514',
  /** TapeColors.sky and its printed mark. */
  tapeSky: '#9acbea',
  tapeSkyMark: '#eaf6ff',
  /** TapeColors.pink and its printed mark. */
  tapePink: '#f3a9ba',
  tapePinkMark: '#fff0f3',
} as const;

/** Dim.backdropAlpha. */
export const DIM_ALPHA = 0.58;

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function toHex(c: readonly number[]): string {
  return '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** A paper under the pointer: its colour times the kit's press tint (what Button does on the pointerdown frame). */
function pressed(hex: string): string {
  const tint = channels(PAPER.pressTint);
  return toHex(channels(hex).map((v, i) => (v * (tint[i] ?? 255)) / 255));
}

/** The disabled paper: kraft pulled toward cream, like the kit's muted palette (the ink stays full strength). */
function muted(): string {
  const a = channels(PAPER.kraft);
  const b = channels(PAPER.paper);
  return toHex(a.map((v, i) => v + ((b[i] ?? v) - v) * 0.45));
}

/** n design units at the overlay's scale (`--u` = CSS px per design unit, set by devOverlay.ts). */
const u = (n: number): string => `calc(var(--u)*${n}px)`;
/** Text size: never below `min` CSS px so a tiny window stays legible. */
const fs = (min: number, n: number): string => `max(${min}px,${u(n)})`;

const kebab = (k: string): string => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

const VARS =
  Object.entries(PAPER)
    .map(([k, v]) => `--${kebab(k)}:${v}`)
    .join(';') +
  `;--dim:${rgba(PAPER.dimBase, DIM_ALPHA)}` +
  `;--coral-press:${pressed(PAPER.coral)};--kraft-press:${pressed(PAPER.kraft)};--muted:${muted()}` +
  `;--shadow-btn:${rgba(PAPER.shadow, 0.3)};--shadow-card:${rgba(PAPER.shadow, 0.4)};--shadow-tag:${rgba(PAPER.shadow, 0.24)}`;

/** Zig-zag ends of a strip of tape. */
const ZIG = u(7);
const TAPE_CUT = `polygon(0 0,100% 0,calc(100% - ${ZIG}) 25%,100% 50%,calc(100% - ${ZIG}) 75%,100% 100%,0 100%,${ZIG} 75%,0 50%,${ZIG} 25%)`;

/** A hand-cut edge: each side bows a few px in or out, deterministic (a fixed polygon, nothing shimmers). */
const CARD_CUT =
  'polygon(0.4% 0.8%,16% 0.1%,34% 0.9%,55% 0.2%,77% 1%,92% 0.3%,99.6% 0.7%,99.9% 18%,99.2% 41%,99.8% 66%,99.3% 88%,99.6% 99.3%,' +
  '88% 99.8%,70% 99%,47% 99.9%,25% 99.1%,8% 99.8%,0.4% 99.3%,0.8% 80%,0.1% 57%,0.7% 33%,0.2% 14%)';
/** The sheet's top and sides bow; its bottom bleeds past the screen, so the paper never shows a gap while it settles. */
const SHEET_CUT =
  'polygon(0 1.3%,11% 0.2%,27% 1.2%,46% 0.1%,63% 1.1%,81% 0.3%,100% 1.2%,99.7% 40%,100% 100%,0 100%,0.3% 62%)';

const GRAIN =
  `radial-gradient(circle at 30% 40%,${rgba(PAPER.kraftDark, 0.11)} 0 1.1px,transparent 1.6px) 0 0/11px 13px,` +
  `radial-gradient(circle at 60% 70%,${rgba(PAPER.kraftDark, 0.08)} 0 1px,transparent 1.5px) 5px 6px/17px 15px,` +
  'var(--paper)';

/** The overlay stylesheet. Every class below is a hook devOverlay.ts (and QA scripts) rely on. */
export const OVERLAY_CSS = `
.lp-root{${VARS};position:fixed;inset:0;z-index:2147483000;background:var(--dim);touch-action:none;
  -webkit-user-select:none;user-select:none;outline:none;color:var(--ink);
  font-family:'GameLatin','GameKR',system-ui,sans-serif;pointer-events:auto;animation:lp-dim .18s linear both}
.lp-root.lp-out{pointer-events:none;animation:lp-dim-out .14s linear both}
.lp-frame{position:absolute;display:flex;overflow:hidden}
.lp-frame.center{align-items:center;justify-content:center}
.lp-frame.sheet{align-items:flex-end;justify-content:center}

/* One sheet of cream paper. The paper is the ::before so the 0-blur drop-shadow takes the cut edge, tape included. */
.lp-card,.lp-sheet{position:relative;box-sizing:border-box;text-align:center}
.lp-card{filter:drop-shadow(0 ${u(8)} 0 var(--shadow-card))}
/* The sheet is flush with the screen bottom, so its flat shadow falls on the rim above it. */
.lp-sheet{filter:drop-shadow(0 ${u(-6)} 0 var(--shadow-card))}
.lp-card::before,.lp-sheet::before{content:'';position:absolute;z-index:-1;inset:0;background:${GRAIN}}
.lp-card{width:86%;padding:${u(62)} ${u(36)} ${u(42)};animation:lp-land .34s cubic-bezier(.3,.7,.4,1) both}
.lp-card::before{border-radius:${u(34)} ${u(24)} ${u(38)} ${u(28)}/${u(28)} ${u(36)} ${u(24)} ${u(32)};clip-path:${CARD_CUT}}
.lp-sheet{width:100%;padding:${u(60)} ${u(40)} max(${u(48)},env(safe-area-inset-bottom));animation:lp-up .34s cubic-bezier(.3,.7,.4,1) both}
.lp-sheet::before{bottom:${u(-70)};border-radius:${u(44)} ${u(36)} 0 0/${u(40)} ${u(46)} 0 0;clip-path:${SHEET_CUT}}
.lp-out .lp-card{animation:lp-land-out .14s cubic-bezier(.32,0,.67,0) both}
.lp-out .lp-sheet{animation:lp-down .14s cubic-bezier(.32,0,.67,0) both}
.lp-card>*,.lp-sheet>*{animation:lp-in .2s ease-out both}
.lp-out .lp-card>*,.lp-out .lp-sheet>*{animation:none}
.lp-card>:nth-child(2),.lp-sheet>:nth-child(2){animation-delay:40ms}
.lp-card>:nth-child(3),.lp-sheet>:nth-child(3){animation-delay:80ms}
.lp-card>:nth-child(4),.lp-sheet>:nth-child(4){animation-delay:120ms}
.lp-card>:nth-child(5),.lp-sheet>:nth-child(5){animation-delay:160ms}
.lp-card>:nth-child(n+6),.lp-sheet>:nth-child(n+6){animation-delay:200ms}

/* Washi tape across the top edge, drawn with gradients: gingham on the ad, dots on the sheet. */
.lp-card::after,.lp-grab{content:'';position:absolute;top:${u(-26)};left:calc(50% - ${u(100)});width:${u(200)};height:${u(54)};
  margin:0;clip-path:${TAPE_CUT};rotate:-2.4deg;pointer-events:none;animation:lp-tape .26s .16s cubic-bezier(.3,.7,.4,1) both}
.lp-card::after{background:
  repeating-linear-gradient(0deg,${rgba(PAPER.tapeSkyMark, 0.5)} 0 ${u(7)},transparent ${u(7)} ${u(14)}),
  repeating-linear-gradient(90deg,${rgba(PAPER.tapeSkyMark, 0.5)} 0 ${u(7)},transparent ${u(7)} ${u(14)}),
  ${rgba(PAPER.tapeSky, 0.9)}}
.lp-grab{rotate:1.8deg;background:
  radial-gradient(circle,${rgba(PAPER.tapePinkMark, 0.9)} 0 ${u(4)},transparent ${u(4.6)}) 0 0/${u(18)} ${u(18)},
  ${rgba(PAPER.tapePink, 0.9)}}
.lp-out .lp-card::after,.lp-out .lp-grab{animation:none}

/* Tag: a small flag of teal paper. */
.lp-tag{display:inline-block;padding:${u(5)} ${u(24)};border-radius:${u(12)} ${u(18)} ${u(12)} ${u(20)}/${u(16)} ${u(12)} ${u(18)} ${u(12)};
  background:var(--teal);color:var(--ink-deep);font-size:${fs(12, 26)};line-height:1.25;letter-spacing:.1em;
  margin-bottom:${u(18)};rotate:-3deg;box-shadow:0 ${u(3)} 0 var(--shadow-tag)}
.lp-sheet>.lp-tag,.lp-sheet>.lp-sub{display:inline-block;vertical-align:middle;margin:0 ${u(8)}}
.lp-sheet>.lp-title{margin-top:${u(16)}}
.lp-card>.lp-tag,.lp-sheet>.lp-tag{animation:lp-sticker .28s .12s cubic-bezier(.3,.7,.4,1) both}
.lp-out .lp-card>.lp-tag,.lp-out .lp-sheet>.lp-tag{animation:none}

.lp-title{margin:0;font-weight:400;font-size:${fs(20, 54)};line-height:1.2;color:var(--ink)}
.lp-sub{margin:${u(12)} 0 0;color:var(--ink-soft);font-size:${fs(14, 30)}}
.lp-price{display:inline-block;margin:${u(12)} 0 0;padding:0 ${u(20)};border-radius:${u(10)} ${u(16)} ${u(10)} ${u(14)};
  color:var(--ink-deep);font-size:${fs(22, 64)};line-height:1.25;
  background:linear-gradient(transparent 58%,${rgba(PAPER.mustard, 0.62)} 58% 94%,transparent 94%)}
.lp-price:empty{display:none}
.lp-note,.lp-wait,.lp-msg{margin:${u(18)} 0 0;color:var(--ink-soft);font-size:${fs(14, 28)};min-height:1.3em}
.lp-msg{color:var(--berry-dark)}

/* Progress: a kraft strip with a flat teal fill, painted with an uneven leading edge. */
.lp-bar{height:${u(26)};min-height:12px;margin:${u(34)} 0 0;border-radius:99px;background:var(--track);overflow:hidden;
  box-shadow:inset 0 ${u(3)} 0 ${rgba(PAPER.shadow, 0.2)}}
.lp-bar>i{display:block;height:100%;width:0;border-radius:99px ${u(9)} ${u(13)} 99px;background:var(--teal)}

.lp-actions{display:flex;flex-direction:column;gap:max(10px,${u(22)});margin-top:${u(34)}}
.lp-btn{box-sizing:border-box;width:100%;border:0;font:inherit;font-size:${fs(17, 42)};cursor:pointer;padding:0 ${u(24)};
  transition:transform .16s cubic-bezier(.34,2,.64,1),box-shadow .16s cubic-bezier(.34,2,.64,1),background-color .16s linear;
  -webkit-tap-highlight-color:transparent}
.lp-btn:active:not(:disabled){transform:translateY(${u(4)}) scale(.97);transition-duration:.06s;transition-timing-function:cubic-bezier(.5,1,.89,1)}
.lp-btn:focus-visible{outline:${u(5)} dashed var(--teal-dark);outline-offset:${u(5)}}
.lp-btn:disabled{background:var(--muted);color:var(--ink);cursor:default;box-shadow:0 ${u(2)} 0 var(--shadow-btn)}
.lp-btn[hidden]{display:block;visibility:hidden}
.lp-primary{min-height:max(56px,${u(120)});background:var(--coral);color:var(--ink-deep);box-shadow:0 ${u(6)} 0 var(--shadow-btn);
  border-radius:${u(34)} ${u(42)} ${u(30)} ${u(40)}/${u(42)} ${u(30)} ${u(40)} ${u(34)}}
.lp-primary:active:not(:disabled){background:var(--coral-press);box-shadow:0 ${u(2)} 0 var(--shadow-btn)}
.lp-neutral{min-height:max(48px,${u(96)});background:var(--kraft);color:var(--ink);box-shadow:0 ${u(5)} 0 var(--shadow-btn);
  border-radius:${u(30)} ${u(36)} ${u(34)} ${u(28)}/${u(34)} ${u(28)} ${u(32)} ${u(36)}}
.lp-neutral:active:not(:disabled){background:var(--kraft-press);box-shadow:0 ${u(1)} 0 var(--shadow-btn)}
/* The reward is ready: the claim paper is stamped down (no fill-forwards, so :active still presses it afterwards). */
.lp-btn[data-lp="claim"]:not([hidden]){animation:lp-stamp .3s cubic-bezier(.3,.7,.4,1) backwards}

@keyframes lp-dim{from{background:${rgba(PAPER.dimBase, 0)}}to{background:var(--dim)}}
@keyframes lp-dim-out{from{background:var(--dim)}to{background:${rgba(PAPER.dimBase, 0)}}}
@keyframes lp-land{
  0%{transform:translateY(${u(70)}) rotate(-3.5deg) scale(.94);opacity:0}
  45%{opacity:1}
  62%{transform:translateY(${u(-9)}) rotate(.9deg) scale(1.01)}
  82%{transform:translateY(${u(3)}) rotate(-.3deg)}
  100%{transform:none;opacity:1}}
@keyframes lp-land-out{from{transform:none;opacity:1}to{transform:translateY(${u(36)}) rotate(1.6deg) scale(.96);opacity:0}}
@keyframes lp-up{0%{transform:translateY(100%)}64%{transform:translateY(-1.8%)}84%{transform:translateY(.5%)}100%{transform:none}}
@keyframes lp-down{from{transform:none}to{transform:translateY(100%)}}
@keyframes lp-in{from{transform:translateY(${u(12)});opacity:0}to{transform:none;opacity:1}}
@keyframes lp-tape{from{transform:scale(1.7);opacity:0}60%{transform:scale(.94);opacity:1}to{transform:none;opacity:1}}
@keyframes lp-sticker{from{transform:scale(.5);opacity:0}60%{transform:scale(1.12);opacity:1}to{transform:none;opacity:1}}
@keyframes lp-stamp{0%{transform:scale(1.5) rotate(-5deg);opacity:0}55%{transform:scale(.95) rotate(1deg);opacity:1}78%{transform:scale(1.03)}100%{transform:none}}

/* The player's own "reduce motion" setting (the OS flag is not followed, like the rest of the game). */
.lp-calm,.lp-calm *,.lp-calm ::before,.lp-calm ::after{animation:none!important;transition:none!important}
`;
