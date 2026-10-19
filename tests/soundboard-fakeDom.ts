/**
 * A tiny stand-in for the browser DOM, just enough for the sound board's page builder (`src/soundboard/dom.ts` is written to the same handful of
 * calls): elements with attributes, children and listeners, text nodes, a document with a head and a body. Tests find nodes by attribute and
 * "click" them; nothing here knows about audio.
 */
export class FakeText {
  readonly nodeType = 3;
  parentNode: FakeElement | null = null;
  constructor(public data: string) {}
  get textContent(): string {
    return this.data;
  }
}

type Listener = (ev: { type: string; target: unknown }) => void;

export class FakeElement {
  readonly nodeType = 1;
  readonly attrs = new Map<string, string>();
  readonly childNodes: Array<FakeElement | FakeText> = [];
  readonly listeners = new Map<string, Listener[]>();
  parentNode: FakeElement | null = null;
  /** The `value` property of an input (the page reads it on `input`). */
  value = '';
  scrolled = 0;

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}

  get firstChild(): FakeElement | FakeText | null {
    return this.childNodes[0] ?? null;
  }

  get textContent(): string {
    return this.childNodes.map((c) => c.textContent).join('');
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  appendChild<T extends FakeElement | FakeText>(child: T): T {
    child.parentNode?.removeChild(child);
    this.childNodes.push(child);
    child.parentNode = this;
    return child;
  }

  removeChild<T extends FakeElement | FakeText>(child: T): T {
    const i = this.childNodes.indexOf(child);
    if (i >= 0) this.childNodes.splice(i, 1);
    child.parentNode = null;
    return child;
  }

  addEventListener(type: string, fn: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, fn: Listener): void {
    const list = this.listeners.get(type);
    if (list) this.listeners.set(type, list.filter((f) => f !== fn));
  }

  /** Fire the listeners of `type` on this element only (no bubbling: the page puts its handlers on the elements themselves). */
  dispatch(type: string): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn({ type, target: this });
  }

  click(): void {
    this.dispatch('click');
  }

  scrollIntoView(): void {
    this.scrolled++;
  }

  /** Every descendant element (depth first). */
  all(): FakeElement[] {
    const out: FakeElement[] = [];
    const walk = (n: FakeElement): void => {
      for (const c of n.childNodes) {
        if (c instanceof FakeElement) {
          out.push(c);
          walk(c);
        }
      }
    };
    walk(this);
    return out;
  }

  /** The descendants whose attributes include all of `attrs`. */
  where(attrs: Record<string, string>): FakeElement[] {
    return this.all().filter((e) => Object.entries(attrs).every(([k, v]) => e.attrs.get(k) === v));
  }

  /** The one descendant that matches (throws when there is none, so a test says what is missing). */
  one(attrs: Record<string, string>): FakeElement {
    const found = this.where(attrs);
    const first = found[0];
    if (!first) throw new Error(`no element with ${JSON.stringify(attrs)}`);
    return first;
  }

  hasClass(name: string): boolean {
    return (this.attrs.get('class') ?? '').split(/\s+/).includes(name);
  }
}

export class FakeDocument {
  title = '';
  hidden = false;
  baseURI = 'https://example.test/Project1/';
  readonly head = new FakeElement('head', this);
  readonly body = new FakeElement('body', this);
  readonly documentElement = new FakeElement('html', this);
  readonly listeners = new Map<string, Listener[]>();

  createElement(tag: string): FakeElement {
    return new FakeElement(tag, this);
  }

  createTextNode(text: string): FakeText {
    return new FakeText(text);
  }

  getElementById(): null {
    return null;
  }

  addEventListener(type: string, fn: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, fn: Listener): void {
    const list = this.listeners.get(type);
    if (list) this.listeners.set(type, list.filter((f) => f !== fn));
  }

  fire(type: string): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn({ type, target: this });
  }
}
