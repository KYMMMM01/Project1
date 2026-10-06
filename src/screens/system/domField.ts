/**
 * A real <textarea> laid over the canvas: Pixi has no text input, and a paste field has to be a
 * native one so the OS paste menu, selection handles and keyboard work. It is positioned from the
 * on-screen bounds of a placeholder display object.
 */
import type { Container } from 'pixi.js';
import { game } from '@/core/game';
import { Color } from '@/ui/theme';

function css(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

export interface DomFieldOpts {
  readOnly: boolean;
  placeholder?: string;
  value?: string;
}

export class DomTextField {
  readonly el: HTMLTextAreaElement;
  private anchor: Container | null = null;
  private offResize: (() => void) | null = null;

  constructor(o: DomFieldOpts) {
    const el = document.createElement('textarea');
    el.readOnly = o.readOnly;
    el.spellcheck = false;
    el.autocapitalize = 'off';
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('autocorrect', 'off');
    el.placeholder = o.placeholder ?? '';
    el.value = o.value ?? '';
    const s = el.style;
    s.position = 'fixed';
    s.zIndex = '20';
    s.boxSizing = 'border-box';
    s.resize = 'none';
    s.margin = '0';
    s.padding = '12px';
    s.border = `3px solid ${css(Color.neutral)}`;
    s.borderRadius = '14px';
    s.background = css(Color.bgDeep);
    s.color = css(Color.text);
    s.caretColor = css(Color.primary);
    s.fontFamily = 'ui-monospace, Menlo, Consolas, monospace';
    s.fontSize = '14px';
    s.lineHeight = '1.35';
    s.wordBreak = 'break-all';
    s.outline = 'none';
    s.display = 'none';
    document.body.appendChild(el);
    this.el = el;
    this.offResize = game.events.on('resize', () => this.place());
  }

  get value(): string {
    return this.el.value;
  }

  set value(v: string) {
    this.el.value = v;
  }

  /** Cover `anchor` (a Pixi placeholder) and show the field. */
  attach(anchor: Container): void {
    this.anchor = anchor;
    this.place();
    this.el.style.display = 'block';
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  /** Re-fit to the anchor: call after a popup finished its open animation or the screen changed. */
  place(): void {
    const a = this.anchor;
    if (!a || a.destroyed) return;
    const b = a.getBounds();
    const r = game.app.canvas.getBoundingClientRect();
    const s = this.el.style;
    s.left = `${r.left + b.x}px`;
    s.top = `${r.top + b.y}px`;
    s.width = `${b.width}px`;
    s.height = `${b.height}px`;
    // Text must stay legible on a small screen: 14 design px at the current scale, never below 13 CSS px.
    s.fontSize = `${Math.max(13, Math.round(15 * game.scale))}px`;
  }

  selectAll(): void {
    this.el.focus();
    this.el.select();
  }

  destroy(): void {
    this.offResize?.();
    this.offResize = null;
    this.el.remove();
    this.anchor = null;
  }
}
