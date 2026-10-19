/**
 * The board's look: the game's own paper-on-wood kit (cream sheets with a flat brown shadow, a strip of washi tape on each card, coral paper
 * buttons, the Lilita One / Jua faces the page already loads). Phone first: a 16 px gutter, 360 px wide is the narrowest it is designed for,
 * every button is at least 48 px high. Injected as one <style> by `mountBoard`; every rule is under `.sb` so nothing leaks into the game.
 */
export const BOARD_CSS = `
.sb, .sb * { box-sizing: border-box; }
.sb {
  position: fixed; inset: 0; z-index: 10; overflow-x: hidden; overflow-y: auto;
  -webkit-overflow-scrolling: touch; overscroll-behavior: contain; touch-action: pan-y;
  color: #4a3222; font-family: 'GameLatin', 'GameKR', system-ui, sans-serif; font-size: 16px; line-height: 1.35;
  -webkit-user-select: none; user-select: none; -webkit-text-size-adjust: 100%;
  background:
    repeating-linear-gradient(180deg, rgba(160, 106, 51, 0.5) 0 4px, rgba(224, 176, 112, 0.28) 4px 7px, rgba(224, 176, 112, 0) 7px 172px),
    repeating-linear-gradient(180deg, rgba(224, 176, 112, 0.11) 0 172px, rgba(160, 106, 51, 0.09) 172px 344px), #c48f50;
  background-attachment: local;
}
.sb .hide { display: none !important; }
:where(.sb) button { padding: 0; }
.sb button { font: inherit; color: inherit; border: 0; margin: 0; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.sb button:focus-visible { outline: 3px solid #3e9aa6; outline-offset: 2px; }
.sb-wrap { max-width: 560px; margin: 0 auto; padding: 0 16px; }

/* paper pieces */
.sb-paper {
  background: #fbf3e2; border-radius: 22px 26px 20px 24px / 24px 20px 26px 22px;
  box-shadow: inset 0 0 0 2px rgba(180, 143, 98, 0.35), 0 5px 0 rgba(106, 69, 39, 0.22);
}

/* the head of the page, which scrolls away */
.sb-head { padding-top: 18px; padding-bottom: 6px; }
.sb-title { margin: 0; font-size: 30px; line-height: 1.1; color: #fffaf0; font-weight: normal; text-shadow: 0 3px 0 rgba(74, 50, 34, 0.55), 0 0 2px rgba(74, 50, 34, 0.8); }
.sb-sub { margin: 4px 0 0; font-size: 15px; color: #fffaf0; text-shadow: 0 2px 0 rgba(74, 50, 34, 0.5); }
.sb-note { margin: 12px 0 4px; padding: 14px 16px 12px; }
.sb-note h2 { margin: 0 0 6px; font-size: 18px; font-weight: normal; }
.sb-note ol { margin: 0; padding-left: 22px; font-size: 14.5px; }
.sb-note li { margin: 3px 0; }
.sb-note b { font-weight: normal; color: #c4544a; }

/* sticky bar: tabs, volume, stop */
.sb-top { position: sticky; top: 0; z-index: 6; padding: 8px 0 10px; background: #edddbb; box-shadow: 0 4px 0 rgba(106, 69, 39, 0.28); }
.sb-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.sb-tab { min-height: 46px; border-radius: 16px; background: #d9b88a; color: #6b4d38; font-size: 17px; box-shadow: 0 3px 0 #b48f62; }
.sb-tab[aria-selected='true'] { background: #f0796b; color: #3b2418; box-shadow: 0 3px 0 #c4544a; }
.sb-ctl { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.sb-vol { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; }
.sb-vol label { font-size: 14px; color: #6b4d38; white-space: nowrap; }
.sb-vol input[type='range'] { flex: 1; min-width: 0; height: 44px; margin: 0; background: transparent; -webkit-appearance: none; appearance: none; touch-action: pan-y; }
.sb-vol input[type='range']::-webkit-slider-runnable-track { height: 14px; border-radius: 999px; background: #d3bb94; box-shadow: inset 0 0 0 2px rgba(180, 143, 98, 0.7); }
.sb-vol input[type='range']::-moz-range-track { height: 14px; border-radius: 999px; background: #d3bb94; box-shadow: inset 0 0 0 2px rgba(180, 143, 98, 0.7); }
.sb-vol input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; width: 30px; height: 30px; margin-top: -8px; border-radius: 50%; background: #f0796b; box-shadow: 0 3px 0 #c4544a; border: 0; }
.sb-vol input[type='range']::-moz-range-thumb { width: 30px; height: 30px; border-radius: 50%; background: #f0796b; box-shadow: 0 3px 0 #c4544a; border: 0; }
.sb-stop { flex: none; min-width: 104px; min-height: 48px; padding: 0 12px; border-radius: 16px; background: #d96579; color: #fffaf0; font-size: 16px; box-shadow: 0 4px 0 #a83f56; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.sb-stop:active, .sb-btn:active { transform: translateY(3px); box-shadow: none; }

/* section chips */
.sb-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0 4px; }
.sb-chip { min-height: 36px; padding: 0 12px; border-radius: 14px; background: #fbf3e2; font-size: 14px; color: #4a3222; box-shadow: 0 3px 0 rgba(106, 69, 39, 0.25); }
.sb-chip small { font-size: 12px; color: #7d5e45; margin-left: 4px; }

/* sections */
.sb-sec { margin: 20px 0 0; }
.sb-sec-head { width: 100%; min-height: 52px; padding: 0 16px; display: flex; align-items: center; gap: 10px; text-align: left; border-radius: 18px; background: #e0b070; color: #3b2418; font-size: 20px; box-shadow: 0 4px 0 #a06a33; scroll-margin-top: 132px; }
.sb-sec-head small { margin-left: auto; font-size: 14px; color: #6b4d38; }
.sb-sec-head .chev { flex: none; width: 14px; height: 14px; border-right: 4px solid #3b2418; border-bottom: 4px solid #3b2418; transform: rotate(45deg) translate(-3px, -3px); transition: transform 0.15s; }
.sb-sec.closed .chev { transform: rotate(-45deg) translate(-3px, -3px); }
.sb-sec.closed .sb-sec-body { display: none; }
.sb-hint { margin: 10px 4px 0; font-size: 14px; color: #fffaf0; text-shadow: 0 2px 0 rgba(74, 50, 34, 0.5); }

/* one row */
.sb-row { position: relative; margin: 20px 0 0; padding: 18px 14px 14px; --tape: #5fb9c4; }
.sb-row::before {
  content: ''; position: absolute; top: -9px; left: 18px; width: 54px; height: 16px; transform: rotate(-2.5deg); background: var(--tape); opacity: 0.92;
  clip-path: polygon(0 0, 100% 0, 97% 25%, 100% 50%, 97% 75%, 100% 100%, 0 100%, 3% 75%, 0 50%, 3% 25%);
}
.sb-row.sec-ui { --tape: #5fb9c4; } .sb-row.sec-board { --tape: #f0bc43; } .sb-row.sec-warrior { --tape: #f0796b; }
.sb-row.sec-ranger { --tape: #7dba5c; } .sb-row.sec-mage { --tape: #9c84c0; } .sb-row.sec-trickster { --tape: #d96579; }
.sb-row.sec-battle { --tape: #b8845a; } .sb-row.sec-foes { --tape: #4f8f3a; } .sb-row.sec-bosses { --tape: #a83f56; }
.sb-row.sec-skills { --tape: #3e9aa6; } .sb-row.sec-skillsingle { --tape: #62b5c0; } .sb-row.sec-flow { --tape: #c48f1f; } .sb-row.sec-rewards { --tape: #eab84a; }
.sb-row h3 { margin: 0; font-size: 19px; font-weight: normal; line-height: 1.2; }
.sb-row p { margin: 3px 0 0; font-size: 14.5px; color: #7d5e45; }
.sb-id { display: inline-block; margin-top: 6px; padding: 1px 8px; border-radius: 9px; background: #edddbb; color: #7d5e45; font: 12px/1.5 ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace; -webkit-user-select: text; user-select: text; }
.sb-badge { display: inline-block; margin-left: 6px; padding: 0 8px; border-radius: 9px; background: #7dba5c; color: #3b2418; font-size: 12px; vertical-align: 2px; }
.sb-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
.sb-btns.plain { grid-template-columns: 1fr 118px; }
.sb-btn { position: relative; min-height: 52px; padding: 0 10px; border-radius: 16px; font-size: 17px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.sb-btn.play { min-height: 58px; background: #f0796b; color: #3b2418; box-shadow: 0 4px 0 #c4544a; font-size: 20px; }
.sb-btn.new { background: #7dba5c; color: #3b2418; box-shadow: 0 4px 0 #4f8f3a; font-size: 20px; min-height: 58px; }
.sb-btn.x5 { background: #d9b88a; color: #3b2418; box-shadow: 0 4px 0 #b48f62; font-size: 15px; line-height: 1.15; flex-direction: column; gap: 0; }
.sb-btn.x5 small { font-size: 12px; color: #6b4d38; }
.sb-btn.both { grid-column: 1 / -1; background: #f0bc43; color: #3b2418; box-shadow: 0 4px 0 #c48f1f; }
.sb-btn.wait { opacity: 0.6; cursor: progress; }
.sb-btn.on { filter: brightness(1.12); outline: 4px solid rgba(255, 250, 240, 0.9); outline-offset: -4px; }
.tri { display: inline-block; width: 16px; height: 18px; background: currentColor; clip-path: polygon(0 0, 100% 50%, 0 100%); }
.sqr { display: inline-block; width: 14px; height: 14px; background: currentColor; border-radius: 3px; }
.sb-msg { margin: 8px 0 0; font-size: 14px; color: #a83f56; min-height: 0; }

/* music, candidates */
.sb-grp { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
.sb-seg { min-height: 46px; border-radius: 14px; background: #d9b88a; color: #6b4d38; font-size: 16px; box-shadow: 0 3px 0 #b48f62; }
.sb-seg[aria-pressed='true'] { background: #5fb9c4; color: #3b2418; box-shadow: 0 3px 0 #3e9aa6; }
.sb-row.music.playing { box-shadow: inset 0 0 0 4px #5fb9c4, 0 5px 0 rgba(106, 69, 39, 0.22); }
.sb-row.cand { margin-top: 14px; padding: 16px 12px 12px; }
.sb-cand { display: grid; grid-template-columns: 58px 1fr; gap: 12px; align-items: center; margin-top: 2px; }
.sb-cand .sb-btn.play { min-height: 58px; padding: 0; }
.sb-cand .name { font: 15px/1.25 ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace; overflow-wrap: anywhere; -webkit-user-select: text; user-select: text; }
.sb-cand .meta { margin-top: 3px; font-size: 13px; color: #7d5e45; }
.sb-star { min-height: 52px; border-radius: 16px; background: #edddbb; color: #b48f62; font-size: 26px; box-shadow: 0 3px 0 #d3bb94; }
.sb-star[aria-pressed='true'] { background: #f0bc43; color: #3b2418; box-shadow: 0 3px 0 #c48f1f; }
.sb-cand-x5 { margin-top: 8px; display: grid; grid-template-columns: 1fr 64px; gap: 8px; }
.sb-picks { margin: 12px 0 0; padding: 12px 14px; font-size: 14px; }
.sb-picks h2 { margin: 0 0 4px; font-size: 17px; font-weight: normal; }
.sb-picks pre { margin: 6px 0 0; white-space: pre-wrap; word-break: break-all; font: 13px/1.5 ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace; -webkit-user-select: text; user-select: text; }
.sb-pack { margin-top: 12px; padding: 12px 14px; font-size: 14px; }
.sb-pack p { margin: 0; }
.sb-opt { margin-top: 10px; width: 100%; min-height: 50px; padding: 0 14px; border-radius: 16px; background: #d9b88a; color: #3b2418; font-size: 15px; text-align: left; box-shadow: 0 3px 0 #b48f62; display: flex; align-items: center; gap: 10px; }
.sb-opt .box { flex: none; width: 24px; height: 24px; border-radius: 7px; background: #fbf3e2; box-shadow: inset 0 0 0 3px #b48f62; }
.sb-opt[aria-pressed='true'] .box { background: #7dba5c; box-shadow: inset 0 0 0 3px #4f8f3a; }
.sb-empty { margin: 24px 4px; text-align: center; color: #fffaf0; text-shadow: 0 2px 0 rgba(74, 50, 34, 0.5); }
.sb-foot { margin: 28px 0 0; padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px)); font-size: 13px; text-align: center; color: #fffaf0; text-shadow: 0 2px 0 rgba(74, 50, 34, 0.5); }

/* the gate: one tap to let the browser play sound */
.sb-gate { position: fixed; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; padding: 24px 16px; background: rgba(74, 50, 34, 0.55); }
.sb-gate .sb-paper { width: 100%; max-width: 360px; padding: 26px 22px 22px; text-align: center; }
.sb-gate h1 { margin: 0 0 8px; font-size: 26px; font-weight: normal; }
.sb-gate p { margin: 8px 0 0; font-size: 15px; color: #6b4d38; }
.sb-gate .sb-btn { width: 100%; margin-top: 18px; min-height: 68px; font-size: 24px; }
.sb-gate .sb-msg { font-size: 14px; }
@media (prefers-reduced-motion: reduce) { .sb-sec-head .chev { transition: none; } }
`;

export function injectStyle(doc: Document): HTMLElement {
  const style = doc.createElement('style');
  style.setAttribute('data-soundboard', '');
  style.appendChild(doc.createTextNode(BOARD_CSS));
  (doc.head ?? doc.documentElement).appendChild(style);
  return style;
}
