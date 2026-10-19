/**
 * A very small DOM builder, kept to the handful of calls a plain object stand-in can answer, so the page can be built and driven in the
 * tests without a browser: createElement, createTextNode, setAttribute, appendChild, addEventListener.
 */
export type Child = Node | string | null | false | undefined;

export interface Props {
  /** The `class` attribute. */
  class?: string;
  /** Plain text content (set before the children). */
  text?: string;
  /** Event listeners by type. */
  on?: Record<string, (ev: Event) => void>;
  /** Any other attribute (`data-act`, `type`, `aria-label`...). */
  [attr: string]: string | number | boolean | Record<string, (ev: Event) => void> | undefined;
}

export function h(doc: Document, tag: string, props: Props = {}, ...children: Child[]): HTMLElement {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.setAttribute('class', String(v));
    else if (k === 'text') el.appendChild(doc.createTextNode(String(v)));
    else if (k === 'on') {
      for (const [type, fn] of Object.entries(v as Record<string, (ev: Event) => void>)) el.addEventListener(type, fn);
    } else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === false || c === undefined) continue;
    el.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
  }
  return el;
}

/** Add or remove one class name (the class attribute is a plain space-separated string). */
export function setClass(el: Element, name: string, on: boolean): void {
  const list = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  const i = list.indexOf(name);
  if (on && i < 0) list.push(name);
  if (!on && i >= 0) list.splice(i, 1);
  el.setAttribute('class', list.join(' '));
}

export function hasClass(el: Element, name: string): boolean {
  return (el.getAttribute('class') ?? '').split(/\s+/).includes(name);
}

/** Replace all children. */
export function fill(el: Element, ...children: Child[]): void {
  while (el.firstChild) el.removeChild(el.firstChild);
  const doc = el.ownerDocument;
  for (const c of children) {
    if (c === null || c === false || c === undefined) continue;
    el.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
  }
}
