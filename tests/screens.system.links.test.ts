import { afterEach, describe, expect, it, vi } from 'vitest';
import { legalLinks, openLegalLink } from '@/app/legalLinks';

const PRIVACY = 'https://example.com/privacy';
const TERMS = 'https://example.com/terms';
const SUPPORT = 'https://example.com/help';

describe('which About rows the build shows', () => {
  it('shows none when no variable is set', () => {
    expect(legalLinks({})).toEqual([]);
  });

  it('shows exactly the rows whose variable is set, in the fixed order', () => {
    expect(legalLinks({ VITE_PRIVACY_URL: PRIVACY })).toEqual([{ id: 'privacy', url: PRIVACY }]);
    expect(legalLinks({ VITE_TERMS_URL: TERMS })).toEqual([{ id: 'terms', url: TERMS }]);
    expect(legalLinks({ VITE_SUPPORT_URL: SUPPORT })).toEqual([{ id: 'support', url: SUPPORT }]);
    expect(legalLinks({ VITE_SUPPORT_URL: SUPPORT, VITE_PRIVACY_URL: PRIVACY }).map((l) => l.id)).toEqual(['privacy', 'support']);
    expect(legalLinks({ VITE_SUPPORT_URL: SUPPORT, VITE_TERMS_URL: TERMS, VITE_PRIVACY_URL: PRIVACY }).map((l) => l.id)).toEqual(['privacy', 'terms', 'support']);
  });

  it('treats an empty or blank variable as unset and trims the rest', () => {
    expect(legalLinks({ VITE_PRIVACY_URL: '', VITE_TERMS_URL: '   ' })).toEqual([]);
    expect(legalLinks({ VITE_PRIVACY_URL: `  ${PRIVACY}\n` })).toEqual([{ id: 'privacy', url: PRIVACY }]);
  });

  it('accepts a mail address for support', () => {
    expect(legalLinks({ VITE_SUPPORT_URL: 'mailto:help@example.com' })).toEqual([{ id: 'support', url: 'mailto:help@example.com' }]);
  });

  it('hides a row whose value is not a web page or a mail address', () => {
    const bad = ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com', 'example.com/privacy', 'https://', 'https://a b.com'];
    for (const url of bad) expect(legalLinks({ VITE_PRIVACY_URL: url }), url).toEqual([]);
  });
});

describe('opening a link', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('opens a web page in a new tab that cannot reach back to the game', () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open, location: { href: 'game' } });
    openLegalLink(PRIVACY);
    expect(open).toHaveBeenCalledWith(PRIVACY, '_blank', 'noopener,noreferrer');
  });

  it('hands a mail address to the mail app without a new tab', () => {
    const open = vi.fn();
    const location = { href: 'game' };
    vi.stubGlobal('window', { open, location });
    openLegalLink('mailto:help@example.com');
    expect(open).not.toHaveBeenCalled();
    expect(location.href).toBe('mailto:help@example.com');
  });
});
