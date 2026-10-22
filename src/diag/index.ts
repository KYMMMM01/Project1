/**
 * Opens the diagnostics page on the game's page (`?scene=diag`): plain DOM text, no canvas, no profile and no save. Called from `main.ts` before the game starts.
 * The owner sends the link to a tester whose game keeps closing, and reads the device, the browser (or the app that opens links in its own), the graphics card, and
 * where the last page of the game ended.
 */
import { endsWithin, readStore } from '@/core/crumbs';
import { LEAN_WINDOW_MS, decideLean } from '@/core/lean';
import { GAME_VERSION } from '@/screens/system/strings';
import { buildReport, type ReportInput } from './report';

function glInfo(): ReportInput['gl'] {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const text = (param: number): string => String(gl.getParameter(param));
    return {
      vendor: ext ? text(ext.UNMASKED_VENDOR_WEBGL) : text(gl.VENDOR),
      renderer: ext ? text(ext.UNMASKED_RENDERER_WEBGL) : text(gl.RENDERER),
      version: text(gl.VERSION),
      maxTexture: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
      samples: Number(gl.getParameter(gl.SAMPLES)),
    };
  } catch {
    return null;
  }
}

export function openDiag(): string[] {
  const doc = document;
  doc.title = 'Meow Guard diagnostics';
  doc.getElementById('boot')?.remove();
  const stage = doc.getElementById('stage');
  if (stage) stage.style.display = 'none';
  const store = readStore();
  const now = Date.now();
  const lean = decideLean(endsWithin(store, now, LEAN_WINDOW_MS).count, new URLSearchParams(location.search).get('lean'));
  const lines = buildReport({
    version: GAME_VERSION,
    ua: navigator.userAgent,
    dpr: window.devicePixelRatio || 1,
    screen: [screen.width, screen.height],
    viewport: [window.innerWidth, window.innerHeight],
    cores: navigator.hardwareConcurrency ?? null,
    memoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    gl: glInfo(),
    ends: store.ends,
    previousTrail: store.crumbs,
    lean,
    now,
  });
  const body = doc.body;
  body.style.cssText = 'margin:0;padding:16px;background:#fbf3e2;color:#4a3222;overflow:auto;position:static;width:auto;height:auto;touch-action:auto;-webkit-user-select:text;user-select:text';
  doc.documentElement.style.cssText = 'overflow:auto;height:auto;touch-action:auto';
  const pre = doc.createElement('pre');
  pre.style.cssText = 'font:13px/1.45 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word;margin:0';
  pre.textContent = lines.join('\n');
  const copy = doc.createElement('button');
  copy.textContent = 'Copy';
  copy.style.cssText = 'margin-top:14px;padding:10px 22px;font:16px system-ui,sans-serif';
  copy.onclick = () => {
    void navigator.clipboard?.writeText(lines.join('\n')).catch(() => undefined);
  };
  body.append(pre, copy);
  return lines;
}
