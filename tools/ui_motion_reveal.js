// A chest opening, frame by frame, for tools/ui_motion.sh (prepend the constants, then this file):
//   tools/ui_motion.sh <key> "const TAG='<key>', KIND='gold', BEST='legendary', COUNT=1, TIMES=[0.2,0.5,1.0], QUERY='?scene=home&tab=shop&fresh=1', REGION=[0,100,760,1350], COLS=6, CW=250; $(cat tools/ui_motion_reveal.js)"
// Required: TAG KIND (wooden|silver|gold) BEST (common|rare|epic|legendary) COUNT (chests; above 1 is a pile) TIMES (seconds from the first frame, one shot each)
//   QUERY (add &lang=en for English) REGION COLS CW (the strip's crop and tiling, see ui_motion_tile.py).
// Optional: TAPS (seconds at which the floor is tapped), SKIPAT (seconds at which Skip is pressed), START (seconds run unshot first),
//   STILLS (seconds of extra full-size stills named <TAG>_s<n>), END (seconds after the last shot for one final still <TAG>_end),
//   TALL (720 x 1600 with an inset), REDUCED (the reduced-motion form), MANY (a long list of stacks), SKIPTEXT (the Skip label, 건너뛰기 by default),
//   PATTERN (the id of the climb pattern to stage, from CLIMBS in src/screens/shop/climb.ts: steady, late, leap, early, tease, quiet, quick; the
//   stored result gets a seed that picks it, the way a replay would).
// Keep a run under about 20 shots: the runner stops after 120 s. While other engineers save files the dev server reloads the page, so run it on a frozen copy
// (a second Vite on another port, GAME_PORT=<port>).
const card = (rarity, unit) => ({ rarity, unit });
function build(kind, best, n, many, seed) {
  const cards = [card('common', 'w_paw'), card('common', 'r_sling'), card('common', null), card('common', 'm_snow')];
  if (many) cards.push(card('common', 't_bell'), card('common', 'w_sword'), card('common', 'r_archer'), card('rare', 'm_fire'), card('rare', 'r_ninja'), card('rare', 'w_viking'), card('rare', null), card('epic', 'm_frost'), card('epic', 'w_viking'));
  if (best !== 'common') cards.push(card('rare', 'w_sword'));
  if (best === 'epic' || best === 'legendary') cards.push(card('epic', 'm_storm'));
  if (best === 'legendary') cards.push(card('legendary', 'w_samurai'));
  const out = [];
  for (let i = 0; i < n; i++) out.push({ id: 9000 + i, kind, seed, oddsVersion: 1, upgraded: 0, overflowGold: 0, batch: n > 1 ? 9000 : undefined, pity: { unit: null, cards: 0 }, cards });
  return n > 1 ? out : out[0];
}
await scene(QUERY);
if (typeof TALL !== 'undefined' && TALL) await tall(true, 34);
if (typeof REDUCED !== 'undefined' && REDUCED) await reducedOn();
// The climb pattern is picked from the stored result's ids and seeds: look for a seed that picks the one asked for.
let seed = 1;
if (typeof PATTERN !== 'undefined') {
  seed = await ev(async ([impSrc, best, n, pattern]) => {
    const imp = (0, eval)(impSrc);
    const m = await imp('/src/screens/shop/climb.ts');
    for (let sd = 1; sd < 4000; sd++) {
      const list = Array.from({ length: n }, (_, i) => ({ id: 9000 + i, seed: sd }));
      if (m.pickClimb(best, m.climbSeed(list)).id === pattern) return sd;
    }
    return -1;
  }, [IMP, BEST, COUNT, PATTERN]);
  console.log('PATTERN ' + PATTERN + ' seed ' + seed);
}
await ev((r) => { window.__dbg.meta.profile.data.stats.runs = 5; window.__rev = window.__dbg.collection.revealChest(r); }, build(KIND, BEST, COUNT, typeof MANY !== 'undefined' && MANY, seed));
const taps = (typeof TAPS !== 'undefined') ? TAPS : [];
const skipAt = (typeof SKIPAT !== 'undefined') ? SKIPAT : -1;
let now = 0;
let skipped = false;
if (typeof START !== 'undefined' && START > 0) { await adv(START, 1 / 30); now = START; }
for (const t of TIMES) {
  // Taps and the skip fall on the frame they are asked for: the clock stops there, the tap is made, then the shot is taken.
  for (const tp of taps.filter((x) => x > now - 1e-6 && x <= t + 1e-6)) {
    if (tp - now > 0.0004) { await adv(tp - now, 1 / 60); now = tp; }
    await tap(360, 640);
    await adv(0.0005, 0.0005);
  }
  if (!skipped && skipAt >= now - 1e-6 && skipAt <= t + 1e-6) {
    skipped = true;
    if (skipAt - now > 0.0004) { await adv(skipAt - now, 1 / 60); now = skipAt; }
    const p = await textPos(typeof SKIPTEXT !== 'undefined' ? SKIPTEXT : '건너뛰기');
    await tap(p.x, p.y);
    await adv(0.0005, 0.0005);
  }
  const d = Math.max(0.0005, t - now);
  await steps([d], { key: TAG });
  now = Math.max(now, t);
}
if (typeof STILLS !== 'undefined') { let i = 0; for (const t of STILLS) { if (t - now > 0.0004) await adv(t - now, 1 / 60); now = Math.max(now, t); await snap(TAG + '_s' + (i++)); } }
await sfxLog();
if (typeof END !== 'undefined' && END) { await adv(END, 1 / 30); await snap(TAG + '_end'); }
tile(TAG, REGION, COLS, CW);
await done();
