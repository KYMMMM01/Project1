/** The publisher's privacy, terms and support links: set at build time, shown in the settings About block only when present. */

export type LegalLinkId = 'privacy' | 'terms' | 'support';

export interface LegalLink {
  readonly id: LegalLinkId;
  readonly url: string;
}

type LegalEnv = Readonly<Partial<Record<'VITE_PRIVACY_URL' | 'VITE_TERMS_URL' | 'VITE_SUPPORT_URL', string>>>;

/** In the order the rows are shown. */
const SOURCES: readonly (readonly [LegalLinkId, keyof LegalEnv])[] = [
  ['privacy', 'VITE_PRIVACY_URL'],
  ['terms', 'VITE_TERMS_URL'],
  ['support', 'VITE_SUPPORT_URL'],
];

/** Only web pages and a mail address: a typo in a variable must never become a script URL. */
const OPENABLE = /^(https?:\/\/|mailto:)\S+$/i;

/** The links whose variable holds an openable URL, in display order. An unset, blank or malformed variable hides its row. */
export function legalLinks(env: LegalEnv = import.meta.env): LegalLink[] {
  const out: LegalLink[] = [];
  for (const [id, key] of SOURCES) {
    const url = env[key]?.trim();
    if (url && OPENABLE.test(url)) out.push({ id, url });
  }
  return out;
}

/** Web pages open in a new tab without handing it this window; a mail address goes to the mail app and leaves the game where it is. */
export function openLegalLink(url: string): void {
  if (/^mailto:/i.test(url)) window.location.href = url;
  else window.open(url, '_blank', 'noopener,noreferrer');
}
