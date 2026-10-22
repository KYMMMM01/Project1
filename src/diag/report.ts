/**
 * The text of the diagnostics page: what the browser says about itself, what the graphics card is, and the trail the game left (`core/crumbs.ts`). Pure
 * functions of what they are given, so the page's logic is tested without a browser.
 */
import type { Crumb, End } from '@/core/crumbs';

/** The in-app browsers a link opened from a chat or a social app ends up in (they have tighter memory limits than the browser itself). */
const IN_APP: ReadonlyArray<readonly [RegExp, string]> = [
  [/KAKAOTALK/i, 'KakaoTalk'],
  [/NAVER\(inapp|NAVER\/|NaverApp/i, 'Naver'],
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FB_IAB/i, 'Facebook'],
  [/Line\//i, 'LINE'],
  [/DaumApps/i, 'Daum'],
  [/Twitter/i, 'Twitter'],
  [/MicroMessenger/i, 'WeChat'],
];

export interface DeviceInfo {
  /** `iOS 17.4`, `Android 14`, or the platform's own word. */
  system: string;
  /** The app the page runs in when it is not the browser itself, or `none`. */
  inApp: string;
  /** `Safari`, `Chrome`, `Edge`, or `unknown` (a WebView in an app reports no browser of its own). */
  browser: string;
}

/** What a user agent string says about the system and the browser. */
export function readUserAgent(ua: string): DeviceInfo {
  let system = 'unknown';
  const ios = /(?:iPhone|iPad|iPod).*? OS (\d+)[_.](\d+)(?:[_.](\d+))?/.exec(ua);
  const android = /Android (\d+(?:\.\d+)?)/.exec(ua);
  if (ios) system = `iOS ${ios[1]}.${ios[2]}${ios[3] ? '.' + ios[3] : ''}`;
  else if (android) system = `Android ${android[1]}`;
  else if (/Windows/.test(ua)) system = 'Windows';
  else if (/Mac OS X/.test(ua)) system = 'macOS';
  const app = IN_APP.find(([re]) => re.test(ua));
  let browser = 'unknown';
  if (/EdgA?\//.test(ua)) browser = 'Edge';
  else if (/CriOS|Chrome\//.test(ua)) browser = 'Chrome';
  else if (/FxiOS|Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  // An iPhone WebView has "AppleWebKit" and "Mobile" but no "Safari/" token.
  const webview = /AppleWebKit/.test(ua) && /Mobile\//.test(ua) && !/Safari\//.test(ua);
  return { system, inApp: app ? app[1] : webview ? 'a WebView (no browser token)' : 'none', browser };
}

/** `2026-10-23 14:05:09` for a time, in the local zone of the page. */
export function stamp(t: number): string {
  const d = new Date(t);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export interface ReportInput {
  version: string;
  ua: string;
  dpr: number;
  screen: [number, number];
  viewport: [number, number];
  cores: number | null;
  memoryGb: number | null;
  gl: { vendor: string; renderer: string; version: string; maxTexture: number; samples: number } | null;
  ends: readonly End[];
  previousTrail: readonly Crumb[];
  /** Whether the next start of the game is the lean one (core/lean.ts) and why. */
  lean: { lean: boolean; reason: string };
  now: number;
}

/** The report as plain lines. */
export function buildReport(i: ReportInput): string[] {
  const dev = readUserAgent(i.ua);
  const lines: string[] = [];
  lines.push(`Meow Guard diagnostics  (game ${i.version})`);
  lines.push(`taken ${stamp(i.now)}`);
  lines.push('');
  lines.push('DEVICE');
  lines.push(`system:    ${dev.system}`);
  lines.push(`browser:   ${dev.browser}`);
  lines.push(`in an app: ${dev.inApp}`);
  lines.push(`screen:    ${i.screen[0]} x ${i.screen[1]} css px, ratio ${i.dpr}, window ${i.viewport[0]} x ${i.viewport[1]}`);
  lines.push(`cores:     ${i.cores ?? 'unknown'}   memory: ${i.memoryGb === null ? 'not told (Safari never does)' : i.memoryGb + ' GB (rounded)'}`);
  if (i.gl) {
    lines.push(`graphics:  ${i.gl.renderer} (${i.gl.vendor})`);
    lines.push(`           ${i.gl.version}; biggest texture ${i.gl.maxTexture}; multisample ${i.gl.samples}`);
  } else {
    lines.push('graphics:  could not start WebGL here');
  }
  lines.push('');
  lines.push('ENDS WITHOUT LEAVING (the page was closed while it was in front of the player)');
  if (i.ends.length === 0) lines.push('none on record');
  for (const e of i.ends) lines.push(`${stamp(e.t)}   in: ${e.where}`);
  lines.push(`next start is lean: ${i.lean.lean ? 'yes' : 'no'}  (${i.lean.reason})`);
  lines.push('');
  lines.push('TRAIL OF THE LAST GAME PAGE (oldest first)');
  if (i.previousTrail.length === 0) lines.push('none on record');
  for (const c of i.previousTrail) lines.push(`${stamp(c.t)}   ${c.k}${c.d ? ' ' + c.d : ''}`);
  lines.push('');
  lines.push('The trail ends with "hidden" when the player went to another app; any other last line is a page closed in front of the player.');
  return lines;
}
