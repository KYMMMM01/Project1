/**
 * Opens the sound board on the game's page (`?scene=sounds`). It is a plain-DOM page over the game's own audio engine: the game itself (the
 * canvas, the profile, the save) is never started, so the board changes nothing the owner has. Called from `main.ts` before anything else.
 */
import { audioStats } from '@/audio';
import { candidateKey, candidateUrl, loadManifest } from './candidates';
import { engineAudio } from './engineAudio';
import { SampleEngine } from './samples';
import { mountBoard, type BoardHandle } from './view';
import type { Candidate, Manifest } from './types';

declare global {
  interface Window {
    /** QA hook: the mounted board and the engine's counters. */
    __soundboard?: { board: BoardHandle; stats: () => ReturnType<typeof audioStats> };
  }
}

export function openSoundBoard(): BoardHandle {
  const doc = document;
  doc.title = '냥이 수비대 소리판';
  // The page's own splash and canvas holder are not wanted here.
  doc.getElementById('boot')?.remove();
  const stage = doc.getElementById('stage');
  if (stage) stage.style.display = 'none';

  const base = doc.baseURI;
  const byKey = new Map<string, Candidate>();
  const samples = new SampleEngine(
    (key) => byKey.get(key),
    (file) => candidateUrl(file, base),
  );
  let storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;
  try {
    storage = window.localStorage;
  } catch {
    storage = undefined;
  }
  const board = mountBoard(doc.body, {
    doc,
    audio: engineAudio(),
    samples,
    timers: { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
    base,
    manifest: () => loadManifest(base),
    onManifest(m: Manifest) {
      for (const c of m.files) byKey.set(candidateKey(c), c);
    },
    storage,
  });
  window.__soundboard = { board, stats: () => audioStats() };
  return board;
}
