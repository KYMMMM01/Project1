(async () => {
  // The worst case of the mix (landing review 2026-10-19): sounds that start in the very same instant, through the engine's own graph (buses, limiter, ceiling), with the music at full
  // intensity and the user's volume at its top. No voice limiter in front: this is what the graph alone does when the rules of the director fail. Nothing is played (OfflineAudioContext).
  const { SOUNDS, sfxIndexOf } = await import('/src/audio/sounds.ts');
  const { bakeVariant } = await import('/src/audio/bake.ts');
  const { createGraph, busNode, MUSIC_BASE, SFX_BASE, SOFT_CLIP_CEILING } = await import('/src/audio/graph.ts');
  const { MusicPlayer } = await import('/src/audio/music.ts');
  const { volumeTaper } = await import('/src/audio/envelopes.ts');
  const SR = 48000, SECONDS = 2.5;
  const baked = new Map();
  const get = async (idx) => { if (!baked.has(idx)) { const d = SOUNDS[idx]; baked.set(idx, (await bakeVariant(d.recipe, d.key, 0, SR)).buffer); } return baked.get(idx); };
  const SKILLS = ['sp_shield_slam', 'sp_cut_clash', 'sp_tiger_roar', 'sp_smoke_pop', 'sp_poster_slap', 'sp_night_hush', 'sp_cloud_pop', 'sp_glass_shatter', 'sp_meteor_boom', 'sp_strum', 'sp_flask_pop', 'sp_capsule_pop'];
  const IMPS = SOUNDS.filter((d) => /^imp_/.test(d.id)).map((d) => d.id);
  const RELS = SOUNDS.filter((d) => /^atk_/.test(d.id)).map((d) => d.id);
  const cases = {
    'every sound at once, volume 1': { ids: SOUNDS.filter((d) => !d.recipe.legacy).map((d) => d.id), vol: 1, user: 1 },
    'every sound at once, volume 4 (the most the engine accepts)': { ids: SOUNDS.filter((d) => !d.recipe.legacy).map((d) => d.id), vol: 4, user: 1 },
    'twelve skills + boss roar, warning, awaken, boss_die + 20 landings + 20 releases, volume 1': { ids: [...SKILLS, 'boss_roar', 'boss_warning', 'awaken', 'boss_die', ...IMPS, ...RELS], vol: 1, user: 1 },
    'the same at the default user volume 0.8': { ids: [...SKILLS, 'boss_roar', 'boss_warning', 'awaken', 'boss_die', ...IMPS, ...RELS], vol: 1, user: 0.8 },
    'twenty landings at once, volume 1': { ids: IMPS, vol: 1, user: 1 },
  };
  const out = {};
  for (const [name, c] of Object.entries(cases)) {
    for (const withPanner of [false, true]) {
      const ctx = new OfflineAudioContext(2, Math.ceil(SECONDS * SR), SR);
      const graph = createGraph(ctx);
      graph.sfxBus.gain.value = SFX_BASE * volumeTaper(c.user);
      graph.musicBus.gain.value = MUSIC_BASE * volumeTaper(1);
      const player = new MusicPlayer(ctx, graph.musicBus, graph.reverbIn); player.setIntensity(1); player.play('battle', 0.05); player.pump(SECONDS); player.pause();
      // a probe on the signal before the limiter and one before the ceiling, to see how far past full scale the sum goes
      let n = 0;
      for (const id of c.ids) {
        const idx = sfxIndexOf(id); if (idx < 0) continue;
        const buf = await get(idx);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const g = ctx.createGain(); g.gain.value = c.vol;
        src.connect(g);
        if (withPanner) { const p = ctx.createStereoPanner(); p.pan.value = 0; g.connect(p); p.connect(busNode(graph, SOUNDS[idx].recipe.cat)); } else g.connect(busNode(graph, SOUNDS[idx].recipe.cat));
        src.start(0.1); n++;
      }
      const buf = await ctx.startRendering();
      let peak = 0, over = 0, over999 = 0;
      for (let ch = 0; ch < 2; ch++) { const x = buf.getChannelData(ch); for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; if (a > SOFT_CLIP_CEILING + 1e-4) over++; if (a >= 0.999) over999++; } }
      // the same without the limiter and the ceiling, to see what they had to catch
      const ctx2 = new OfflineAudioContext(2, Math.ceil(SECONDS * SR), SR);
      const g2 = createGraph(ctx2);
      g2.sfxBus.gain.value = SFX_BASE * volumeTaper(c.user); g2.musicBus.gain.value = MUSIC_BASE;
      g2.limiter.threshold.value = 0; g2.limiter.ratio.value = 1; g2.limiter.knee.value = 0; g2.softClip.curve = null;
      for (const id of c.ids) { const idx = sfxIndexOf(id); if (idx < 0) continue; const s2 = ctx2.createBufferSource(); s2.buffer = await get(idx); const gg = ctx2.createGain(); gg.gain.value = c.vol; s2.connect(gg); if (withPanner) { const p = ctx2.createStereoPanner(); gg.connect(p); p.connect(busNode(g2, SOUNDS[idx].recipe.cat)); } else gg.connect(busNode(g2, SOUNDS[idx].recipe.cat)); s2.start(0.1); }
      const raw = await ctx2.startRendering();
      let rawPeak = 0; for (let ch = 0; ch < 2; ch++) { const x = raw.getChannelData(ch); for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > rawPeak) rawPeak = a; } }
      out[name + (withPanner ? ' [with the voice panner, as the engine plays]' : ' [no panner]')] = { sounds: n, peakAfterCeiling: +peak.toFixed(4), peakDb: +(20 * Math.log10(peak)).toFixed(2), samplesOverCeiling: over, samplesAtFullScale: over999, rawPeakWithoutLimiter: +rawPeak.toFixed(2), rawPeakDb: +(20 * Math.log10(rawPeak)).toFixed(1) };
    }
  }
  return JSON.stringify(out);
})()
