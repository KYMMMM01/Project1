import { describe, expect, it } from 'vitest';
import { isDiagRoute } from '@/diag/route';
import { buildReport, readUserAgent, stamp } from '@/diag/report';

const SAFARI_IOS17 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1';
const KAKAO_IOS16 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.1';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const EDGE_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';

describe('the user agent', () => {
  it('reads the iOS version and Safari', () => {
    expect(readUserAgent(SAFARI_IOS17)).toEqual({ system: 'iOS 17.4.1', inApp: 'none', browser: 'Safari' });
  });

  it("names KakaoTalk's own browser, which has no browser token of its own", () => {
    const d = readUserAgent(KAKAO_IOS16);
    expect(d.system).toBe('iOS 16.6');
    expect(d.inApp).toBe('KakaoTalk');
    expect(d.browser).toBe('unknown');
  });

  it('tells a WebView with no app name from a browser', () => {
    const d = readUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
    expect(d.inApp).toContain('WebView');
  });

  it('reads the other systems and browsers a tester may have', () => {
    expect(readUserAgent(CHROME_IOS)).toMatchObject({ system: 'iOS 17.2', browser: 'Chrome', inApp: 'none' });
    expect(readUserAgent(ANDROID)).toMatchObject({ system: 'Android 14', browser: 'Chrome' });
    expect(readUserAgent(EDGE_WIN)).toMatchObject({ system: 'Windows', browser: 'Edge' });
  });
});

describe('the report', () => {
  const base = {
    version: '0.1.0',
    ua: KAKAO_IOS16,
    dpr: 3,
    screen: [390, 844] as [number, number],
    viewport: [390, 664] as [number, number],
    cores: 6,
    memoryGb: null,
    gl: { vendor: 'Apple Inc.', renderer: 'Apple GPU', version: 'WebGL 2.0', maxTexture: 8192, samples: 4 },
    ends: [{ t: new Date(2026, 9, 22, 21, 5, 9).getTime(), where: 'BattleScene' }],
    previousTrail: [{ t: new Date(2026, 9, 22, 21, 5, 9).getTime(), k: 'scene', d: 'BattleScene' }],
    lean: { lean: false, reason: '1 end in the last 24 hours (lean from 2)' },
    now: new Date(2026, 9, 23, 9, 0, 0).getTime(),
  };

  it('says the device, the app, the graphics and where the game ended', () => {
    const text = buildReport(base).join('\n');
    expect(text).toContain('iOS 16.6');
    expect(text).toContain('in an app: KakaoTalk');
    expect(text).toContain('Apple GPU');
    expect(text).toContain('2026-10-22 21:05:09   in: BattleScene');
    expect(text).toContain('memory: not told');
    expect(text).toContain('next start is lean: no  (1 end in the last 24 hours (lean from 2))');
  });

  it('says so when there is nothing on record or no graphics', () => {
    const text = buildReport({ ...base, gl: null, ends: [], previousTrail: [] }).join('\n');
    expect(text).toContain('could not start WebGL');
    expect(text.match(/none on record/g)).toHaveLength(2);
  });

  it('writes a time the way a person reads it', () => {
    expect(stamp(new Date(2026, 0, 5, 3, 4, 5).getTime())).toBe('2026-01-05 03:04:05');
  });
});

describe('the route', () => {
  it('is ?scene=diag and nothing else', () => {
    expect(isDiagRoute('?scene=diag')).toBe(true);
    expect(isDiagRoute('?debug=1&scene=diag')).toBe(true);
    expect(isDiagRoute('?scene=sounds')).toBe(false);
    expect(isDiagRoute('')).toBe(false);
  });
});
