(async () => {
  // A checksum of every baked sound (all variants, 48 kHz): which sounds are different between two trees of the game (the same script runs against the old tree and the new one).
  const { SOUNDS } = await import('/src/audio/sounds.ts');
  const { bakeVariant } = await import('/src/audio/bake.ts');
  const out = {};
  for (const def of SOUNDS) {
    if (def.recipe.legacy) continue;
    const nv = def.recipe.variants ?? 1;
    const h = [];
    for (let v = 0; v < nv; v++) {
      const x = (await bakeVariant(def.recipe, def.key, v, 48000)).buffer.getChannelData(0);
      let s1 = 0, s2 = 0, pk = 0;
      for (let i = 0; i < x.length; i++) { s1 += x[i] * Math.sin(i * 0.001 + 1); s2 += x[i] * x[i]; if (Math.abs(x[i]) > pk) pk = Math.abs(x[i]); }
      h.push([x.length, +s1.toFixed(4), +s2.toFixed(4), +pk.toFixed(4)]);
    }
    out[def.id] = h;
  }
  return JSON.stringify(out);
})()
